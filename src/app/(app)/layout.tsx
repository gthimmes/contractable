import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser, getAllUsers } from "@/lib/session";
import { getImpersonatorId } from "@/lib/auth";
import { maybeRunSweep } from "@/lib/reminders";
import { UserMenu } from "@/components/UserMenu";
import { NavMore } from "@/components/NavMore";
import { NotificationBell } from "@/components/NotificationBell";
import { ROLE_LABELS, type Role } from "@/lib/constants";

// Primary destinations stay top-level; the library/ops pages fold into a
// "More" dropdown so the header fits at any admin viewport width.
const NAV: { href: string; label: string; roles?: string[] }[] = [
  { href: "/", label: "Dashboard" },
  { href: "/contracts", label: "Contracts" },
  { href: "/obligations", label: "Obligations" },
  { href: "/insights", label: "Insights", roles: ["ADMIN", "LEGAL", "MANAGER"] },
];

const NAV_MORE: { href: string; label: string; roles?: string[] }[] = [
  { href: "/counterparties", label: "Counterparties" },
  { href: "/templates", label: "Templates" },
  { href: "/clauses", label: "Clauses" },
  { href: "/workflows", label: "Workflows" },
  { href: "/outbox", label: "Outbox", roles: ["ADMIN", "LEGAL", "MANAGER"] },
  { href: "/audit", label: "Audit" },
  { href: "/settings", label: "Settings", roles: ["ADMIN"] },
];

// Authenticated app shell. getCurrentUser() redirects to /login when there is
// no valid session, so every route under (app) is protected here.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [me, users, impersonatorId] = await Promise.all([
    getCurrentUser(),
    getAllUsers(),
    getImpersonatorId(),
  ]);
  // Lazy scheduler: app traffic triggers the reminder sweep at most every 12h
  // (detached — never blocks a page load). Real deployments can also hit
  // /api/cron/reminders from a scheduler.
  void maybeRunSweep().catch(() => {});

  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: me.id },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.notification.count({ where: { userId: me.id, readAt: null } }),
  ]);
  const impersonating = !!impersonatorId;
  const canImpersonate = me.role === "ADMIN" || impersonating;

  return (
    <>
      {impersonating && (
        <div className="bg-amber-100 px-4 py-1.5 text-center text-xs font-medium text-amber-900">
          You are impersonating {me.name} ({ROLE_LABELS[me.role as Role] ?? me.role}).
          Choose your admin account in the top-right to return.
        </div>
      )}
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-4">
            <Link href="/" className="flex shrink-0 items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-sm font-bold text-white">
                C
              </span>
              <span className="hidden text-lg font-semibold tracking-tight sm:inline">
                Contractable
              </span>
            </Link>
            <nav className="hidden items-center gap-0.5 md:flex">
              {NAV.filter((n) => !n.roles || n.roles.includes(me.role)).map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                >
                  {n.label}
                </Link>
              ))}
              <NavMore
                items={NAV_MORE.filter((n) => !n.roles || n.roles.includes(me.role))}
              />
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <form action="/search" method="get" className="hidden lg:block">
              <input
                name="q"
                placeholder="Search…"
                className="w-36 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none"
              />
            </form>
            <NotificationBell
              unreadCount={unreadCount}
              notifications={notifications.map((n) => ({
                id: n.id,
                title: n.title,
                kind: n.kind,
                contractId: n.contractId,
                read: n.readAt !== null,
                createdAt: n.createdAt.toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                }),
              }))}
            />
            <UserMenu
              me={me}
              users={users}
              canImpersonate={canImpersonate}
              impersonating={impersonating}
            />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      <footer className="mx-auto max-w-6xl px-4 pb-10 pt-4 text-xs text-gray-400">
        Contractable · CLM MVP · signed-in as {me.name} (
        {ROLE_LABELS[me.role as Role] ?? me.role})
      </footer>
    </>
  );
}
