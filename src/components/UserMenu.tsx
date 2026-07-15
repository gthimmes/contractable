"use client";

import { useRef } from "react";
import { impersonateAction, logoutAction } from "@/app/actions";
import { ROLE_LABELS, type Role } from "@/lib/constants";

interface UserLite {
  id: string;
  name: string;
  role: string;
}

/**
 * Header account control: shows the signed-in user and a log-out button.
 * Admins (and an active impersonation) also get a switcher to act as any user
 * — the real-auth replacement for the old free identity switcher.
 */
export function UserMenu({
  me,
  users,
  canImpersonate,
  impersonating,
}: {
  me: UserLite;
  users: UserLite[];
  canImpersonate: boolean;
  impersonating: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <div className="flex items-center gap-3">
      {canImpersonate ? (
        <form ref={formRef} action={impersonateAction} className="flex items-center gap-1.5">
          <label className="text-xs font-medium text-gray-400">
            {impersonating ? "Impersonating" : "View as"}
          </label>
          <select
            key={me.id}
            name="userId"
            defaultValue={me.id}
            onChange={() => formRef.current?.requestSubmit()}
            className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm font-medium shadow-sm focus:border-brand-500 focus:outline-none"
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} — {ROLE_LABELS[u.role as Role] ?? u.role}
              </option>
            ))}
          </select>
        </form>
      ) : (
        <span className="text-sm text-gray-600">
          {me.name}{" "}
          <span className="text-gray-400">({ROLE_LABELS[me.role as Role] ?? me.role})</span>
        </span>
      )}
      <form action={logoutAction}>
        <button className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
          Log out
        </button>
      </form>
    </div>
  );
}
