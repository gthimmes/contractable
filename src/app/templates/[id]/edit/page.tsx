import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { saveTemplateAction } from "@/app/actions";
import { CONTRACT_CATEGORIES } from "@/lib/constants";

export default async function EditTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const template = await prisma.contractTemplate.findUnique({ where: { id } });
  if (!template) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/templates" className="text-sm text-brand-600 hover:underline">
          ← Templates
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Edit template
        </h1>
        <p className="text-sm text-gray-500">
          Write the document body once with merge fields; generate finished
          contracts from it later.
        </p>
      </div>

      <form action={saveTemplateAction} className="card space-y-5 p-6">
        <input type="hidden" name="id" value={template.id} />

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Name *</label>
            <input
              name="name"
              required
              className="input"
              defaultValue={template.name}
              placeholder="Mutual NDA"
            />
          </div>
          <div>
            <label className="label">Category</label>
            <select
              name="category"
              className="input"
              defaultValue={template.category ?? ""}
            >
              <option value="">—</option>
              {CONTRACT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="label">Description</label>
          <input
            name="description"
            className="input"
            defaultValue={template.description ?? ""}
            placeholder="Short summary of when to use this template"
          />
        </div>

        <div>
          <label className="label">Body *</label>
          <textarea
            name="body"
            rows={16}
            required
            className="input font-mono text-xs"
            defaultValue={template.body}
            placeholder="This Agreement is made between {{ org.legalName }} and {{ counterparty.legalName }}…"
          />
          <p className="mt-1 text-xs text-gray-500">
            Use {"{{ org.name }}"}, {"{{ counterparty.legalName }}"},{" "}
            {"{{ contract.value | money }}"}, {"{{ today | date }}"}, or any
            custom field like {"{{ projectName }}"}. Blocks:{" "}
            {"{{#if x}}…{{/if}}"} and {"{{#each list}}…{{/each}}"}.
          </p>
        </div>

        <div className="flex justify-end gap-3">
          <Link href="/templates" className="btn-secondary">
            Cancel
          </Link>
          <button type="submit" className="btn-primary">
            Save template
          </button>
        </div>
      </form>
    </div>
  );
}
