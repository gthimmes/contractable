"use client";

import { useState } from "react";
import { sendForSignatureAction } from "@/app/actions";

interface Row {
  name: string;
  email: string;
}

export function SendForSignature({ contractId }: { contractId: string }) {
  const [rows, setRows] = useState<Row[]>([{ name: "", email: "" }]);

  const update = (i: number, key: keyof Row, val: string) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, [key]: val } : row)));

  return (
    <form action={sendForSignatureAction} className="space-y-3">
      <input type="hidden" name="contractId" value={contractId} />
      <p className="text-sm text-gray-600">
        Signers sign in the order listed. Each receives a unique signing link.
      </p>
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-5 text-center text-xs text-gray-400">{i + 1}</span>
          <input
            name="signerName"
            value={row.name}
            onChange={(e) => update(i, "name", e.target.value)}
            placeholder="Signer name"
            className="input"
          />
          <input
            name="signerEmail"
            value={row.email}
            onChange={(e) => update(i, "email", e.target.value)}
            placeholder="email@company.com"
            type="email"
            className="input"
          />
          {rows.length > 1 && (
            <button
              type="button"
              onClick={() => setRows((r) => r.filter((_, idx) => idx !== i))}
              className="text-gray-400 hover:text-red-600"
              aria-label="Remove signer"
            >
              ✕
            </button>
          )}
        </div>
      ))}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setRows((r) => [...r, { name: "", email: "" }])}
          className="text-sm font-medium text-brand-600 hover:underline"
        >
          + Add signer
        </button>
        <button type="submit" className="btn-primary">
          Send for signature
        </button>
      </div>
    </form>
  );
}
