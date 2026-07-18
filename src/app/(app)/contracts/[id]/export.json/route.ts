import { getSessionUser } from "@/lib/auth";
import { contractBundle } from "@/lib/export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /contracts/:id/export.json — full evidence bundle for one contract:
// metadata, versions with content hashes, signature receipts, obligations,
// and the audit trail.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const bundle = await contractBundle(id);
  if (!bundle) return new Response("Not found", { status: 404 });
  return new Response(JSON.stringify(bundle, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${bundle.contract.reference}.json"`,
    },
  });
}
