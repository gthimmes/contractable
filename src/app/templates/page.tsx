import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { EmptyState } from "@/components/ui";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { deleteTemplateAction } from "@/app/actions";
import { extractVariables } from "@/lib/template";

export default async function TemplatesPage() {
  const templates = await prisma.contractTemplate.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { contracts: true } } },
  });

  const me = await getCurrentUser();
  const meActor = { id: me.id, role: me.role };
  const canManage = can(meActor, "template:manage");

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Contract templates
          </h1>
          <p className="text-sm text-gray-500">
            Reusable documents with{" "}
            <code className="rounded bg-gray-100 px-1 text-xs">
              {"{{ merge fields }}"}
            </code>{" "}
            that get filled in to generate finished contracts.
          </p>
        </div>
        {canManage && (
          <Link href="/templates/new" className="btn-primary">
            + New template
          </Link>
        )}
      </div>

      {templates.length === 0 ? (
        <EmptyState>
          No templates yet.{" "}
          <Link href="/templates/new" className="text-brand-600 hover:underline">
            Create one →
          </Link>
        </EmptyState>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {templates.map((t) => {
            const fields = extractVariables(t.body);
            return (
              <div key={t.id} className="card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="flex items-center gap-2 text-lg font-semibold">
                      {t.name}
                      {t.category && (
                        <span className="badge bg-brand-100 text-brand-700">
                          {t.category}
                        </span>
                      )}
                    </h2>
                    {t.description && (
                      <p className="mt-1 text-sm text-gray-500">{t.description}</p>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-gray-400">
                    {t._count.contracts} contract
                    {t._count.contracts === 1 ? "" : "s"}
                  </span>
                </div>

                <div className="mt-4">
                  <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Merge fields:
                  </div>
                  {fields.length === 0 ? (
                    <p className="mt-1 text-xs text-gray-400">None detected</p>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {fields.map((f) => (
                        <span
                          key={f}
                          className="badge bg-gray-100 font-mono text-xs text-gray-700"
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {canManage && (
                  <div className="mt-4 flex items-center gap-4 border-t border-gray-100 pt-3">
                    <Link
                      href={`/templates/${t.id}/edit`}
                      className="text-xs font-medium text-brand-600 hover:underline"
                    >
                      Edit
                    </Link>
                    <form action={deleteTemplateAction}>
                      <input type="hidden" name="id" value={t.id} />
                      <ConfirmSubmit
                        message="Delete this template?"
                        className="text-xs font-medium text-red-600 hover:underline"
                      >
                        Delete
                      </ConfirmSubmit>
                    </form>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
