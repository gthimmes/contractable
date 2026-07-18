import Link from "next/link";
import { getCurrentUser, getAllUsers } from "@/lib/session";
import { getImpersonatorId } from "@/lib/auth";
import { maybeRunSweep } from "@/lib/reminders";
import { UserMenu } from "@/components/UserMenu";
import { ROLE_LABELS, type Role } from "@/lib/constants";

const NAV: { href: string; label: string; roles?: string[] }[] = [
  { href: "/", label: "Dashboard" },
  { href: "/contracts", label: "Contracts" },
  { href: "/counterparties", label: "Counterparties" },
  { href: "/templates", label: "Templates" },
  { href: "/clauses", label: "Clauses" },
  { href: "/workflows", label: "Workflows" },
  { href: "/obligations", label: "Obligations" },
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
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-sm font-bold text-white">
                C
              </span>
              <span className="text-lg font-semibold tracking-tight">
                Contractable
              </span>
            </Link>
            <nav className="hidden items-center gap-1 md:flex">
              {NAV.filter((n) => !n.roles || n.roles.includes(me.role)).map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                >
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <form action="/search" method="get" className="hidden lg:block">
              <input
                name="q"
                placeholder="Search…"
                className="w-44 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none"
              />
            </form>
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
