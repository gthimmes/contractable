import Link from "next/link";
import { prisma } from "@/lib/db";
import { effectiveStatus } from "@/lib/obligations";
import { setObligationStatusAction } from "@/app/actions";
import { Pill, formatDate, EmptyState } from "@/components/ui";

export default async function ObligationsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter } = await searchParams;

  const all = await prisma.obligation.findMany({
    orderBy: [{ dueDate: "asc" }],
    include: { contract: true, owner: true },
  });

  const withStatus = all.map((o) => ({ ...o, eff: effectiveStatus(o) }));
  const overdueCount = withStatus.filter((o) => o.eff === "OVERDUE").length;
  const openCount = withStatus.filter((o) => o.eff === "OPEN").length;

  const filtered = withStatus.filter((o) => {
    if (filter === "overdue") return o.eff === "OVERDUE";
    if (filter === "open") return o.eff === "OPEN" || o.eff === "OVERDUE";
    if (filter === "done") return o.eff === "DONE";
    return true;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Obligations &amp; enforcement
        </h1>
        <p className="text-sm text-gray-500">
          Payments, renewals, deliverables, and expirations across all executed
          contracts. Overdue items are flagged automatically.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card label="Overdue" value={overdueCount} tone="text-red-600" />
        <Card label="Open" value={openCount} tone="text-blue-600" />
        <Card label="Total tracked" value={all.length} tone="text-gray-900" />
      </div>

      <div className="flex gap-2">
        {[
          ["all", "All"],
          ["open", "Open"],
          ["overdue", "Overdue"],
          ["done", "Done"],
        ].map(([f, label]) => (
          <Link
            key={f}
            href={`/obligations?filter=${f}`}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              (filter ?? "all") === f
                ? "bg-brand-600 text-white"
                : "border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState>No obligations in this view.</EmptyState>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Obligation</th>
                <th className="px-4 py-3">Contract</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Due</th>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((o) => (
                <tr key={o.id} className={o.eff === "OVERDUE" ? "bg-red-50/40" : ""}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{o.title}</div>
                    {o.description && (
                      <div className="text-xs text-gray-500">{o.description}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/contracts/${o.contractId}`}
                      className="text-brand-700 hover:underline"
                    >
                      {o.contract.reference}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{o.type}</td>
                  <td className="px-4 py-3 text-gray-600">{formatDate(o.dueDate)}</td>
                  <td className="px-4 py-3 text-gray-600">{o.owner?.name ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Pill value={o.eff} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {o.status === "OPEN" && (
                      <form action={setObligationStatusAction} className="inline">
                        <input type="hidden" name="obligationId" value={o.id} />
                        <input type="hidden" name="status" value="DONE" />
                        <button className="text-xs font-medium text-emerald-600 hover:underline">
                          Mark done
                        </button>
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

function Card({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="card p-5">
      <div className={`text-3xl font-semibold ${tone}`}>{value}</div>
      <div className="mt-1 text-sm text-gray-500">{label}</div>
    </div>
  );
}
