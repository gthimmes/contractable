"use client";

import { useState } from "react";
import { proposeRedlineAction } from "@/app/actions";

/**
 * Lets a reviewer propose a redlined revision: edit the current text, add a
 * note, and submit it as a PROPOSED version that an owner can accept or reject.
 * Collapsed by default to keep the review panel tidy.
 */
export function RedlineEditor({
  contractId,
  currentBody,
}: {
  contractId: string;
  currentBody: string;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-medium text-brand-600 hover:underline"
      >
        ✎ Propose a redline
      </button>
    );
  }

  return (
    <form action={proposeRedlineAction} className="space-y-3">
      <input type="hidden" name="contractId" value={contractId} />
      <div>
        <label className="label">Proposed text</label>
        <textarea
          name="body"
          rows={16}
          defaultValue={currentBody}
          className="input font-mono text-xs"
        />
      </div>
      <div>
        <label className="label">Note (what changed &amp; why)</label>
        <input name="note" className="input" placeholder="e.g. Cap liability at 12 months of fees" />
      </div>
      <div className="flex gap-2">
        <button type="submit" className="btn-primary">
          Submit redline
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="btn-secondary"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
