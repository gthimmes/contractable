import { runReminderSweep } from "@/lib/reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/cron/reminders — run the reminder sweep synchronously and report
// what was sent. For external schedulers (cron, GitHub Actions, a platform
// scheduler). If CRON_SECRET is set, requests must carry it as a Bearer token;
// unset, the endpoint is open (fine for local/dev — the sweep is idempotent
// within its cooldown, so extra calls can't spam anyone).
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
  }
  const result = await runReminderSweep();
  return Response.json({ ok: true, ...result });
}
