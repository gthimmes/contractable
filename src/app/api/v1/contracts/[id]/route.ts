import { prisma } from "@/lib/db";
import { requireApiKey, handle, serializeContract, ApiError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/v1/contracts/:id — one contract with versions, signatures,
// obligations. Accepts the internal id or the human reference (CTR-0001).
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    await requireApiKey(req, "READ");
    const { id } = await params;
    const contract = await prisma.contract.findFirst({
      where: { OR: [{ id }, { reference: id }] },
      include: {
        counterpartyRef: true,
        currentVersion: true,
        versions: { orderBy: { versionNumber: "asc" } },
        signatures: { orderBy: { order: "asc" } },
        obligations: true,
      },
    });
    if (!contract) throw new ApiError(404, "Contract not found");
    return Response.json({
      data: {
        ...serializeContract(contract),
        versions: contract.versions.map((v) => ({
          number: v.versionNumber,
          status: v.status,
          origin: v.origin,
          contentHash: v.contentHash,
          createdAt: v.createdAt,
        })),
        signatures: contract.signatures.map((s) => ({
          signerName: s.signerName,
          signerEmail: s.signerEmail,
          status: s.status,
          signedAt: s.signedAt,
          documentHash: s.documentHash,
        })),
        obligations: contract.obligations.map((o) => ({
          id: o.id,
          title: o.title,
          type: o.type,
          status: o.status,
          dueDate: o.dueDate,
        })),
      },
    });
  });
}
