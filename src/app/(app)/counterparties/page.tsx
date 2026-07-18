import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { EmptyState } from "@/components/ui";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { deleteCounterpartyAction, importCounterpartiesAction } from "@/app/actions";

export default async function CounterpartiesPage({
  searchParams,
}: {
  searchParams: Promise<{ import?: string; created?: string; updated?: string; skipped?: string }>;
}) {
  const sp = await searchParams;
  const counterparties = await prisma.counterparty.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { contracts: true } } },
  });

  const me = await getCurrentUser();
  const meActor = { id: me.id, role: me.role };
  const canManage = can(meActor, "counterparty:manage");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Counterparties</h1>
        {canManage && (
          <Link href="/counterparties/new" className="btn-primary">
            + New counterparty
          </Link>
        )}
      </div>

      {sp.import === "done" && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Import complete: {sp.created ?? 0} created, {sp.updated ?? 0} updated,{" "}
          {sp.skipped ?? 0} skipped.
        </p>
      )}
      {(sp.import === "empty" || sp.import === "toolarge") && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {sp.import === "empty" ? "Pick a CSV file to import." : "File too large (max 1 MB)."}
        </p>
      )}

      {canManage && (
        <details className="card p-4">
          <summary className="cursor-pointer text-sm font-medium text-brand-600">
            Import from CSV
          </summary>
          <form
            action={importCounterpartiesAction}
            className="mt-3 flex flex-wrap items-center gap-3"
          >
            <input type="file" name="file" accept=".csv,text/csv" required className="text-sm" />
            <button type="submit" className="btn-secondary">
              Import
            </button>
            <span className="text-xs text-gray-400">
              Header row required. Columns: name (required), legal_name, address,
              contact_name, contact_email, jurisdiction, notes. Existing names are updated.
            </span>
          </form>
        </details>
      )}

      {counterparties.length === 0 ? (
        <EmptyState>
          No counterparties yet.{" "}
          <Link href="/counterparties/new" className="text-brand-600 hover:underline">
            Add one →
          </Link>
        </EmptyState>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Legal name</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Jurisdiction</th>
                <th className="px-4 py-3">Contracts</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {counterparties.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/counterparties/${c.id}/edit`}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{c.legalName ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {c.contactName || c.contactEmail ? (
                      <div>
                        {c.contactName && <div>{c.contactName}</div>}
                        {c.contactEmail && (
                          <div className="text-xs text-gray-500">{c.contactEmail}</div>
                        )}
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{c.jurisdiction ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{c._count.contracts}</td>
                  <td className="px-4 py-3 text-right">
                    {canManage && (
                      <form action={deleteCounterpartyAction}>
                        <input type="hidden" name="id" value={c.id} />
                        <ConfirmSubmit
                          message="Delete this counterparty?"
                          className="text-xs font-medium text-red-600 hover:underline"
                        >
                          Delete
                        </ConfirmSubmit>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
