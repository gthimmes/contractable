import Link from "next/link";
import { createCounterpartyAction } from "@/app/actions";

export default async function NewCounterpartyPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/counterparties" className="text-sm text-brand-600 hover:underline">
          ← Counterparties
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          New counterparty
        </h1>
        <p className="text-sm text-gray-500">
          The other party to a contract. These details fill{" "}
          <code className="rounded bg-gray-100 px-1 text-xs">
            {"{{ counterparty.* }}"}
          </code>{" "}
          merge fields during document generation.
        </p>
      </div>

      <form action={createCounterpartyAction} className="card space-y-5 p-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Name *</label>
            <input name="name" required className="input" placeholder="Globex" />
          </div>
          <div>
            <label className="label">Legal name</label>
            <input
              name="legalName"
              className="input"
              placeholder="Globex Corporation, Inc."
            />
          </div>
        </div>

        <div>
          <label className="label">Address</label>
          <input
            name="address"
            className="input"
            placeholder="500 Market St, Springfield"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Contact name</label>
            <input name="contactName" className="input" placeholder="Jane Doe" />
          </div>
          <div>
            <label className="label">Contact email</label>
            <input
              name="contactEmail"
              type="email"
              className="input"
              placeholder="jane@globex.com"
            />
          </div>
        </div>

        <div>
          <label className="label">Jurisdiction</label>
          <input
            name="jurisdiction"
            className="input"
            placeholder="Delaware"
          />
        </div>

        <div>
          <label className="label">Notes</label>
          <textarea
            name="notes"
            rows={4}
            className="input"
            placeholder="Internal notes about this counterparty…"
          />
        </div>

        <div className="flex justify-end gap-3">
          <Link href="/counterparties" className="btn-secondary">
            Cancel
          </Link>
          <button type="submit" className="btn-primary">
            Create counterparty
          </button>
        </div>
      </form>
    </div>
  );
}
