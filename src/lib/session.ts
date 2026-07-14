import { cookies } from "next/headers";
import { prisma } from "./db";

const COOKIE = "contractable_uid";

/**
 * The current acting user. Auth is intentionally lightweight for this MVP: a
 * cookie holds the selected user id and the header lets you switch identities
 * so a single person can walk a contract through every role (draft → review →
 * approve → sign). Swap this module for real auth (SSO/session) in production.
 */
export async function getCurrentUser() {
  const store = await cookies();
  const uid = store.get(COOKIE)?.value;
  if (uid) {
    const user = await prisma.user.findUnique({ where: { id: uid } });
    if (user) return user;
  }
  // Default to an admin so the app is usable on first load.
  const fallback = await prisma.user.findFirst({
    orderBy: { createdAt: "asc" },
  });
  if (!fallback) {
    throw new Error("No users exist. Run `npm run db:seed`.");
  }
  return fallback;
}

export async function getAllUsers() {
  return prisma.user.findMany({ orderBy: { createdAt: "asc" } });
}

export function currentUserCookieName() {
  return COOKIE;
}
