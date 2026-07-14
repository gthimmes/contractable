import Link from "next/link";
import { prisma } from "@/lib/db";
import { createContractAction } from "@/app/actions";
import { CONTRACT_CATEGORIES } from "@/lib/constants";

export default async function NewContractPage() {
  const [templates, counterparties] = await Promise.all([
    prisma.contractTemplate.findMany({ orderBy: { name: "asc" } }),
    prisma.counterparty.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/contracts" className="text-sm text-brand-600 hover:underline">
          ← Contracts
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          New contract
        </h1>
        <p className="text-sm text-gray-500">
          Create a draft. You can route it through a review &amp; approval
          workflow from the contract page.
        </p>
      </div>

      <form action={createContractAction} className="card space-y-5 p-6">
        <div>
          <label className="label">Title *</label>
          <input name="title" required className="input" placeholder="Acme × Globex — Mutual NDA" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Counterparty (record)</label>
            <select name="counterpartyId" className="input" defaultValue="">
              <option value="">— none / free text —</option>
              {counterparties.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">
              Linking a record lets document generation bind its data.
            </p>
          </div>
          <div>
            <label className="label">Category</label>
            <select name="category" className="input" defaultValue="">
              <option value="">—</option>
              {CONTRACT_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="label">Counterparty (free text)</label>
          <input name="counterparty" className="input" placeholder="Globex Corporation (if no record)" />
        </div>

        <div>
          <label className="label">Description</label>
          <input name="description" className="input" placeholder="Short summary of the deal" />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="label">Value</label>
            <input name="value" className="input" placeholder="240000" inputMode="decimal" />
          </div>
          <div>
            <label className="label">Effective date</label>
            <input name="effectiveDate" type="date" className="input" />
          </div>
          <div>
            <label className="label">Expiration date</label>
            <input name="expirationDate" type="date" className="input" />
          </div>
        </div>

        <div>
          <label className="label">Start from template</label>
          <select name="templateId" className="input" defaultValue="">
            <option value="">Blank</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.category})
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500">
            Choosing a template pre-fills the body below if you leave it empty.
          </p>
        </div>

        <div>
          <label className="label">Body</label>
          <textarea
            name="body"
            rows={10}
            className="input font-mono text-xs"
            placeholder="Contract text… (leave blank to use the selected template)"
          />
        </div>

        <div className="flex justify-end gap-3">
          <Link href="/contracts" className="btn-secondary">Cancel</Link>
          <button type="submit" className="btn-primary">Create draft</button>
        </div>
      </form>
    </div>
  );
}
