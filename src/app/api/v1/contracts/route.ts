import { prisma } from "@/lib/db";
import { createContract } from "@/lib/contracts";
import { requireApiKey, handle, serializeContract, ApiError } from "@/lib/api";
import { CONTRACT_STATUS } from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/v1/contracts?status=&limit= — list contracts (newest first).
export async function GET(req: Request) {
  return handle(async () => {
    await requireApiKey(req, "READ");
    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    if (status && !(CONTRACT_STATUS as readonly string[]).includes(status)) {
      throw new ApiError(400, `Unknown status: ${status}`);
    }
    const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 200);
    const contracts = await prisma.contract.findMany({
      where: status ? { status } : undefined,
      include: { counterpartyRef: true, currentVersion: true },
      orderBy: { updatedAt: "desc" },
      take: limit,
    });
    return Response.json({ data: contracts.map(serializeContract) });
  });
}

// POST /api/v1/contracts — create a draft contract (WRITE scope).
// Body: { title, body?, counterpartyId?, category?, value?, currency?,
//         ownerEmail? } — attribution falls back to the first admin.
export async function POST(req: Request) {
  return handle(async () => {
    const key = await requireApiKey(req, "WRITE");
    const input = (await req.json().catch(() => null)) as {
      title?: string;
      body?: string;
      counterpartyId?: string;
      category?: string;
      value?: number;
      currency?: string;
      ownerEmail?: string;
    } | null;
    if (!input?.title) throw new ApiError(400, "title is required");

    const owner = input.ownerEmail
      ? await prisma.user.findUnique({ where: { email: input.ownerEmail.toLowerCase() } })
      : await prisma.user.findFirst({ where: { role: "ADMIN" } });
    if (!owner) throw new ApiError(400, "No matching owner user found");

    if (input.counterpartyId) {
      const cp = await prisma.counterparty.findUnique({ where: { id: input.counterpartyId } });
      if (!cp) throw new ApiError(400, "Unknown counterpartyId");
    }

    const contract = await createContract(
      {
        title: input.title,
        counterpartyId: input.counterpartyId ?? null,
        category: input.category ?? null,
        value: input.value ?? null,
        currency: input.currency ?? "USD",
        createdById: owner.id,
        ownerId: owner.id,
        body: input.body ?? "",
      },
      { id: owner.id, name: `${owner.name} (via API key "${key.name}")` }
    );
    const full = await prisma.contract.findUniqueOrThrow({
      where: { id: contract.id },
      include: { counterpartyRef: true, currentVersion: true },
    });
    return Response.json({ data: serializeContract(full) }, { status: 201 });
  });
}
