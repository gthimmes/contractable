import { prisma } from "./db";
import { recordAudit, sha256, type Db } from "./audit";
import type { VersionOrigin } from "./constants";

export interface CreateContractInput {
  title: string;
  description?: string | null;
  counterparty?: string | null;
  counterpartyId?: string | null;
  category?: string | null;
  value?: number | null;
  currency?: string | null;
  effectiveDate?: Date | null;
  expirationDate?: Date | null;
  createdById: string;
  ownerId?: string | null;
  templateId?: string | null;
  dataJson?: string | null;
  body: string;
}

async function nextReference(db: Db): Promise<string> {
  const count = await db.contract.count();
  return `CTR-${String(count + 1).padStart(4, "0")}`;
}

/**
 * Low-level version writer. Creates a new version row; when makeCurrent is set,
 * it supersedes the prior current version and points the contract at the new
 * one. Used by manual edits, document generation, and accepted redlines.
 */
export async function makeVersion(
  db: Db,
  params: {
    contractId: string;
    body: string;
    note?: string | null;
    createdById: string;
    origin: VersionOrigin;
    status?: "CURRENT" | "PROPOSED";
    basedOnVersionId?: string | null;
    makeCurrent: boolean;
    resetToDraft?: boolean;
  }
) {
  const latest = await db.contractVersion.findFirst({
    where: { contractId: params.contractId },
    orderBy: { versionNumber: "desc" },
  });
  const versionNumber = (latest?.versionNumber ?? 0) + 1;

  const version = await db.contractVersion.create({
    data: {
      contractId: params.contractId,
      versionNumber,
      body: params.body,
      contentHash: sha256(params.body),
      createdById: params.createdById,
      note: params.note ?? null,
      origin: params.origin,
      status: params.status ?? (params.makeCurrent ? "CURRENT" : "PROPOSED"),
      basedOnVersionId: params.basedOnVersionId ?? null,
    },
  });

  if (params.makeCurrent) {
    const contract = await db.contract.findUniqueOrThrow({
      where: { id: params.contractId },
    });
    if (contract.currentVersionId && contract.currentVersionId !== version.id) {
      await db.contractVersion.update({
        where: { id: contract.currentVersionId },
        data: { status: "SUPERSEDED" },
      });
    }
    await db.contract.update({
      where: { id: params.contractId },
      data: {
        currentVersionId: version.id,
        ...(params.resetToDraft ? { status: "DRAFT" } : {}),
      },
    });
  }

  return version;
}

/**
 * Create a contract in DRAFT with an initial version (v1). The version body is
 * content-hashed so signatures and the audit trail can anchor to exact text.
 */
export async function createContract(
  input: CreateContractInput,
  actor: { id: string; name: string }
) {
  return prisma.$transaction(async (tx) => {
    const reference = await nextReference(tx);
    const contract = await tx.contract.create({
      data: {
        reference,
        title: input.title,
        description: input.description ?? null,
        counterparty: input.counterparty ?? null,
        counterpartyId: input.counterpartyId ?? null,
        category: input.category ?? null,
        value: input.value ?? null,
        currency: input.currency ?? "USD",
        effectiveDate: input.effectiveDate ?? null,
        expirationDate: input.expirationDate ?? null,
        createdById: input.createdById,
        ownerId: input.ownerId ?? input.createdById,
        templateId: input.templateId ?? null,
        dataJson: input.dataJson ?? null,
        status: "DRAFT",
      },
    });

    await makeVersion(tx, {
      contractId: contract.id,
      body: input.body,
      note: "Initial draft",
      createdById: input.createdById,
      origin: "MANUAL",
      makeCurrent: true,
    });

    await recordAudit(tx, {
      contractId: contract.id,
      entityType: "CONTRACT",
      entityId: contract.id,
      action: "CONTRACT_CREATED",
      summary: `Created contract ${reference} — "${input.title}"`,
      actorId: actor.id,
      actorLabel: actor.name,
    });

    return tx.contract.findUniqueOrThrow({ where: { id: contract.id } });
  });
}

/** Add a new manual version to a contract and make it current (resets to DRAFT). */
export async function addVersion(
  contractId: string,
  body: string,
  note: string | null,
  actor: { id: string; name: string }
) {
  return prisma.$transaction(async (tx) => {
    const version = await makeVersion(tx, {
      contractId,
      body,
      note,
      createdById: actor.id,
      origin: "MANUAL",
      makeCurrent: true,
      resetToDraft: true,
    });
    await recordAudit(tx, {
      contractId,
      entityType: "CONTRACT",
      entityId: contractId,
      action: "VERSION_ADDED",
      summary: `Added version ${version.versionNumber}${note ? ` — ${note}` : ""}`,
      actorId: actor.id,
      actorLabel: actor.name,
    });
    return version;
  });
}

export interface UpdateContractInput {
  title?: string;
  description?: string | null;
  counterparty?: string | null;
  counterpartyId?: string | null;
  category?: string | null;
  value?: number | null;
  currency?: string | null;
  effectiveDate?: Date | null;
  expirationDate?: Date | null;
  ownerId?: string | null;
  dataJson?: string | null;
}

/** Edit contract metadata (not the document body — that flows through versions). */
export async function updateContract(
  contractId: string,
  input: UpdateContractInput,
  actor: { id: string; name: string }
) {
  const contract = await prisma.contract.update({
    where: { id: contractId },
    data: { ...input },
  });
  await recordAudit(prisma, {
    contractId,
    entityType: "CONTRACT",
    entityId: contractId,
    action: "CONTRACT_UPDATED",
    summary: `Updated contract details for ${contract.reference}`,
    actorId: actor.id,
    actorLabel: actor.name,
  });
  return contract;
}

/**
 * Permanently delete a contract and everything hanging off it. Children are
 * removed in explicit dependency order (self-referential version lineage and
 * the contract↔current-version pointer make blanket cascades order-sensitive on
 * SQLite). Guarded to sensible states in the action layer.
 */
export async function deleteContract(contractId: string) {
  await prisma.$transaction(async (tx) => {
    await tx.auditEvent.deleteMany({ where: { contractId } });
    await tx.signature.deleteMany({ where: { contractId } });
    const instances = await tx.workflowInstance.findMany({
      where: { contractId },
      select: { id: true },
    });
    const instanceIds = instances.map((i) => i.id);
    const steps = await tx.workflowStepInstance.findMany({
      where: { instanceId: { in: instanceIds } },
      select: { id: true },
    });
    await tx.workflowStepAction.deleteMany({
      where: { stepId: { in: steps.map((s) => s.id) } },
    });
    await tx.workflowStepInstance.deleteMany({
      where: { instanceId: { in: instanceIds } },
    });
    await tx.workflowInstance.deleteMany({ where: { contractId } });
    await tx.obligation.deleteMany({ where: { contractId } });
    await tx.comment.deleteMany({ where: { contractId } });
    // Break the contract↔current-version and version↔basedOn references first.
    await tx.contract.update({
      where: { id: contractId },
      data: { currentVersionId: null },
    });
    await tx.contractVersion.updateMany({
      where: { contractId },
      data: { basedOnVersionId: null },
    });
    await tx.contractVersion.deleteMany({ where: { contractId } });
    await tx.contract.delete({ where: { id: contractId } });
  });
}
