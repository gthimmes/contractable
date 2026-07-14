import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { StatusBadge, formatDate, formatMoney, EmptyState } from "@/components/ui";
import {
  CONTRACT_STATUS,
  CONTRACT_STATUS_LABELS,
  type ContractStatus,
} from "@/lib/constants";

export default async function ContractsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const { status, q } = await searchParams;
  const where: Record<string, unknown> = {};
  if (status && (CONTRACT_STATUS as readonly string[]).includes(status)) {
    where.status = status;
  }
  if (q) {
    where.OR = [
      { title: { contains: q } },
      { counterparty: { contains: q } },
      { reference: { contains: q } },
    ];
  }

  const contracts = await prisma.contract.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: { owner: true },
  });

  const me = await getCurrentUser();
  const meActor = { id: me.id, role: me.role };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Contracts</h1>
        {can(meActor, "contract:create") && (
          <Link href="/contracts/new" className="btn-primary">
            + New Contract
          </Link>
        )}
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap gap-2">
        <FilterChip label="All" href="/contracts" active={!status} />
        {CONTRACT_STATUS.map((s) => (
          <FilterChip
            key={s}
            label={CONTRACT_STATUS_LABELS[s as ContractStatus]}
            href={`/contracts?status=${s}`}
            active={status === s}
          />
        ))}
      </div>

      {contracts.length === 0 ? (
        <EmptyState>
          No contracts match. <Link href="/contracts/new" className="text-brand-600 hover:underline">Create one →</Link>
        </EmptyState>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Counterparty</th>
                <th className="px-4 py-3">Value</th>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {contracts.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">
                    {c.reference}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/contracts/${c.id}`}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {c.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{c.counterparty ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {formatMoney(c.value, c.currency ?? "USD")}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{c.owner?.name ?? "—"}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="px-4 py-3 text-gray-500">{formatDate(c.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FilterChip({
  label,
  href,
  active,
}: {
  label: string;
  href: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full px-3 py-1 text-xs font-medium transition ${
        active
          ? "bg-brand-600 text-white"
          : "border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
      }`}
    >
      {label}
    </Link>
  );
}
