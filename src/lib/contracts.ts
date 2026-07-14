import { prisma } from "./db";
import { recordAudit, sha256, type Db } from "./audit";

export interface CreateContractInput {
  title: string;
  description?: string | null;
  counterparty?: string | null;
  category?: string | null;
  value?: number | null;
  currency?: string | null;
  effectiveDate?: Date | null;
  expirationDate?: Date | null;
  createdById: string;
  ownerId?: string | null;
  templateId?: string | null;
  body: string;
}

async function nextReference(db: Db): Promise<string> {
  const count = await db.contract.count();
  return `CTR-${String(count + 1).padStart(4, "0")}`;
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
        category: input.category ?? null,
        value: input.value ?? null,
        currency: input.currency ?? "USD",
        effectiveDate: input.effectiveDate ?? null,
        expirationDate: input.expirationDate ?? null,
        createdById: input.createdById,
        ownerId: input.ownerId ?? input.createdById,
        templateId: input.templateId ?? null,
        status: "DRAFT",
      },
    });

    const version = await tx.contractVersion.create({
      data: {
        contractId: contract.id,
        versionNumber: 1,
        body: input.body,
        contentHash: sha256(input.body),
        createdById: input.createdById,
        note: "Initial draft",
      },
    });

    await tx.contract.update({
      where: { id: contract.id },
      data: { currentVersionId: version.id },
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

    return { ...contract, currentVersionId: version.id };
  });
}

/** Add a new version to a contract and make it current (resets to DRAFT). */
export async function addVersion(
  contractId: string,
  body: string,
  note: string | null,
  actor: { id: string; name: string }
) {
  return prisma.$transaction(async (tx) => {
    const latest = await tx.contractVersion.findFirst({
      where: { contractId },
      orderBy: { versionNumber: "desc" },
    });
    const versionNumber = (latest?.versionNumber ?? 0) + 1;
    const version = await tx.contractVersion.create({
      data: {
        contractId,
        versionNumber,
        body,
        contentHash: sha256(body),
        createdById: actor.id,
        note,
      },
    });
    await tx.contract.update({
      where: { id: contractId },
      data: { currentVersionId: version.id, status: "DRAFT" },
    });
    await recordAudit(tx, {
      contractId,
      entityType: "CONTRACT",
      entityId: contractId,
      action: "VERSION_ADDED",
      summary: `Added version ${versionNumber}${note ? ` — ${note}` : ""}`,
      actorId: actor.id,
      actorLabel: actor.name,
    });
    return version;
  });
}
