import { prisma } from "@/lib/db";
import { requireApiKey, handle, serializeObligation } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/v1/obligations?status=OPEN — list obligations (soonest due first).
export async function GET(req: Request) {
  return handle(async () => {
    await requireApiKey(req, "READ");
    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const rows = await prisma.obligation.findMany({
      where: status ? { status } : undefined,
      orderBy: { dueDate: "asc" },
      take: 200,
    });
    return Response.json({ data: rows.map(serializeObligation) });
  });
}
