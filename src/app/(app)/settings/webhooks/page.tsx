import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { WEBHOOK_EVENTS } from "@/lib/webhooks";
import {
  saveWebhookAction,
  toggleWebhookAction,
  deleteWebhookAction,
} from "@/app/actions";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { formatDateTime, EmptyState, Pill } from "@/components/ui";

export default async function WebhooksPage() {
  const me = await getCurrentUser();
  if (me.role !== "ADMIN") redirect("/");

  const [endpoints, deliveries] = await Promise.all([
    prisma.webhookEndpoint.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.webhookDelivery.findMany({
      orderBy: { createdAt: "desc" },
      take: 25,
      include: { endpoint: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/settings" className="text-sm text-brand-600 hover:underline">
          ← Settings
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Webhooks</h1>
        <p className="text-sm text-gray-500">
          Lifecycle events POST a JSON payload to each active endpoint, signed
          with an HMAC-SHA256 of the body in the{" "}
          <code className="rounded bg-gray-100 px-1 text-xs">X-Contractable-Signature</code>{" "}
          header. Filter with a comma-separated event list, a prefix like{" "}
          <code className="rounded bg-gray-100 px-1 text-xs">contract.*</code>, or{" "}
          <code className="rounded bg-gray-100 px-1 text-xs">*</code> for everything.
        </p>
      </div>

      {/* Add endpoint */}
      <section className="card space-y-4 p-6">
        <h2 className="text-lg font-semibold">Add endpoint</h2>
        <form action={saveWebhookAction} className="flex flex-wrap items-end gap-3">
          <div className="min-w-72 flex-1">
            <label className="label">URL</label>
            <input
              name="url"
              required
              className="input"
              placeholder="https://example.com/hooks/contractable"
            />
          </div>
          <div className="min-w-52">
            <label className="label">Events</label>
            <input name="events" className="input" placeholder="* (all)" defaultValue="*" />
          </div>
          <button type="submit" className="btn-primary">
            Add webhook
          </button>
        </form>
        <p className="text-xs text-gray-400">
          Available events: {WEBHOOK_EVENTS.join(", ")}
        </p>
      </section>

      {/* Endpoints */}
      <section className="card p-6">
        <h2 className="mb-4 text-lg font-semibold">Endpoints</h2>
        {endpoints.length === 0 ? (
          <EmptyState>No webhooks configured.</EmptyState>
        ) : (
          <ul className="divide-y divide-gray-100">
            {endpoints.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-mono text-sm text-gray-800">{e.url}</span>
                    <Pill value={e.active ? "ACTIVE" : "PAUSED"} />
                  </div>
                  <div className="mt-0.5 text-xs text-gray-500">
                    events: <span className="font-mono">{e.events}</span> · secret:{" "}
                    <span className="font-mono">{e.secret}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <form action={toggleWebhookAction}>
                    <input type="hidden" name="id" value={e.id} />
                    <button className="text-xs font-medium text-brand-600 hover:underline">
                      {e.active ? "Pause" : "Resume"}
                    </button>
                  </form>
                  <form action={deleteWebhookAction}>
                    <input type="hidden" name="id" value={e.id} />
                    <ConfirmSubmit
                      message="Delete this webhook endpoint (and its delivery log)?"
                      className="text-xs font-medium text-red-600 hover:underline"
                    >
                      Delete
                    </ConfirmSubmit>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Delivery log */}
      <section className="card p-6">
        <h2 className="mb-4 text-lg font-semibold">Recent deliveries</h2>
        {deliveries.length === 0 ? (
          <EmptyState>No deliveries yet — trigger a lifecycle event.</EmptyState>
        ) : (
          <ul className="divide-y divide-gray-100">
            {deliveries.map((d) => (
              <li key={d.id} className="py-2.5 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2">
                    <Pill value={d.status} />
                    <span className="font-mono text-xs">{d.event}</span>
                    <span className="truncate text-xs text-gray-400">→ {d.endpoint.url}</span>
                  </span>
                  <span className="shrink-0 text-xs text-gray-400">
                    {d.responseCode ?? "—"} · {formatDateTime(d.createdAt)}
                  </span>
                </div>
                {d.error && <div className="mt-0.5 text-xs text-red-600">{d.error}</div>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
