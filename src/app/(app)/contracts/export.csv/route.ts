import { getSessionUser } from "@/lib/auth";
import { contractsCsv } from "@/lib/export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /contracts/export.csv — the contract register as CSV.
export async function GET() {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const csv = await contractsCsv();
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="contracts.csv"`,
    },
  });
}
