import { createHash } from "crypto";
import type { Prisma, PrismaClient } from "@prisma/client";

// A Prisma client OR an interactive-transaction client — audit writes must be
// able to participate in the same transaction as the change they record.
export type Db = PrismaClient | Prisma.TransactionClient;

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

const GENESIS_HASH = "0".repeat(64);

export interface AuditInput {
  contractId?: string | null;
  entityType: "CONTRACT" | "WORKFLOW" | "STEP" | "SIGNATURE" | "OBLIGATION";
  entityId: string;
  action: string;
  summary: string;
  actorId?: string | null;
  actorLabel?: string | null;
  data?: unknown;
}

/**
 * Append an event to the tamper-evident, hash-chained audit log.
 * Each event's hash covers the previous event's hash, so any retroactive edit
 * breaks the chain from that point forward (see verifyAuditChain).
 */
export async function recordAudit(db: Db, input: AuditInput) {
  const last = await db.auditEvent.findFirst({
    orderBy: { createdAt: "desc" },
    select: { hash: true },
  });
  const prevHash = last?.hash ?? GENESIS_HASH;
  const createdAt = new Date();
  const dataJson = input.data === undefined ? null : JSON.stringify(input.data);

  const hash = sha256(
    [
      prevHash,
      input.entityType,
      input.entityId,
      input.action,
      input.summary,
      input.actorId ?? "",
      dataJson ?? "",
      createdAt.toISOString(),
    ].join("|")
  );

  return db.auditEvent.create({
    data: {
      contractId: input.contractId ?? null,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      summary: input.summary,
      actorId: input.actorId ?? null,
      actorLabel: input.actorLabel ?? null,
      dataJson,
      prevHash,
      hash,
      createdAt,
    },
  });
}

/**
 * Recompute the chain and report the first event (if any) whose stored hash
 * does not match its recomputed value — i.e. evidence of tampering.
 */
export async function verifyAuditChain(db: Db): Promise<{
  ok: boolean;
  count: number;
  brokenAt?: string;
}> {
  const events = await db.auditEvent.findMany({ orderBy: { createdAt: "asc" } });
  let prevHash = GENESIS_HASH;
  for (const e of events) {
    const expected = sha256(
      [
        prevHash,
        e.entityType,
        e.entityId,
        e.action,
        e.summary,
        e.actorId ?? "",
        e.dataJson ?? "",
        e.createdAt.toISOString(),
      ].join("|")
    );
    if (expected !== e.hash || e.prevHash !== prevHash) {
      return { ok: false, count: events.length, brokenAt: e.id };
    }
    prevHash = e.hash;
  }
  return { ok: true, count: events.length };
}
