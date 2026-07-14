"use client";

import { useState } from "react";

/** Copies a signing link to the clipboard — handy for demoing the flow. */
export function CopyLink({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        const url = `${window.location.origin}${path}`;
        try {
          await navigator.clipboard.writeText(url);
        } catch {
          // Clipboard may be blocked; fall through to the visual cue anyway.
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="text-xs font-medium text-brand-600 hover:underline"
    >
      {copied ? "Copied!" : "Copy signing link"}
    </button>
  );
}
