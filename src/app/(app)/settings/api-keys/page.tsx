import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import {
  createApiKeyAction,
  toggleApiKeyAction,
  deleteApiKeyAction,
} from "@/app/actions";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { formatDateTime, EmptyState, Pill } from "@/components/ui";

export default async function ApiKeysPage() {
  const me = await getCurrentUser();
  if (me.role !== "ADMIN") redirect("/");

  // One-time reveal of a just-created key (flashed via cookie by the action).
  const store = await cookies();
  const newKey = store.get("contractable_new_api_key")?.value ?? null;

  const keys = await prisma.apiKey.findMany({ orderBy: { createdAt: "asc" } });

  return (
    <div className="space-y-6">
      <div>
        <Link href="/settings" className="text-sm text-brand-600 hover:underline">
          ← Settings
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">API keys</h1>
        <p className="text-sm text-gray-500">
          Bearer keys for the REST API. Send{" "}
          <code className="rounded bg-gray-100 px-1 text-xs">
            Authorization: Bearer ck_…
          </code>{" "}
          to <code className="rounded bg-gray-100 px-1 text-xs">/api/v1/contracts</code>,{" "}
          <code className="rounded bg-gray-100 px-1 text-xs">/api/v1/counterparties</code>, or{" "}
          <code className="rounded bg-gray-100 px-1 text-xs">/api/v1/obligations</code>.
          Keys are stored hashed — the full key is shown once, at creation.
        </p>
      </div>

      {newKey && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-medium text-emerald-800">
            New key created — copy it now; it won&apos;t be shown again:
          </p>
          <code className="mt-2 block select-all break-all rounded bg-white px-3 py-2 font-mono text-sm">
            {newKey}
          </code>
        </div>
      )}

      <section className="card space-y-4 p-6">
        <h2 className="text-lg font-semibold">Create key</h2>
        <form action={createApiKeyAction} className="flex flex-wrap items-end gap-3">
          <div className="min-w-64 flex-1">
            <label className="label">Name</label>
            <input name="name" required className="input" placeholder="Zapier integration" />
          </div>
          <div>
            <label className="label">Scope</label>
            <select name="scope" className="input" defaultValue="READ">
              <option value="READ">Read-only</option>
              <option value="WRITE">Read + write</option>
            </select>
          </div>
          <button type="submit" className="btn-primary">
            Create key
          </button>
        </form>
      </section>

      <section className="card p-6">
        <h2 className="mb-4 text-lg font-semibold">Keys</h2>
        {keys.length === 0 ? (
          <EmptyState>No API keys yet.</EmptyState>
        ) : (
          <ul className="divide-y divide-gray-100">
            {keys.map((k) => (
              <li key={k.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{k.name}</span>
                    <Pill value={k.active ? "ACTIVE" : "REVOKED"} />
                    <span className="badge bg-gray-100 text-gray-600">{k.scope}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-gray-500">
                    <span className="font-mono">{k.prefix}…</span> · created{" "}
                    {formatDateTime(k.createdAt)}
                    {k.lastUsedAt && <> · last used {formatDateTime(k.lastUsedAt)}</>}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <form action={toggleApiKeyAction}>
                    <input type="hidden" name="id" value={k.id} />
                    <button className="text-xs font-medium text-brand-600 hover:underline">
                      {k.active ? "Revoke" : "Re-activate"}
                    </button>
                  </form>
                  <form action={deleteApiKeyAction}>
                    <input type="hidden" name="id" value={k.id} />
                    <ConfirmSubmit
                      message={`Delete API key "${k.name}"? Integrations using it will stop working.`}
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
    </div>
  );
}
