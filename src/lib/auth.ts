import "server-only";
import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { prisma } from "./db";
import { verifyPassword } from "./password";

export { hashPassword } from "./password";

const SESSION_COOKIE = "contractable_session";
const IMPERSONATOR_COOKIE = "contractable_impersonator";
const SESSION_TTL_DAYS = 30;

// --- Sessions --------------------------------------------------------------

export function sessionCookieName() {
  return SESSION_COOKIE;
}

/**
 * Create a session for a user and set the httpOnly session cookie. Any stale
 * impersonation marker is cleared — a fresh sign-in must never inherit one
 * (impersonateAction re-sets it afterwards, deliberately).
 */
export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await prisma.session.create({ data: { token, userId, expiresAt } });
  const store = await cookies();
  store.delete(IMPERSONATOR_COOKIE);
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/** Resolve the current session's user, or null if unauthenticated/expired. */
export async function getSessionUser() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  return session.user;
}

/** Verify credentials and start a session. Returns true on success. */
export async function login(email: string, password: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) return false;
  if (!verifyPassword(password, user.passwordHash)) return false;
  await createSession(user.id);
  return true;
}

/** Destroy the current session and clear the cookies. */
export async function logout(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { token } });
  }
  store.delete(SESSION_COOKIE);
  store.delete(IMPERSONATOR_COOKIE);
}

// --- Admin impersonation ---------------------------------------------------
// Admins can act as another user to demo/verify role behaviour. The real
// admin's id is stashed in a separate httpOnly cookie so they can always
// return, and only an admin (or an active impersonation) can set it.

export async function getImpersonatorId(): Promise<string | null> {
  const store = await cookies();
  return store.get(IMPERSONATOR_COOKIE)?.value ?? null;
}

export async function setImpersonator(id: string | null): Promise<void> {
  const store = await cookies();
  if (id) {
    store.set(IMPERSONATOR_COOKIE, id, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
  } else {
    store.delete(IMPERSONATOR_COOKIE);
  }
}
