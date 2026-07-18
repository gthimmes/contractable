import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { computeInsights } from "@/lib/insights";
import { formatMoney } from "@/components/ui";
import {
  CONTRACT_STATUS_LABELS,
  CONTRACT_STATUS_COLORS,
  type ContractStatus,
} from "@/lib/constants";

function Bar({ fraction, className }: { fraction: number; className?: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
      <div
        className={`h-full rounded-full ${className ?? "bg-brand-500"}`}
        style={{ width: `${Math.max(2, Math.round(fraction * 100))}%` }}
      />
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-5">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-gray-400">{hint}</div>}
    </div>
  );
}

export default async function InsightsPage() {
  const me = await getCurrentUser();
  if (!["ADMIN", "LEGAL", "MANAGER"].includes(me.role)) redirect("/");

  const rows = await prisma.contract.findMany({
    include: { counterpartyRef: true },
  });
  const insights = computeInsights(
    rows.map((c) => ({
      status: c.status,
      category: c.category,
      counterpartyName: c.counterpartyRef?.name ?? c.counterparty,
      value: c.value,
      createdAt: c.createdAt,
      executedAt: c.executedAt,
    })),
    new Date()
  );

  const maxMonth = Math.max(1, ...insights.executedByMonth.map((m) => m.count));
  const maxFunnel = Math.max(1, ...insights.funnel.map((f) => f.count));
  const maxCat = Math.max(1, ...insights.byCategory.map((g) => g.value), 1);
  const maxCp = Math.max(1, ...insights.topCounterparties.map((g) => g.value), 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Insights</h1>
        <p className="text-sm text-gray-500">
          Pipeline, cycle time, and value across the whole portfolio.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Contracts" value={String(insights.total)} hint={`${insights.inFlightCount} in flight`} />
        <Kpi
          label="Total value"
          value={formatMoney(insights.totalValue, "USD")}
          hint={`${formatMoney(insights.executedValue, "USD")} executed`}
        />
        <Kpi
          label="Executed"
          value={String(insights.executedCount)}
          hint={insights.total ? `${Math.round((insights.executedCount / insights.total) * 100)}% of portfolio` : undefined}
        />
        <Kpi
          label="Avg. cycle time"
          value={insights.avgCycleDays == null ? "—" : `${insights.avgCycleDays.toFixed(1)}d`}
          hint={
            insights.medianCycleDays == null
              ? "created → executed"
              : `median ${insights.medianCycleDays.toFixed(1)}d · created → executed`
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Funnel */}
        <section className="card p-5">
          <h2 className="mb-4 text-lg font-semibold">Pipeline by status</h2>
          <div className="space-y-3">
            {insights.funnel.map((f) => (
              <div key={f.key}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span
                      className={`badge ${CONTRACT_STATUS_COLORS[f.key as ContractStatus] ?? "bg-gray-100 text-gray-600"}`}
                    >
                      {CONTRACT_STATUS_LABELS[f.key as ContractStatus] ?? f.key}
                    </span>
                    <span className="text-gray-400">{f.count}</span>
                  </span>
                  <span className="text-xs text-gray-400">{formatMoney(f.value, "USD")}</span>
                </div>
                <Bar fraction={f.count / maxFunnel} />
              </div>
            ))}
          </div>
        </section>

        {/* Executed by month */}
        <section className="card p-5">
          <h2 className="mb-4 text-lg font-semibold">Executed — last 6 months</h2>
          <div className="flex h-40 items-end gap-3">
            {insights.executedByMonth.map((m) => (
              <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-xs text-gray-500">{m.count || ""}</span>
                <div
                  className="w-full rounded-t-md bg-brand-500/80"
                  style={{ height: `${(m.count / maxMonth) * 100}%`, minHeight: m.count ? 6 : 2 }}
                  title={`${m.month}: ${m.count} executed, ${formatMoney(m.value, "USD")}`}
                />
                <span className="text-[10px] text-gray-400">{m.month.slice(2)}</span>
              </div>
            ))}
          </div>
        </section>

        {/* By category */}
        <section className="card p-5">
          <h2 className="mb-4 text-lg font-semibold">Value by category</h2>
          <div className="space-y-3">
            {insights.byCategory.map((g) => (
              <div key={g.key}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span>
                    {g.key} <span className="text-gray-400">· {g.count}</span>
                  </span>
                  <span className="text-xs text-gray-400">{formatMoney(g.value, "USD")}</span>
                </div>
                <Bar fraction={g.value / maxCat} className="bg-indigo-400" />
              </div>
            ))}
          </div>
        </section>

        {/* Top counterparties */}
        <section className="card p-5">
          <h2 className="mb-4 text-lg font-semibold">Top counterparties by value</h2>
          <div className="space-y-3">
            {insights.topCounterparties.map((g) => (
              <div key={g.key}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span>
                    {g.key} <span className="text-gray-400">· {g.count}</span>
                  </span>
                  <span className="text-xs text-gray-400">{formatMoney(g.value, "USD")}</span>
                </div>
                <Bar fraction={g.value / maxCp} className="bg-emerald-400" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
