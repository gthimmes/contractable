"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { markNotificationsReadAction } from "@/app/actions";

export interface NotificationLite {
  id: string;
  title: string;
  kind: string;
  contractId: string | null;
  read: boolean;
  createdAt: string; // pre-formatted
}

/** Header bell: unread badge + dropdown of recent notifications. */
export function NotificationBell({
  notifications,
  unreadCount,
}: {
  notifications: NotificationLite[];
  unreadCount: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative grid h-9 w-9 place-items-center rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
        aria-label={`Notifications${unreadCount ? ` (${unreadCount} unread)` : ""}`}
      >
        {/* bell icon */}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-20 w-80 rounded-xl border border-gray-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
            <span className="text-sm font-semibold">Notifications</span>
            {unreadCount > 0 && (
              <form action={markNotificationsReadAction}>
                <button className="text-xs font-medium text-brand-600 hover:underline">
                  Mark all read
                </button>
              </form>
            )}
          </div>
          {notifications.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-gray-400">
              Nothing yet — approvals, signatures, and redlines land here.
            </p>
          ) : (
            <ul className="max-h-96 divide-y divide-gray-50 overflow-auto">
              {notifications.map((n) => {
                const inner = (
                  <>
                    <span className="flex items-start gap-2">
                      {!n.read && (
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                      )}
                      <span className={n.read ? "text-gray-500" : "font-medium text-gray-800"}>
                        {n.title}
                      </span>
                    </span>
                    <span className="mt-0.5 block pl-3.5 text-xs text-gray-400">{n.createdAt}</span>
                  </>
                );
                return (
                  <li key={n.id}>
                    {n.contractId ? (
                      <Link
                        href={`/contracts/${n.contractId}`}
                        className="block px-4 py-2.5 text-sm hover:bg-gray-50"
                        onClick={() => setOpen(false)}
                      >
                        {inner}
                      </Link>
                    ) : (
                      <span className="block px-4 py-2.5 text-sm">{inner}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
