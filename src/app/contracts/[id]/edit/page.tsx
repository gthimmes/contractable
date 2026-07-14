import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAllUsers, getCurrentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { updateContractAction } from "@/app/actions";
import { CONTRACT_CATEGORIES } from "@/lib/constants";

function dateValue(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

export default async function EditContractPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [contract, counterparties, users] = await Promise.all([
    prisma.contract.findUnique({ where: { id } }),
    prisma.counterparty.findMany({ orderBy: { name: "asc" } }),
    getAllUsers(),
  ]);
  if (!contract) notFound();

  const me = await getCurrentUser();
  const meActor = { id: me.id, role: me.role };
  if (!can(meActor, "contract:edit", contract)) redirect(`/contracts/${id}`);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href={`/contracts/${id}`} className="text-sm text-brand-600 hover:underline">
          ← {contract.reference}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Edit contract</h1>
      </div>

      <form action={updateContractAction} className="card space-y-5 p-6">
        <input type="hidden" name="contractId" value={contract.id} />

        <div>
          <label className="label">Title *</label>
          <input name="title" required defaultValue={contract.title} className="input" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Counterparty (record)</label>
            <select name="counterpartyId" className="input" defaultValue={contract.counterpartyId ?? ""}>
              <option value="">— none / free text —</option>
              {counterparties.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Counterparty (free text)</label>
            <input name="counterparty" defaultValue={contract.counterparty ?? ""} className="input" />
          </div>
        </div>

        <div>
          <label className="label">Description</label>
          <input name="description" defaultValue={contract.description ?? ""} className="input" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Category</label>
            <select name="category" className="input" defaultValue={contract.category ?? ""}>
              <option value="">—</option>
              {CONTRACT_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Owner</label>
            <select name="ownerId" className="input" defaultValue={contract.ownerId ?? ""}>
              <option value="">—</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="label">Value</label>
            <input name="value" defaultValue={contract.value ?? ""} className="input" inputMode="decimal" />
          </div>
          <div>
            <label className="label">Effective date</label>
            <input name="effectiveDate" type="date" defaultValue={dateValue(contract.effectiveDate)} className="input" />
          </div>
          <div>
            <label className="label">Expiration date</label>
            <input name="expirationDate" type="date" defaultValue={dateValue(contract.expirationDate)} className="input" />
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Link href={`/contracts/${id}`} className="btn-secondary">Cancel</Link>
          <button type="submit" className="btn-primary">Save changes</button>
        </div>
      </form>
    </div>
  );
}
