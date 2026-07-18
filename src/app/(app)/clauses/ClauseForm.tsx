import Link from "next/link";
import { saveClauseAction } from "@/app/actions";

// Shared create/edit form for library clauses (server component).
export function ClauseForm({
  clause,
}: {
  clause?: {
    id: string;
    name: string;
    category: string | null;
    description: string | null;
    body: string;
  };
}) {
  return (
    <form action={saveClauseAction} className="card space-y-5 p-6">
      {clause && <input type="hidden" name="id" value={clause.id} />}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Name *</label>
          <input
            name="name"
            required
            className="input"
            defaultValue={clause?.name}
            placeholder="Limitation of Liability"
          />
        </div>
        <div>
          <label className="label">Category</label>
          <input
            name="category"
            className="input"
            defaultValue={clause?.category ?? ""}
            placeholder="Liability, Confidentiality, Termination…"
          />
        </div>
      </div>

      <div>
        <label className="label">Description</label>
        <input
          name="description"
          className="input"
          defaultValue={clause?.description ?? ""}
          placeholder="When to use this clause"
        />
      </div>

      <div>
        <label className="label">Clause text *</label>
        <textarea
          name="body"
          rows={10}
          required
          className="input font-mono text-xs"
          defaultValue={clause?.body}
          placeholder="LIMITATION OF LIABILITY. Neither Party's aggregate liability shall exceed {{ contract.value | money }}…"
        />
        <p className="mt-1 text-xs text-gray-500">
          Merge fields work here exactly as in templates — they resolve when a
          document is generated.
        </p>
      </div>

      <div className="flex justify-end gap-3">
        <Link href="/clauses" className="btn-secondary">
          Cancel
        </Link>
        <button type="submit" className="btn-primary">
          Save clause
        </button>
      </div>
    </form>
  );
}
