// Pipeline and cycle-time analytics computed from existing contract data.
// Pure functions over a snapshot (no DB access) so every number is unit-
// testable; the /insights page loads the rows and calls computeInsights.

import { CONTRACT_STATUS } from "./constants";

export interface ContractFacts {
  status: string;
  category: string | null;
  counterpartyName: string | null;
  value: number | null;
  createdAt: Date;
  executedAt: Date | null;
}

export interface MonthBucket {
  /** "2026-03" */
  month: string;
  count: number;
  value: number;
}

export interface GroupStat {
  key: string;
  count: number;
  value: number;
}

export interface Insights {
  total: number;
  totalValue: number;
  executedCount: number;
  executedValue: number;
  inFlightCount: number; // review/approval/signature stages
  funnel: GroupStat[]; // per status, lifecycle order
  avgCycleDays: number | null; // created → executed
  medianCycleDays: number | null;
  executedByMonth: MonthBucket[]; // trailing 6 months incl. current
  byCategory: GroupStat[];
  topCounterparties: GroupStat[]; // by value, top 5
}

const IN_FLIGHT = new Set(["IN_REVIEW", "APPROVED", "OUT_FOR_SIGNATURE"]);
const DAY = 24 * 60 * 60 * 1000;

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** The trailing `n` month keys ending at `now`, oldest first. */
export function trailingMonths(now: Date, n = 6): string[] {
  const out: string[] = [];
  let y = now.getUTCFullYear();
  let m = now.getUTCMonth();
  for (let i = 0; i < n; i++) {
    out.unshift(`${y}-${String(m + 1).padStart(2, "0")}`);
    m--;
    if (m < 0) {
      m = 11;
      y--;
    }
  }
  return out;
}

export function computeInsights(contracts: ContractFacts[], now: Date): Insights {
  const executed = contracts.filter((c) => c.executedAt);

  // Funnel in lifecycle order, only statuses that occur plus always EXECUTED.
  const statusCounts = new Map<string, number>();
  for (const c of contracts) {
    statusCounts.set(c.status, (statusCounts.get(c.status) ?? 0) + 1);
  }
  const funnel: GroupStat[] = CONTRACT_STATUS.filter(
    (s) => (statusCounts.get(s) ?? 0) > 0
  ).map((s) => ({
    key: s,
    count: statusCounts.get(s)!,
    value: contracts
      .filter((c) => c.status === s)
      .reduce((sum, c) => sum + (c.value ?? 0), 0),
  }));

  // Cycle time: created → executed.
  const cycles = executed
    .map((c) => (c.executedAt!.getTime() - c.createdAt.getTime()) / DAY)
    .filter((d) => d >= 0)
    .sort((a, b) => a - b);
  const avgCycleDays = cycles.length
    ? cycles.reduce((a, b) => a + b, 0) / cycles.length
    : null;
  const medianCycleDays = cycles.length
    ? cycles.length % 2
      ? cycles[(cycles.length - 1) / 2]
      : (cycles[cycles.length / 2 - 1] + cycles[cycles.length / 2]) / 2
    : null;

  // Executed volume by month over the trailing 6 months.
  const months = trailingMonths(now, 6);
  const byMonth = new Map(months.map((m) => [m, { month: m, count: 0, value: 0 }]));
  for (const c of executed) {
    const key = monthKey(c.executedAt!);
    const bucket = byMonth.get(key);
    if (bucket) {
      bucket.count++;
      bucket.value += c.value ?? 0;
    }
  }

  // Grouped breakdowns.
  const group = (keyOf: (c: ContractFacts) => string | null): GroupStat[] => {
    const m = new Map<string, GroupStat>();
    for (const c of contracts) {
      const key = keyOf(c) ?? "Uncategorized";
      const g = m.get(key) ?? { key, count: 0, value: 0 };
      g.count++;
      g.value += c.value ?? 0;
      m.set(key, g);
    }
    return [...m.values()].sort((a, b) => b.value - a.value || b.count - a.count);
  };

  return {
    total: contracts.length,
    totalValue: contracts.reduce((s, c) => s + (c.value ?? 0), 0),
    executedCount: executed.length,
    executedValue: executed.reduce((s, c) => s + (c.value ?? 0), 0),
    inFlightCount: contracts.filter((c) => IN_FLIGHT.has(c.status)).length,
    funnel,
    avgCycleDays,
    medianCycleDays,
    executedByMonth: months.map((m) => byMonth.get(m)!),
    byCategory: group((c) => c.category),
    topCounterparties: group((c) => c.counterpartyName).slice(0, 5),
  };
}
