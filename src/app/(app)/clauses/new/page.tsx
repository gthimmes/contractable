import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { ClauseForm } from "../ClauseForm";

export default async function NewClausePage() {
  const me = await getCurrentUser();
  if (!can({ id: me.id, role: me.role }, "template:manage")) redirect("/clauses");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/clauses" className="text-sm text-brand-600 hover:underline">
          ← Clause library
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">New clause</h1>
        <p className="text-sm text-gray-500">
          Write the language once, get it approved once, reuse it everywhere.
        </p>
      </div>
      <ClauseForm />
    </div>
  );
}
