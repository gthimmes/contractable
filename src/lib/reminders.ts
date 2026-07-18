import { prisma } from "./db";
import { queueEmail, appUrl } from "./email";

// Proactive enforcement: a periodic sweep that emails obligation owners about
// upcoming/overdue items and contract owners about expiring contracts. A
// ReminderLog row per (entity, kind) send de-duplicates, so a weekly cadence
// emerges naturally from the cooldown rather than from scheduler precision.
//
// Two triggers, no cron infrastructure required:
//   - maybeRunSweep(): called on app traffic; runs at most every 12h, detached.
//   - GET /api/cron/reminders: for real schedulers (optionally CRON_SECRET-protected).

export const UPCOMING_DAYS = 7; // obligations due within a week
export const EXPIRING_DAYS = 30; // contracts expiring within a month
export const COOLDOWN_DAYS = 7; // minimum gap between repeat reminders
export const SIGNER_COOLDOWN_DAYS = 3; // pending signers are nudged more often
export const SWEEP_INTERVAL_MS = 12 * 60 * 60 * 1000;

const DAY = 24 * 60 * 60 * 1000;

// --- Pure selection logic (unit-tested) ------------------------------------

export function classifyObligation(
  o: { status: string; dueDate: Date | null },
  now: Date
): "OVERDUE" | "UPCOMING" | null {
  if (o.status !== "OPEN" || !o.dueDate) return null;
  const t = o.dueDate.getTime();
  if (t < now.getTime()) return "OVERDUE";
  if (t <= now.getTime() + UPCOMING_DAYS * DAY) return "UPCOMING";
  return null;
}

export function isExpiringContract(
  c: { status: string; expirationDate: Date | null },
  now: Date
): boolean {
  return (
    c.status === "EXECUTED" &&
    !!c.expirationDate &&
    c.expirationDate.getTime() <= now.getTime() + EXPIRING_DAYS * DAY
  );
}

/** Should we send again, given the last time this exact reminder went out? */
export function needsReminder(
  lastSentAt: Date | null,
  now: Date,
  cooldownDays = COOLDOWN_DAYS
): boolean {
  if (!lastSentAt) return true;
  return now.getTime() - lastSentAt.getTime() >= cooldownDays * DAY;
}

// --- Sweep ------------------------------------------------------------------

async function lastSend(entityType: string, entityId: string, kind: string) {
  const row = await prisma.reminderLog.findFirst({
    where: { entityType, entityId, kind },
    orderBy: { sentAt: "desc" },
  });
  return row?.sentAt ?? null;
}

export interface SweepResult {
  obligationReminders: number;
  contractReminders: number;
  signerReminders: number;
}

/** Run one reminder sweep. Idempotent within the cooldown window. */
export async function runReminderSweep(now = new Date()): Promise<SweepResult> {
  let obligationReminders = 0;
  let contractReminders = 0;
  let signerReminders = 0;

  // Obligations due soon or overdue, still open.
  const horizon = new Date(now.getTime() + UPCOMING_DAYS * DAY);
  const obligations = await prisma.obligation.findMany({
    where: { status: "OPEN", dueDate: { not: null, lte: horizon } },
    include: { owner: true, contract: { include: { owner: true, createdBy: true } } },
  });

  for (const o of obligations) {
    const kind = classifyObligation(o, now);
    if (!kind) continue;
    const recipient = o.owner ?? o.contract.owner ?? o.contract.createdBy;
    if (!recipient) continue;
    if (!needsReminder(await lastSend("OBLIGATION", o.id, kind), now)) continue;

    const due = o.dueDate!.toISOString().slice(0, 10);
    await queueEmail(prisma, {
      toEmail: recipient.email,
      toName: recipient.name,
      subject:
        kind === "OVERDUE"
          ? `OVERDUE: ${o.title} (${o.contract.reference})`
          : `Due soon: ${o.title} (${o.contract.reference})`,
      body:
        `Hi ${recipient.name},\n\n` +
        `The obligation "${o.title}" on contract ${o.contract.reference} — ` +
        `${o.contract.title} is ${kind === "OVERDUE" ? `overdue (was due ${due})` : `due ${due}`}.\n\n` +
        `Review it here: ${appUrl()}/contracts/${o.contractId}\n\n` +
        `You're receiving this because you own the obligation or the contract.`,
      kind: "REMINDER",
      contractId: o.contractId,
    });
    await prisma.reminderLog.create({
      data: { entityType: "OBLIGATION", entityId: o.id, kind },
    });
    obligationReminders++;
  }

  // Executed contracts nearing (or past) their expiration date.
  const expHorizon = new Date(now.getTime() + EXPIRING_DAYS * DAY);
  const contracts = await prisma.contract.findMany({
    where: { status: "EXECUTED", expirationDate: { not: null, lte: expHorizon } },
    include: { owner: true, createdBy: true },
  });

  for (const c of contracts) {
    const recipient = c.owner ?? c.createdBy;
    if (!recipient) continue;
    if (!needsReminder(await lastSend("CONTRACT", c.id, "EXPIRING"), now)) continue;

    const exp = c.expirationDate!.toISOString().slice(0, 10);
    const past = c.expirationDate!.getTime() < now.getTime();
    await queueEmail(prisma, {
      toEmail: recipient.email,
      toName: recipient.name,
      subject: past
        ? `Expired: ${c.reference} — ${c.title}`
        : `Expiring ${exp}: ${c.reference} — ${c.title}`,
      body:
        `Hi ${recipient.name},\n\n` +
        `Contract ${c.reference} — ${c.title} ${past ? `expired on ${exp}` : `expires on ${exp}`}. ` +
        `If it should renew, start the renewal now; otherwise plan the wind-down.\n\n` +
        `Open it here: ${appUrl()}/contracts/${c.id}`,
      kind: "REMINDER",
      contractId: c.id,
    });
    await prisma.reminderLog.create({
      data: { entityType: "CONTRACT", entityId: c.id, kind: "EXPIRING" },
    });
    contractReminders++;
  }

  // Pending signers whose turn it is (ordered signing: lowest incomplete
  // order), on contracts still out for signature, with a live link.
  const pending = await prisma.signature.findMany({
    where: { status: "PENDING", contract: { status: "OUT_FOR_SIGNATURE" } },
    include: { contract: true },
    orderBy: { order: "asc" },
  });
  const nudgedContracts = new Set<string>();
  for (const sig of pending) {
    if (nudgedContracts.has(sig.contractId)) continue; // only the blocked signer
    nudgedContracts.add(sig.contractId);
    if (sig.expiresAt && sig.expiresAt.getTime() < now.getTime()) continue; // expired → re-issue path
    const last = await lastSend("SIGNATURE", sig.id, "PENDING");
    if (!needsReminder(last, now, SIGNER_COOLDOWN_DAYS)) continue;
    // Don't nudge within the first cooldown after the original request either.
    if (now.getTime() - sig.createdAt.getTime() < SIGNER_COOLDOWN_DAYS * DAY) continue;

    await queueEmail(prisma, {
      toEmail: sig.signerEmail,
      toName: sig.signerName,
      subject: `Reminder to sign: ${sig.contract.reference} — ${sig.contract.title}`,
      body:
        `Hi ${sig.signerName},\n\n` +
        `"${sig.contract.title}" (${sig.contract.reference}) is still waiting on your signature.\n\n` +
        `Review & sign here: ${appUrl()}/sign/${sig.token}\n\n— Contractable`,
      kind: "REMINDER",
      contractId: sig.contractId,
    });
    await prisma.reminderLog.create({
      data: { entityType: "SIGNATURE", entityId: sig.id, kind: "PENDING" },
    });
    signerReminders++;
  }

  await prisma.systemState.upsert({
    where: { key: "reminders:lastRun" },
    update: { value: now.toISOString() },
    create: { key: "reminders:lastRun", value: now.toISOString() },
  });

  return { obligationReminders, contractReminders, signerReminders };
}

/**
 * Lazy trigger: run the sweep if it hasn't run in SWEEP_INTERVAL_MS. The
 * lastRun marker is written before the sweep starts (best-effort lock), and
 * the sweep itself runs detached so page loads never wait on it.
 */
export async function maybeRunSweep(): Promise<void> {
  const state = await prisma.systemState.findUnique({ where: { key: "reminders:lastRun" } });
  const last = state ? Date.parse(state.value) : 0;
  if (Date.now() - last < SWEEP_INTERVAL_MS) return;
  await prisma.systemState.upsert({
    where: { key: "reminders:lastRun" },
    update: { value: new Date().toISOString() },
    create: { key: "reminders:lastRun", value: new Date().toISOString() },
  });
  void runReminderSweep().then(
    (r) =>
      (r.obligationReminders || r.contractReminders || r.signerReminders) &&
      console.log(
        `[reminders] sweep: ${r.obligationReminders} obligation, ${r.contractReminders} contract, ${r.signerReminders} signer reminder(s) sent`
      ),
    (err) => console.error("[reminders] sweep failed:", err)
  );
}
