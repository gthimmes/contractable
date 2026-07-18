import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { deleteClauseAction } from "@/app/actions";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { EmptyState } from "@/components/ui";

export default async function ClausesPage() {
  const me = await getCurrentUser();
  const canManage = can({ id: me.id, role: me.role }, "template:manage");
  const clauses = await prisma.clause.findMany({
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clause library</h1>
          <p className="text-sm text-gray-500">
            Pre-approved contract language. Insert clauses into any template
            from the template editor; merge fields work inside clauses too.
          </p>
        </div>
        {canManage && (
          <Link href="/clauses/new" className="btn-primary shrink-0">
            + New clause
          </Link>
        )}
      </div>

      {clauses.length === 0 ? (
        <EmptyState>No clauses yet.</EmptyState>
      ) : (
        <div className="space-y-3">
          {clauses.map((c) => (
            <div key={c.id} className="card p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{c.name}</span>
                    {c.category && (
                      <span className="badge bg-gray-100 text-gray-600">{c.category}</span>
                    )}
                  </div>
                  {c.description && (
                    <p className="mt-0.5 text-xs text-gray-500">{c.description}</p>
                  )}
                </div>
                {canManage && (
                  <div className="flex shrink-0 items-center gap-3">
                    <Link
                      href={`/clauses/${c.id}/edit`}
                      className="text-xs font-medium text-brand-600 hover:underline"
                    >
                      Edit
                    </Link>
                    <form action={deleteClauseAction}>
                      <input type="hidden" name="id" value={c.id} />
                      <ConfirmSubmit
                        message={`Delete clause “${c.name}”? Templates that already contain its text are unaffected.`}
                        className="text-xs font-medium text-red-600 hover:underline"
                      >
                        Delete
                      </ConfirmSubmit>
                    </form>
                  </div>
                )}
              </div>
              <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-xs leading-relaxed text-gray-600">
                {c.body}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
