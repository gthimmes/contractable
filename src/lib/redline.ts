import { prisma } from "./db";
import { recordAudit } from "./audit";
import { makeVersion } from "./contracts";

/**
 * Propose a redlined revision of a contract. This creates a PROPOSED version
 * (based on the current version) that sits alongside the current text until an
 * owner accepts or rejects it — the heart of contract negotiation. The current
 * version is unchanged, so the diff between them is the "redline".
 */
export async function proposeRedline(
  contractId: string,
  body: string,
  note: string | null,
  actor: { id: string; name: string }
) {
  return prisma.$transaction(async (tx) => {
    const contract = await tx.contract.findUniqueOrThrow({
      where: { id: contractId },
    });
    const version = await makeVersion(tx, {
      contractId,
      body,
      note: note ?? "Proposed redline",
      createdById: actor.id,
      origin: "REDLINE",
      status: "PROPOSED",
      basedOnVersionId: contract.currentVersionId,
      makeCurrent: false,
    });
    await recordAudit(tx, {
      contractId,
      entityType: "CONTRACT",
      entityId: version.id,
      action: "REDLINE_PROPOSED",
      summary: `${actor.name} proposed a redline (v${version.versionNumber})${
        note ? ` — ${note}` : ""
      }`,
      actorId: actor.id,
      actorLabel: actor.name,
    });
    return version;
  });
}

/** Accept a proposed redline: it becomes the current version. */
export async function acceptRedline(
  versionId: string,
  actor: { id: string; name: string }
) {
  return prisma.$transaction(async (tx) => {
    const version = await tx.contractVersion.findUniqueOrThrow({
      where: { id: versionId },
    });
    if (version.status !== "PROPOSED") {
      throw new Error("Only a proposed redline can be accepted.");
    }
    const contract = await tx.contract.findUniqueOrThrow({
      where: { id: version.contractId },
    });
    if (contract.currentVersionId && contract.currentVersionId !== version.id) {
      await tx.contractVersion.update({
        where: { id: contract.currentVersionId },
        data: { status: "SUPERSEDED" },
      });
    }
    await tx.contractVersion.update({
      where: { id: version.id },
      data: { status: "CURRENT" },
    });
    await tx.contract.update({
      where: { id: version.contractId },
      data: { currentVersionId: version.id },
    });
    await recordAudit(tx, {
      contractId: version.contractId,
      entityType: "CONTRACT",
      entityId: version.id,
      action: "REDLINE_ACCEPTED",
      summary: `${actor.name} accepted redline v${version.versionNumber} as the current text`,
      actorId: actor.id,
      actorLabel: actor.name,
    });
    return version;
  });
}

/** Reject a proposed redline: it is marked REJECTED and never becomes current. */
export async function rejectRedline(
  versionId: string,
  reason: string | null,
  actor: { id: string; name: string }
) {
  return prisma.$transaction(async (tx) => {
    const version = await tx.contractVersion.findUniqueOrThrow({
      where: { id: versionId },
    });
    if (version.status !== "PROPOSED") {
      throw new Error("Only a proposed redline can be rejected.");
    }
    await tx.contractVersion.update({
      where: { id: version.id },
      data: { status: "REJECTED" },
    });
    await recordAudit(tx, {
      contractId: version.contractId,
      entityType: "CONTRACT",
      entityId: version.id,
      action: "REDLINE_REJECTED",
      summary: `${actor.name} rejected redline v${version.versionNumber}${
        reason ? ` — ${reason}` : ""
      }`,
      actorId: actor.id,
      actorLabel: actor.name,
    });
    return version;
  });
}
