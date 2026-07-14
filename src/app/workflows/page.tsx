import Link from "next/link";
import { prisma } from "@/lib/db";
import {
  STEP_TYPE_LABELS,
  ROLE_LABELS,
  type StepType,
  type Role,
} from "@/lib/constants";

const TYPE_COLORS: Record<string, string> = {
  REVIEW: "bg-blue-100 text-blue-800",
  APPROVAL: "bg-amber-100 text-amber-800",
  SIGNATURE: "bg-purple-100 text-purple-800",
};

export default async function WorkflowsPage() {
  const templates = await prisma.workflowTemplate.findMany({
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    include: {
      steps: { orderBy: { order: "asc" } },
      _count: { select: { instances: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Workflows</h1>
        <p className="text-sm text-gray-500">
          Reusable review &amp; approval paths. Each contract can be routed
          through any of these; steps run in order and complete by ALL or ANY of
          their assignees.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {templates.map((t) => (
          <div key={t.id} className="card p-5">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  {t.name}
                  {t.isDefault && (
                    <span className="badge bg-brand-100 text-brand-700">default</span>
                  )}
                </h2>
                <p className="mt-1 text-sm text-gray-500">{t.description}</p>
              </div>
              <span className="text-xs text-gray-400">
                {t._count.instances} run{t._count.instances === 1 ? "" : "s"}
              </span>
            </div>

            <ol className="mt-4 space-y-2">
              {t.steps.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
                >
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white text-xs font-semibold text-gray-500 ring-1 ring-gray-200">
                    {s.order}
                  </span>
                  <div className="flex-1">
                    <div className="text-sm font-medium">{s.name}</div>
                    <div className="text-xs text-gray-500">
                      {s.assigneeRole
                        ? ROLE_LABELS[s.assigneeRole as Role] ?? s.assigneeRole
                        : s.type === "SIGNATURE"
                        ? "Assigned signers"
                        : "Unassigned"}
                      {s.type !== "SIGNATURE" && <> · {s.completionRule} must act</>}
                    </div>
                  </div>
                  <span className={`badge ${TYPE_COLORS[s.type]}`}>
                    {STEP_TYPE_LABELS[s.type as StepType]}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-400">
        Note: this MVP ships three seeded workflow templates. A visual
        workflow-builder (add/reorder steps, pick assignees) is a natural next
        step — the data model already supports arbitrary step sequences.
      </p>
    </div>
  );
}
