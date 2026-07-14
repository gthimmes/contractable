"use client";

import { useRef } from "react";
import { switchUserAction } from "@/app/actions";
import { ROLE_LABELS, type Role } from "@/lib/constants";

interface UserLite {
  id: string;
  name: string;
  role: string;
}

/**
 * Identity switcher. Because auth is stubbed for this MVP, this lets you act as
 * any seeded user to exercise every role in a workflow. It submits a server
 * action on change to set the current-user cookie.
 */
export function UserSwitcher({
  users,
  currentId,
}: {
  users: UserLite[];
  currentId: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form ref={formRef} action={switchUserAction} className="flex items-center gap-2">
      <label className="text-xs font-medium text-gray-400">Acting as</label>
      <select
        key={currentId}
        name="userId"
        defaultValue={currentId}
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
  );
}
