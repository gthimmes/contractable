import { prisma } from "@/lib/db";
import { requireApiKey, handle, serializeCounterparty, ApiError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/v1/counterparties — list counterparties.
export async function GET(req: Request) {
  return handle(async () => {
    await requireApiKey(req, "READ");
    const rows = await prisma.counterparty.findMany({ orderBy: { name: "asc" } });
    return Response.json({ data: rows.map(serializeCounterparty) });
  });
}

// POST /api/v1/counterparties — create one (WRITE scope).
export async function POST(req: Request) {
  return handle(async () => {
    await requireApiKey(req, "WRITE");
    const input = (await req.json().catch(() => null)) as {
      name?: string;
      legalName?: string;
      address?: string;
      contactName?: string;
      contactEmail?: string;
      jurisdiction?: string;
    } | null;
    if (!input?.name) throw new ApiError(400, "name is required");
    const row = await prisma.counterparty.create({
      data: {
        name: input.name,
        legalName: input.legalName ?? null,
        address: input.address ?? null,
        contactName: input.contactName ?? null,
        contactEmail: input.contactEmail ?? null,
        jurisdiction: input.jurisdiction ?? null,
      },
    });
    return Response.json({ data: serializeCounterparty(row) }, { status: 201 });
  });
}
