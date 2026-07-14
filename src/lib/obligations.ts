import { prisma } from "./db";
import { recordAudit } from "./audit";
import type { ObligationType } from "./constants";

/** An obligation is OVERDUE when it is still OPEN and its dueDate has passed. */
export function isOverdue(o: {
  status: string;
  dueDate: Date | null;
}): boolean {
  return o.status === "OPEN" && !!o.dueDate && o.dueDate.getTime() < Date.now();
}

export function effectiveStatus(o: {
  status: string;
  dueDate: Date | null;
}): "OPEN" | "DONE" | "WAIVED" | "OVERDUE" {
  if (isOverdue(o)) return "OVERDUE";
  return o.status as "OPEN" | "DONE" | "WAIVED";
}

export async function addObligation(
  contractId: string,
  input: {
    title: string;
    description?: string | null;
    type: ObligationType;
    dueDate?: Date | null;
    ownerId?: string | null;
  },
  actor: { id: string; name: string }
) {
  const ob = await prisma.obligation.create({
    data: {
      contractId,
      title: input.title,
      description: input.description ?? null,
      type: input.type,
      dueDate: input.dueDate ?? null,
      ownerId: input.ownerId ?? null,
      status: "OPEN",
    },
  });
  await recordAudit(prisma, {
    contractId,
    entityType: "OBLIGATION",
    entityId: ob.id,
    action: "OBLIGATION_ADDED",
    summary: `Obligation added: "${input.title}"`,
    actorId: actor.id,
    actorLabel: actor.name,
  });
  return ob;
}

export async function setObligationStatus(
  obligationId: string,
  status: "OPEN" | "DONE" | "WAIVED",
  actor: { id: string; name: string }
) {
  const ob = await prisma.obligation.update({
    where: { id: obligationId },
    data: { status },
  });
  await recordAudit(prisma, {
    contractId: ob.contractId,
    entityType: "OBLIGATION",
    entityId: ob.id,
    action: "OBLIGATION_STATUS",
    summary: `Obligation "${ob.title}" marked ${status}`,
    actorId: actor.id,
    actorLabel: actor.name,
  });
  return ob;
}

/** Obligations due within the given window (days), still open, soonest first. */
export async function upcomingObligations(days = 30) {
  const horizon = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return prisma.obligation.findMany({
    where: {
      status: "OPEN",
      dueDate: { not: null, lte: horizon },
    },
    orderBy: { dueDate: "asc" },
    include: { contract: true, owner: true },
  });
}
