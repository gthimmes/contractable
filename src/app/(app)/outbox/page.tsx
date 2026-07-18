import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { formatDateTime, EmptyState } from "@/components/ui";

const KIND_LABELS: Record<string, string> = {
  APPROVAL_REQUEST: "Approval request",
  SIGNATURE_REQUEST: "Signature request",
  CONTRACT_EXECUTED: "Contract executed",
  CONTRACT_REJECTED: "Contract rejected",
  REDLINE_PROPOSED: "Redline proposed",
  PASSWORD_RESET: "Password reset",
  REMINDER: "Reminder",
};

const KIND_COLORS: Record<string, string> = {
  APPROVAL_REQUEST: "bg-amber-100 text-amber-800",
  SIGNATURE_REQUEST: "bg-purple-100 text-purple-800",
  CONTRACT_EXECUTED: "bg-emerald-100 text-emerald-800",
  CONTRACT_REJECTED: "bg-red-100 text-red-800",
  REDLINE_PROPOSED: "bg-blue-100 text-blue-800",
};

// Delivery outcome: LOGGED = outbox only (no SMTP configured), SENT = relayed
// over SMTP, FAILED = SMTP attempt failed (error shown on the card).
const STATUS_COLORS: Record<string, string> = {
  LOGGED: "bg-gray-100 text-gray-600",
  SENT: "bg-emerald-100 text-emerald-800",
  FAILED: "bg-red-100 text-red-800",
};

export default async function OutboxPage() {
  const me = await getCurrentUser();
  // Internal ops view — not for external signers or read-only viewers.
  if (!["ADMIN", "LEGAL", "MANAGER"].includes(me.role)) redirect("/");

  const messages = await prisma.emailMessage.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Notifications outbox</h1>
        <p className="text-sm text-gray-500">
          Every notification the system has sent — approval requests, signing
          links, and status updates. Messages are always recorded here; when
          SMTP is configured (SMTP_HOST et al.) they are also delivered as real
          email and the delivery outcome is shown on each card.
        </p>
      </div>

      {messages.length === 0 ? (
        <EmptyState>No notifications sent yet.</EmptyState>
      ) : (
        <div className="space-y-3">
          {messages.map((m) => (
            <div key={m.id} className="card p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`badge ${KIND_COLORS[m.kind] ?? "bg-gray-100 text-gray-700"}`}>
                      {KIND_LABELS[m.kind] ?? m.kind}
                    </span>
                    <span className="text-sm font-medium text-gray-800">{m.subject}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-gray-500">
                    To: {m.toName ? `${m.toName} <${m.toEmail}>` : m.toEmail}
                  </div>
                  {m.status === "FAILED" && m.deliveryError && (
                    <div className="mt-0.5 text-xs text-red-600">{m.deliveryError}</div>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 text-xs text-gray-400">
                  <div className="flex items-center gap-2">
                    <span
                      className={`badge ${STATUS_COLORS[m.status] ?? "bg-gray-100 text-gray-600"}`}
                      title={m.deliveryError ?? undefined}
                    >
                      {m.status}
                    </span>
                    <span>{formatDateTime(m.createdAt)}</span>
                  </div>
                  {m.contractId && (
                    <Link href={`/contracts/${m.contractId}`} className="text-brand-600 hover:underline">
                      Open contract →
                    </Link>
                  )}
                </div>
              </div>
              <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-xs leading-relaxed text-gray-600">
                {m.body}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
