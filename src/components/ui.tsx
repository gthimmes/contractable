import {
  CONTRACT_STATUS_COLORS,
  CONTRACT_STATUS_LABELS,
  type ContractStatus,
} from "@/lib/constants";

export function StatusBadge({ status }: { status: string }) {
  const s = status as ContractStatus;
  const color = CONTRACT_STATUS_COLORS[s] ?? "bg-gray-100 text-gray-700";
  const label = CONTRACT_STATUS_LABELS[s] ?? status;
  return <span className={`badge ${color}`}>{label}</span>;
}

const STEP_COLORS: Record<string, string> = {
  PENDING: "bg-gray-100 text-gray-600",
  ACTIVE: "bg-amber-100 text-amber-800",
  COMPLETED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-red-100 text-red-800",
  SKIPPED: "bg-gray-100 text-gray-500",
  SIGNED: "bg-emerald-100 text-emerald-800",
  DECLINED: "bg-red-100 text-red-800",
  OPEN: "bg-blue-100 text-blue-800",
  DONE: "bg-emerald-100 text-emerald-800",
  WAIVED: "bg-gray-200 text-gray-600",
  OVERDUE: "bg-red-100 text-red-800",
};

export function Pill({ value }: { value: string }) {
  const color = STEP_COLORS[value] ?? "bg-gray-100 text-gray-700";
  return <span className={`badge ${color}`}>{value}</span>;
}

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatMoney(
  value: number | null | undefined,
  currency = "USD"
): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-white/50 p-8 text-center text-sm text-gray-500">
      {children}
    </div>
  );
}
