import type { Role } from "./constants";

// Central authorization policy. `can()` is a pure function so it can gate both
// the UI (hide controls a user may not use) and the server actions (the real
// security boundary — assertCan throws if a request isn't permitted).

export type Action =
  // Contract-scoped (owner/creator may also be granted — see OWNER_ACTIONS)
  | "contract:create"
  | "contract:edit"
  | "contract:delete"
  | "contract:generate"
  | "contract:version"
  | "workflow:start"
  | "redline:propose"
  | "redline:resolve" // accept or reject a redline
  | "signature:manage" // send for signature / remove a signer
  | "obligation:manage"
  | "comment:create"
  // Admin / configuration
  | "counterparty:manage"
  | "template:manage"
  | "workflowTemplate:manage"
  | "org:manage"
  | "user:manage";

export interface Actor {
  id: string;
  role: string;
}

export interface ResourceCtx {
  ownerId?: string | null;
  createdById?: string | null;
}

// Roles that satisfy an action purely by role, regardless of ownership.
const ROLE_ACTIONS: Record<Action, Role[]> = {
  "contract:create": ["ADMIN", "LEGAL", "MANAGER"],
  "contract:edit": ["ADMIN", "LEGAL", "MANAGER"],
  "contract:delete": ["ADMIN"],
  "contract:generate": ["ADMIN", "LEGAL", "MANAGER"],
  "contract:version": ["ADMIN", "LEGAL", "MANAGER"],
  "workflow:start": ["ADMIN", "LEGAL", "MANAGER"],
  "redline:propose": ["ADMIN", "LEGAL", "MANAGER"],
  "redline:resolve": ["ADMIN", "LEGAL"],
  "signature:manage": ["ADMIN", "LEGAL", "MANAGER"],
  "obligation:manage": ["ADMIN", "LEGAL", "MANAGER"],
  "comment:create": ["ADMIN", "LEGAL", "MANAGER", "SIGNER"],
  "counterparty:manage": ["ADMIN", "LEGAL", "MANAGER"],
  "template:manage": ["ADMIN", "LEGAL"],
  "workflowTemplate:manage": ["ADMIN", "LEGAL"],
  "org:manage": ["ADMIN"],
  "user:manage": ["ADMIN"],
};

// Actions the contract's owner or original creator may perform even if their
// role alone wouldn't grant it (e.g. a MANAGER who owns a deal can delete its
// draft; a SIGNER who somehow owns one can manage it).
const OWNER_ACTIONS = new Set<Action>([
  "contract:edit",
  "contract:delete",
  "contract:generate",
  "contract:version",
  "workflow:start",
  "redline:propose",
  "redline:resolve",
  "signature:manage",
  "obligation:manage",
]);

export function can(
  actor: Actor,
  action: Action,
  resource?: ResourceCtx
): boolean {
  if ((ROLE_ACTIONS[action] as readonly string[]).includes(actor.role)) {
    return true;
  }
  if (resource && OWNER_ACTIONS.has(action)) {
    if (resource.ownerId && resource.ownerId === actor.id) return true;
    if (resource.createdById && resource.createdById === actor.id) return true;
  }
  return false;
}

export class PermissionError extends Error {
  constructor(action: Action) {
    super(`You don't have permission to ${action.replace(":", " ")}.`);
    this.name = "PermissionError";
  }
}

export function assertCan(
  actor: Actor,
  action: Action,
  resource?: ResourceCtx
): void {
  if (!can(actor, action, resource)) {
    throw new PermissionError(action);
  }
}

// True if the role can perform at least one mutating action anywhere — used to
// distinguish read-only users (VIEWER) in the UI.
export function isReadOnly(role: string): boolean {
  return role === "VIEWER";
}
