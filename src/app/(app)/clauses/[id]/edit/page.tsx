import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { ClauseForm } from "../../ClauseForm";

export default async function EditClausePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const me = await getCurrentUser();
  if (!can({ id: me.id, role: me.role }, "template:manage")) redirect("/clauses");

  const clause = await prisma.clause.findUnique({ where: { id } });
  if (!clause) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/clauses" className="text-sm text-brand-600 hover:underline">
          ← Clause library
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Edit clause</h1>
      </div>
      <ClauseForm clause={clause} />
    </div>
  );
}
