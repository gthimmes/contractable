import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { upcomingObligations, effectiveStatus } from "@/lib/obligations";
import {
  StatusBadge,
  Pill,
  formatDate,
  formatMoney,
  EmptyState,
} from "@/components/ui";
import { STEP_TYPE_LABELS, type StepType } from "@/lib/constants";

function Stat({
  label,
  value,
  href,
  tone = "default",
}: {
  label: string;
  value: number | string;
  href: string;
  tone?: "default" | "amber" | "purple" | "green" | "red";
}) {
  const tones: Record<string, string> = {
    default: "text-gray-900",
    amber: "text-amber-600",
    purple: "text-purple-600",
    green: "text-emerald-600",
    red: "text-red-600",
  };
  return (
    <Link href={href} className="card p-5 transition hover:shadow-md">
      <div className={`text-3xl font-semibold ${tones[tone]}`}>{value}</div>
      <div className="mt-1 text-sm text-gray-500">{label}</div>
    </Link>
  );
}

export default async function DashboardPage() {
  const me = await getCurrentUser();

  const [
    total,
    inReview,
    outForSig,
    active,
    myTasks,
    upcoming,
    recent,
  ] = await Promise.all([
    prisma.contract.count(),
    prisma.contract.count({ where: { status: "IN_REVIEW" } }),
    prisma.contract.count({ where: { status: "OUT_FOR_SIGNATURE" } }),
    prisma.contract.count({ where: { status: { in: ["EXECUTED", "ACTIVE"] } } }),
    prisma.workflowStepAction.findMany({
      where: {
        assigneeId: me.id,
        decision: "PENDING",
        step: { status: "ACTIVE" },
      },
      include: { step: { include: { instance: { include: { contract: true } } } } },
    }),
    upcomingObligations(45),
    prisma.auditEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { contract: true },
    }),
  ]);

  const overdue = upcoming.filter((o) => effectiveStatus(o) === "OVERDUE");

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-gray-500">
            Welcome back, {me.name.split(" ")[0]}.
          </p>
        </div>
        <Link href="/contracts/new" className="btn-primary">
          + New Contract
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Total contracts" value={total} href="/contracts" />
        <Stat label="In review" value={inReview} href="/contracts?status=IN_REVIEW" tone="amber" />
        <Stat label="Out for signature" value={outForSig} href="/contracts?status=OUT_FOR_SIGNATURE" tone="purple" />
        <Stat label="Executed / active" value={active} href="/contracts?status=EXECUTED" tone="green" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* My pending approvals */}
        <section className="card p-5">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
            My pending actions
            {myTasks.length > 0 && (
              <span className="badge bg-brand-100 text-brand-700">{myTasks.length}</span>
            )}
          </h2>
          {myTasks.length === 0 ? (
            <EmptyState>You have nothing waiting on you. 🎉</EmptyState>
          ) : (
            <ul className="divide-y divide-gray-100">
              {myTasks.map((t) => (
                <li key={t.id} className="flex items-center justify-between py-3">
                  <div>
                    <Link
                      href={`/contracts/${t.step.instance.contractId}`}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {t.step.instance.contract.title}
                    </Link>
                    <div className="text-xs text-gray-500">
                      {STEP_TYPE_LABELS[t.step.type as StepType]} · {t.step.name}
                    </div>
                  </div>
                  <Pill value={t.step.type === "APPROVAL" ? "APPROVE" : "REVIEW"} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Enforcement */}
        <section className="card p-5">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
            Upcoming obligations
            {overdue.length > 0 && (
              <span className="badge bg-red-100 text-red-700">
                {overdue.length} overdue
              </span>
            )}
          </h2>
          {upcoming.length === 0 ? (
            <EmptyState>No obligations due in the next 45 days.</EmptyState>
          ) : (
            <ul className="divide-y divide-gray-100">
              {upcoming.slice(0, 6).map((o) => (
                <li key={o.id} className="flex items-center justify-between py-3">
                  <div>
                    <Link
                      href={`/contracts/${o.contractId}`}
                      className="font-medium text-gray-900 hover:underline"
                    >
                      {o.title}
                    </Link>
                    <div className="text-xs text-gray-500">
                      {o.contract.reference} · due {formatDate(o.dueDate)}
                    </div>
                  </div>
                  <Pill value={effectiveStatus(o)} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Recent activity */}
      <section className="card p-5">
        <h2 className="mb-4 text-lg font-semibold">Recent activity</h2>
        <ul className="space-y-2">
          {recent.map((e) => (
            <li key={e.id} className="flex items-start gap-3 text-sm">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
              <div>
                <span className="text-gray-800">{e.summary}</span>{" "}
                {e.contract && (
                  <Link
                    href={`/contracts/${e.contractId}`}
                    className="text-brand-600 hover:underline"
                  >
                    ({e.contract.reference})
                  </Link>
                )}
                <span className="ml-1 text-xs text-gray-400">
                  · {formatDate(e.createdAt)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
