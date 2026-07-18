"use client";

import { useRef, useState } from "react";

export interface ClauseOption {
  id: string;
  name: string;
  category: string | null;
  body: string;
}

/**
 * The template-body textarea with a clause-library picker. Selecting a clause
 * inserts its text at the cursor (on its own paragraph), so legal can compose
 * templates from pre-approved language instead of retyping it.
 */
export function TemplateBodyEditor({
  name,
  defaultValue,
  placeholder,
  clauses,
}: {
  name: string;
  defaultValue?: string;
  placeholder?: string;
  clauses: ClauseOption[];
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState<ClauseOption | null>(null);

  function insert(clause: ClauseOption) {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    const before = el.value.slice(0, start);
    const after = el.value.slice(end);
    // Give the clause its own paragraph without stacking blank lines.
    const lead = before === "" || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
    const tail = after === "" || after.startsWith("\n") ? "" : "\n\n";
    const inserted = lead + clause.body.trim() + tail;
    el.value = before + inserted + after;
    const cursor = start + inserted.length;
    el.setSelectionRange(cursor, cursor);
    el.focus();
  }

  return (
    <div className="space-y-2">
      {clauses.length > 0 && (
        <div className="flex items-center gap-2">
          <select
            className="input max-w-xs text-sm"
            value=""
            onChange={(e) => {
              const clause = clauses.find((c) => c.id === e.target.value);
              if (clause) {
                insert(clause);
                setPreview(clause);
              }
            }}
          >
            <option value="">Insert clause from library…</option>
            {clauses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.category ? ` (${c.category})` : ""}
              </option>
            ))}
          </select>
          {preview && (
            <span className="text-xs text-gray-400">
              Inserted “{preview.name}” at the cursor.
            </span>
          )}
        </div>
      )}
      <textarea
        ref={ref}
        name={name}
        rows={16}
        required
        className="input font-mono text-xs"
        defaultValue={defaultValue}
        placeholder={placeholder}
      />
    </div>
  );
}
