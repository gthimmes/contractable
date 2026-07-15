import Link from "next/link";
import { redirect } from "next/navigation";
import { getAllUsers, getCurrentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { WorkflowBuilder } from "@/components/WorkflowBuilder";

export default async function NewWorkflowPage() {
  const me = await getCurrentUser();
  const meActor = { id: me.id, role: me.role };
  if (!can(meActor, "workflowTemplate:manage")) redirect("/workflows");

  const users = await getAllUsers();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/workflows" className="text-sm text-brand-600 hover:underline">
          ← Workflows
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">New workflow</h1>
        <p className="text-sm text-gray-500">
          Compose an ordered set of review, approval, and signature steps.
        </p>
      </div>
      <WorkflowBuilder users={users} />
    </div>
  );
}
