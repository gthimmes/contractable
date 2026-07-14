"use client";

import { useState, useEffect, useMemo } from "react";
import { renderTemplate, extractVariables } from "@/lib/template";
import { generateDocumentAction } from "@/app/actions";

interface TemplateLite {
  id: string;
  name: string;
  category: string | null;
  body: string;
}

// Namespaces that are auto-bound from database records (org/counterparty/
// contract) or computed (today). Anything else is a custom field the author
// fills in here.
const RESERVED = ["org", "counterparty", "contract", "today"];

function resolve(ctx: Record<string, unknown>, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>((o, k) => (o == null ? undefined : (o as Record<string, unknown>)[k]), ctx);
}

/**
 * Document generation: pick a template, see which fields bind to database data
 * vs. which you must supply, fill the custom fields, watch a live preview, then
 * generate — writing the rendered text as a new contract version.
 */
export function GenerateDocument({
  contractId,
  templates,
  baseContext,
}: {
  contractId: string;
  templates: TemplateLite[];
  baseContext: Record<string, unknown>;
}) {
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const template = templates.find((t) => t.id === templateId);

  const vars = useMemo(
    () => (template ? extractVariables(template.body) : []),
    [template]
  );
  const customFields = useMemo(
    () => vars.filter((v) => !RESERVED.includes(v.split(".")[0])),
    [vars]
  );
  const boundFields = useMemo(
    () => vars.filter((v) => RESERVED.includes(v.split(".")[0])),
    [vars]
  );

  const [custom, setCustom] = useState<Record<string, string>>({});

  // Seed custom fields from any values already saved on the contract.
  useEffect(() => {
    const seed: Record<string, string> = {};
    for (const f of customFields) {
      const existing = baseContext[f];
      seed[f] = existing == null ? "" : String(existing);
    }
    setCustom(seed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  const mergedContext = { ...baseContext, ...custom };
  const preview = template ? renderTemplate(template.body, mergedContext) : "";

  if (templates.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        No templates yet. Create one under <span className="font-medium">Templates</span> to
        generate documents.
      </p>
    );
  }

  return (
    <form action={generateDocumentAction} className="space-y-4">
      <input type="hidden" name="contractId" value={contractId} />
      <input type="hidden" name="templateId" value={templateId} />
      <input type="hidden" name="data" value={JSON.stringify(custom)} />

      <div>
        <label className="label">Template</label>
        <select
          className="input"
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
        >
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {t.category ? ` (${t.category})` : ""}
            </option>
          ))}
        </select>
      </div>

      {boundFields.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <div className="mb-1 text-xs font-medium text-gray-500">
            Auto-filled from records
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            {boundFields.map((f) => {
              const v = resolve(baseContext, f);
              return (
                <div key={f} className="flex justify-between gap-2">
                  <code className="text-gray-500">{`{{${f}}}`}</code>
                  <span className="truncate text-gray-800">
                    {v == null || v === "" ? "—" : String(v)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {customFields.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-gray-500">Fill in</div>
          {customFields.map((f) => (
            <div key={f}>
              <label className="mb-1 block text-xs text-gray-600">
                <code>{`{{${f}}}`}</code>
              </label>
              <input
                className="input"
                value={custom[f] ?? ""}
                onChange={(e) =>
                  setCustom((c) => ({ ...c, [f]: e.target.value }))
                }
              />
            </div>
          ))}
        </div>
      )}

      <div>
        <div className="mb-1 text-xs font-medium text-gray-500">Live preview</div>
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-gray-200 bg-white p-4 text-xs leading-relaxed text-gray-700">
          {preview}
        </pre>
      </div>

      <button type="submit" className="btn-primary">
        Generate document
      </button>
    </form>
  );
}
