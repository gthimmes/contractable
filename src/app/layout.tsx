import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { getCurrentUser, getAllUsers } from "@/lib/session";
import { UserSwitcher } from "@/components/UserSwitcher";

export const metadata: Metadata = {
  title: "Contractable — Contract Lifecycle Management",
  description:
    "Draft, route for review and approval, sign, store, and enforce contracts.",
};

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/contracts", label: "Contracts" },
  { href: "/workflows", label: "Workflows" },
  { href: "/obligations", label: "Obligations" },
  { href: "/audit", label: "Audit" },
];

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [me, users] = await Promise.all([getCurrentUser(), getAllUsers()]);

  return (
    <html lang="en">
      <body>
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
                {NAV.map((n) => (
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
            <UserSwitcher users={users} currentId={me.id} />
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 pb-10 pt-4 text-xs text-gray-400">
          Contractable · CLM MVP · signed-in as {me.name}
        </footer>
      </body>
    </html>
  );
}
