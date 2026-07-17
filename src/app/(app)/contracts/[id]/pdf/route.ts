import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { renderContractPdf } from "@/lib/contract-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /contracts/:id/pdf — download a printable PDF of the contract (document
// + signature certificate). Route handlers aren't wrapped by the (app) layout,
// so we enforce authentication here directly.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const contract = await prisma.contract.findUnique({
    where: { id },
    include: {
      currentVersion: true,
      counterpartyRef: true,
      owner: true,
      createdBy: true,
      signatures: { orderBy: { order: "asc" } },
    },
  });
  if (!contract) return new Response("Not found", { status: 404 });

  const org = await prisma.organization.findFirst();

  const pdf = renderContractPdf({
    org: org
      ? {
          name: org.name,
          legalName: org.legalName,
          signatoryName: org.signatoryName,
          signatoryTitle: org.signatoryTitle,
        }
      : null,
    contract: {
      reference: contract.reference,
      title: contract.title,
      status: contract.status,
      category: contract.category,
      description: contract.description,
      counterpartyName: contract.counterpartyRef?.name ?? contract.counterparty,
      value: contract.value,
      currency: contract.currency,
      effectiveDate: contract.effectiveDate,
      expirationDate: contract.expirationDate,
      executedAt: contract.executedAt,
      ownerName: contract.owner?.name,
      createdByName: contract.createdBy.name,
    },
    version: contract.currentVersion
      ? {
          versionNumber: contract.currentVersion.versionNumber,
          body: contract.currentVersion.body,
          contentHash: contract.currentVersion.contentHash,
          origin: contract.currentVersion.origin,
        }
      : null,
    signatures: contract.signatures.map((s) => ({
      signerName: s.signerName,
      signerEmail: s.signerEmail,
      order: s.order,
      status: s.status,
      signatureType: s.signatureType,
      signatureData: s.signatureData,
      signedAt: s.signedAt,
      ipAddress: s.ipAddress,
      documentHash: s.documentHash,
    })),
    generatedAt: new Date(),
  });

  return new Response(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${contract.reference}.pdf"`,
      "Content-Length": String(pdf.length),
    },
  });
}
