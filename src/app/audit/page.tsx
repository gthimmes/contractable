import Link from "next/link";
import { prisma } from "@/lib/db";
import { verifyAuditChain } from "@/lib/audit";
import { formatDateTime } from "@/components/ui";

export default async function AuditPage() {
  const [events, integrity] = await Promise.all([
    prisma.auditEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { contract: true },
    }),
    verifyAuditChain(prisma),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
        <p className="text-sm text-gray-500">
          Append-only, hash-chained record of every action. Each entry’s hash
          covers the previous entry, so any tampering is detectable.
        </p>
      </div>

      <div
        className={`card flex items-center gap-3 p-4 ${
          integrity.ok ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"
        }`}
      >
        <span
          className={`grid h-9 w-9 place-items-center rounded-full text-lg ${
            integrity.ok ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
          }`}
        >
          {integrity.ok ? "✓" : "!"}
        </span>
        <div className="text-sm">
          <div className="font-semibold">
            {integrity.ok
              ? "Chain verified — no tampering detected"
              : "Chain integrity FAILED"}
          </div>
          <div className="text-gray-500">
            {integrity.count} events verified
            {integrity.brokenAt && <> · first break at event {integrity.brokenAt}</>}
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Detail</th>
              <th className="px-4 py-3">Actor</th>
              <th className="px-4 py-3">Contract</th>
              <th className="px-4 py-3">Hash</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {events.map((e) => (
              <tr key={e.id} className="align-top">
                <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">
                  {formatDateTime(e.createdAt)}
                </td>
                <td className="px-4 py-3">
                  <span className="badge bg-gray-100 text-gray-700">{e.action}</span>
                </td>
                <td className="px-4 py-3 text-gray-700">{e.summary}</td>
                <td className="px-4 py-3 text-gray-600">{e.actorLabel ?? "System"}</td>
                <td className="px-4 py-3">
                  {e.contract ? (
                    <Link
                      href={`/contracts/${e.contractId}`}
                      className="text-brand-700 hover:underline"
                    >
                      {e.contract.reference}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-gray-400">
                  {e.hash.slice(0, 10)}…
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
