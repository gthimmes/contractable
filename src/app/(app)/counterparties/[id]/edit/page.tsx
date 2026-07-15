import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { updateCounterpartyAction } from "@/app/actions";

export default async function EditCounterpartyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const me = await getCurrentUser();
  const meActor = { id: me.id, role: me.role };
  if (!can(meActor, "counterparty:manage")) redirect("/counterparties");

  const counterparty = await prisma.counterparty.findUnique({ where: { id } });
  if (!counterparty) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/counterparties" className="text-sm text-brand-600 hover:underline">
          ← Counterparties
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Edit counterparty
        </h1>
        <p className="text-sm text-gray-500">
          The other party to a contract. These details fill{" "}
          <code className="rounded bg-gray-100 px-1 text-xs">
            {"{{ counterparty.* }}"}
          </code>{" "}
          merge fields during document generation.
        </p>
      </div>

      <form action={updateCounterpartyAction} className="card space-y-5 p-6">
        <input type="hidden" name="id" value={counterparty.id} />

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Name *</label>
            <input
              name="name"
              required
              className="input"
              defaultValue={counterparty.name}
              placeholder="Globex"
            />
          </div>
          <div>
            <label className="label">Legal name</label>
            <input
              name="legalName"
              className="input"
              defaultValue={counterparty.legalName ?? ""}
              placeholder="Globex Corporation, Inc."
            />
          </div>
        </div>

        <div>
          <label className="label">Address</label>
          <input
            name="address"
            className="input"
            defaultValue={counterparty.address ?? ""}
            placeholder="500 Market St, Springfield"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Contact name</label>
            <input
              name="contactName"
              className="input"
              defaultValue={counterparty.contactName ?? ""}
              placeholder="Jane Doe"
            />
          </div>
          <div>
            <label className="label">Contact email</label>
            <input
              name="contactEmail"
              type="email"
              className="input"
              defaultValue={counterparty.contactEmail ?? ""}
              placeholder="jane@globex.com"
            />
          </div>
        </div>

        <div>
          <label className="label">Jurisdiction</label>
          <input
            name="jurisdiction"
            className="input"
            defaultValue={counterparty.jurisdiction ?? ""}
            placeholder="Delaware"
          />
        </div>

        <div>
          <label className="label">Notes</label>
          <textarea
            name="notes"
            rows={4}
            className="input"
            defaultValue={counterparty.notes ?? ""}
            placeholder="Internal notes about this counterparty…"
          />
        </div>

        <div className="flex justify-end gap-3">
          <Link href="/counterparties" className="btn-secondary">
            Cancel
          </Link>
          <button type="submit" className="btn-primary">
            Save changes
          </button>
        </div>
      </form>
    </div>
  );
}
