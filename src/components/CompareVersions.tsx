"use client";

import { useState } from "react";
import { DiffView } from "./DiffView";

interface VersionLite {
  id: string;
  versionNumber: number;
  body: string;
  status: string;
  origin: string;
}

/**
 * Pick any two versions of a contract and see the tracked-changes diff
 * between them — the general form of the redline view.
 */
export function CompareVersions({ versions }: { versions: VersionLite[] }) {
  // versions arrive newest-first; default to previous → latest.
  const sorted = [...versions].sort((a, b) => a.versionNumber - b.versionNumber);
  const [fromId, setFromId] = useState(sorted[sorted.length - 2]?.id ?? sorted[0].id);
  const [toId, setToId] = useState(sorted[sorted.length - 1].id);

  const from = sorted.find((v) => v.id === fromId)!;
  const to = sorted.find((v) => v.id === toId)!;

  const label = (v: VersionLite) =>
    `v${v.versionNumber} · ${v.origin.toLowerCase()} · ${v.status.toLowerCase()}`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="text-gray-500">From</label>
        <select
          className="input max-w-52 text-sm"
          value={fromId}
          onChange={(e) => setFromId(e.target.value)}
        >
          {sorted.map((v) => (
            <option key={v.id} value={v.id}>
              {label(v)}
            </option>
          ))}
        </select>
        <label className="text-gray-500">to</label>
        <select
          className="input max-w-52 text-sm"
          value={toId}
          onChange={(e) => setToId(e.target.value)}
        >
          {sorted.map((v) => (
            <option key={v.id} value={v.id}>
              {label(v)}
            </option>
          ))}
        </select>
      </div>
      {from.id === to.id ? (
        <p className="text-sm text-gray-400">Pick two different versions to compare.</p>
      ) : (
        <DiffView oldText={from.body} newText={to.body} />
      )}
    </div>
  );
}
