import { redirect } from "next/navigation";
import { prisma } from "./db";
import { getSessionUser } from "./auth";

/**
 * The current acting user, resolved from the login session. Redirects to
 * /login when there is no valid session — so every authenticated page and
 * server action that calls this is protected by default.
 */
export async function getCurrentUser() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function getAllUsers() {
  return prisma.user.findMany({ orderBy: { createdAt: "asc" } });
}
