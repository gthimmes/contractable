import Link from "next/link";
import { prisma } from "@/lib/db";
import { EmptyState } from "@/components/ui";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { deleteCounterpartyAction } from "@/app/actions";

export default async function CounterpartiesPage() {
  const counterparties = await prisma.counterparty.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { contracts: true } } },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Counterparties</h1>
        <Link href="/counterparties/new" className="btn-primary">
          + New counterparty
        </Link>
      </div>

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
                    <form action={deleteCounterpartyAction}>
                      <input type="hidden" name="id" value={c.id} />
                      <ConfirmSubmit
                        message="Delete this counterparty?"
                        className="text-xs font-medium text-red-600 hover:underline"
                      >
                        Delete
                      </ConfirmSubmit>
                    </form>
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
