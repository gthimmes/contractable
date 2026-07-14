import { prisma } from "./db";
import { recordAudit } from "./audit";
import { makeVersion } from "./contracts";
import { renderTemplate, type TemplateContext } from "./template";

/**
 * Assemble the data context a template renders against, drawn from the database:
 * our organization, the linked counterparty, the contract's own fields, today's
 * date, and any custom merge values stored on the contract. Custom values are
 * spread at the top level so authors can reference {{ projectName }} directly.
 */
export async function buildContext(
  contractId: string,
  overrides?: Record<string, unknown>
): Promise<TemplateContext> {
  const contract = await prisma.contract.findUniqueOrThrow({
    where: { id: contractId },
    include: { counterpartyRef: true },
  });
  const org = await prisma.organization.findFirst();

  let custom: Record<string, unknown> = {};
  if (contract.dataJson) {
    try {
      custom = JSON.parse(contract.dataJson);
    } catch {
      custom = {};
    }
  }

  const cp = contract.counterpartyRef;

  return {
    org: org
      ? {
          name: org.name,
          legalName: org.legalName ?? org.name,
          address: org.address ?? "",
          email: org.email ?? "",
          signatoryName: org.signatoryName ?? "",
          signatoryTitle: org.signatoryTitle ?? "",
          jurisdiction: org.jurisdiction ?? "",
        }
      : {},
    counterparty: cp
      ? {
          name: cp.name,
          legalName: cp.legalName ?? cp.name,
          address: cp.address ?? "",
          contactName: cp.contactName ?? "",
          contactEmail: cp.contactEmail ?? "",
          jurisdiction: cp.jurisdiction ?? "",
        }
      : { name: contract.counterparty ?? "" },
    contract: {
      title: contract.title,
      reference: contract.reference,
      description: contract.description ?? "",
      category: contract.category ?? "",
      value: contract.value,
      currency: contract.currency ?? "USD",
      effectiveDate: contract.effectiveDate
        ? contract.effectiveDate.toISOString()
        : "",
      expirationDate: contract.expirationDate
        ? contract.expirationDate.toISOString()
        : "",
    },
    today: new Date().toISOString(),
    ...custom,
    ...(overrides ?? {}),
  };
}

/**
 * Generate a contract's document from a template, binding it to the contract's
 * data. Persists the merged custom values on the contract and writes the
 * rendered text as a new GENERATED version (made current).
 */
export async function generateVersionFromTemplate(
  contractId: string,
  templateId: string,
  customData: Record<string, unknown>,
  actor: { id: string; name: string }
) {
  const template = await prisma.contractTemplate.findUniqueOrThrow({
    where: { id: templateId },
  });

  // Persist custom values so future regenerations/edits keep them.
  await prisma.contract.update({
    where: { id: contractId },
    data: { dataJson: JSON.stringify(customData), templateId },
  });

  const context = await buildContext(contractId, customData);
  const body = renderTemplate(template.body, context);

  return prisma.$transaction(async (tx) => {
    const version = await makeVersion(tx, {
      contractId,
      body,
      note: `Generated from template “${template.name}”`,
      createdById: actor.id,
      origin: "GENERATED",
      makeCurrent: true,
      resetToDraft: true,
    });
    await recordAudit(tx, {
      contractId,
      entityType: "CONTRACT",
      entityId: contractId,
      action: "DOCUMENT_GENERATED",
      summary: `Generated document from template “${template.name}” (v${version.versionNumber})`,
      actorId: actor.id,
      actorLabel: actor.name,
    });
    return version;
  });
}
