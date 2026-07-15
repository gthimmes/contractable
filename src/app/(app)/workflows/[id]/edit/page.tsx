import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAllUsers, getCurrentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { WorkflowBuilder, type WorkflowInit } from "@/components/WorkflowBuilder";
import type { StepType } from "@/lib/constants";

export default async function EditWorkflowPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const me = await getCurrentUser();
  const meActor = { id: me.id, role: me.role };
  if (!can(meActor, "workflowTemplate:manage")) redirect("/workflows");

  const [template, users] = await Promise.all([
    prisma.workflowTemplate.findUnique({
      where: { id },
      include: { steps: { orderBy: { order: "asc" } } },
    }),
    getAllUsers(),
  ]);
  if (!template) notFound();

  const init: WorkflowInit = {
    id: template.id,
    name: template.name,
    description: template.description ?? "",
    isDefault: template.isDefault,
    steps: template.steps.map((s) => ({
      name: s.name,
      type: s.type as StepType,
      assigneeMode: s.assigneeUserId ? "user" : "role",
      assigneeRole: s.assigneeRole ?? "LEGAL",
      assigneeUserId: s.assigneeUserId ?? "",
      completionRule: s.completionRule,
      allowReject: s.allowReject,
    })),
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/workflows" className="text-sm text-brand-600 hover:underline">
          ← Workflows
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Edit workflow</h1>
        <p className="text-sm text-gray-500">
          Changes apply to future runs; contracts already in this workflow keep
          their original steps.
        </p>
      </div>
      <WorkflowBuilder users={users} init={init} />
    </div>
  );
}
