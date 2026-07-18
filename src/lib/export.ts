import { prisma } from "./db";
import { toCsv, parseCsvRecords } from "./csv";
import { recordAudit } from "./audit";

// Data out: CSV of the contract list and a full JSON evidence bundle per
// contract. Data in: counterparty CSV import (upsert by name). Pure-ish
// builders here; thin route handlers / server actions call them.

export async function contractsCsv(): Promise<string> {
  const contracts = await prisma.contract.findMany({
    include: { counterpartyRef: true, owner: true },
    orderBy: { reference: "asc" },
  });
  const rows: (string | number | null)[][] = [
    [
      "reference",
      "title",
      "status",
      "category",
      "counterparty",
      "value",
      "currency",
      "effective_date",
      "expiration_date",
      "executed_at",
      "owner",
      "created_at",
    ],
    ...contracts.map((c) => [
      c.reference,
      c.title,
      c.status,
      c.category,
      c.counterpartyRef?.name ?? c.counterparty,
      c.value,
      c.currency,
      c.effectiveDate?.toISOString().slice(0, 10) ?? null,
      c.expirationDate?.toISOString().slice(0, 10) ?? null,
      c.executedAt?.toISOString() ?? null,
      c.owner?.name ?? null,
      c.createdAt.toISOString(),
    ]),
  ];
  return toCsv(rows);
}

/**
 * Everything evidencing one contract: metadata, full version history with
 * content hashes, signatures with their receipts, obligations, and the audit
 * trail. Suitable for handing to an auditor or another system.
 */
export async function contractBundle(contractId: string) {
  const c = await prisma.contract.findUnique({
    where: { id: contractId },
    include: {
      counterpartyRef: true,
      owner: true,
      createdBy: true,
      versions: { orderBy: { versionNumber: "asc" } },
      signatures: { orderBy: { order: "asc" } },
      obligations: true,
      auditEvents: { orderBy: { createdAt: "asc" } },
      amendsContract: true,
      amendments: true,
    },
  });
  if (!c) return null;
  return {
    exportedAt: new Date().toISOString(),
    contract: {
      reference: c.reference,
      title: c.title,
      description: c.description,
      status: c.status,
      category: c.category,
      counterparty: c.counterpartyRef?.name ?? c.counterparty,
      value: c.value,
      currency: c.currency,
      effectiveDate: c.effectiveDate,
      expirationDate: c.expirationDate,
      executedAt: c.executedAt,
      owner: c.owner?.name ?? null,
      createdBy: c.createdBy.name,
      createdAt: c.createdAt,
      amends: c.amendsContract?.reference ?? null,
      amendments: c.amendments.map((a) => a.reference),
    },
    versions: c.versions.map((v) => ({
      versionNumber: v.versionNumber,
      status: v.status,
      origin: v.origin,
      note: v.note,
      contentHash: v.contentHash,
      createdAt: v.createdAt,
      body: v.body,
    })),
    signatures: c.signatures.map((s) => ({
      signerName: s.signerName,
      signerEmail: s.signerEmail,
      order: s.order,
      status: s.status,
      signatureType: s.signatureType,
      signedAt: s.signedAt,
      ipAddress: s.ipAddress,
      documentHash: s.documentHash,
    })),
    obligations: c.obligations.map((o) => ({
      title: o.title,
      type: o.type,
      status: o.status,
      dueDate: o.dueDate,
    })),
    audit: c.auditEvents.map((e) => ({
      action: e.action,
      summary: e.summary,
      actor: e.actorLabel,
      prevHash: e.prevHash,
      hash: e.hash,
      createdAt: e.createdAt,
    })),
  };
}

export interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

/**
 * Import counterparties from CSV with a header row. Recognized columns:
 * name (required), legalname/legal_name, address, contactname/contact_name,
 * contactemail/contact_email, jurisdiction, notes. Upserts by exact name.
 */
export async function importCounterparties(
  csvText: string,
  actor: { id: string; name: string }
): Promise<ImportResult> {
  const records = parseCsvRecords(csvText);
  const result: ImportResult = { created: 0, updated: 0, skipped: 0, errors: [] };
  const col = (r: Record<string, string>, ...names: string[]) => {
    for (const n of names) if (r[n]) return r[n];
    return null;
  };

  for (const [idx, r] of records.entries()) {
    const name = col(r, "name");
    if (!name) {
      result.skipped++;
      result.errors.push(`Row ${idx + 2}: missing name`);
      continue;
    }
    const data = {
      legalName: col(r, "legalname", "legal_name"),
      address: col(r, "address"),
      contactName: col(r, "contactname", "contact_name"),
      contactEmail: col(r, "contactemail", "contact_email"),
      jurisdiction: col(r, "jurisdiction"),
      notes: col(r, "notes"),
    };
    const existing = await prisma.counterparty.findFirst({ where: { name } });
    if (existing) {
      await prisma.counterparty.update({ where: { id: existing.id }, data });
      result.updated++;
    } else {
      await prisma.counterparty.create({ data: { name, ...data } });
      result.created++;
    }
  }

  if (result.created || result.updated) {
    await recordAudit(prisma, {
      entityType: "CONTRACT",
      entityId: "counterparty-import",
      action: "COUNTERPARTIES_IMPORTED",
      summary: `Imported counterparties from CSV: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped`,
      actorId: actor.id,
      actorLabel: actor.name,
    });
  }
  return result;
}
