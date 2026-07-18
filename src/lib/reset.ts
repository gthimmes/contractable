import { randomBytes, createHash } from "crypto";
import { prisma } from "./db";
import { hashPassword } from "./password";
import { queueEmail, appUrl } from "./email";

// Password set/reset via single-use emailed tokens. Doubles as the invite
// flow: an admin creates a user without a password, and the user establishes
// one through "Forgot password". Only the sha256 of a token is stored, so a
// database leak never exposes a live reset link.

const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Issue a reset token for the account with this email — silently a no-op when
 * the account doesn't exist, so the endpoint can't be used to enumerate users.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) return;

  const token = randomBytes(32).toString("hex");
  await prisma.passwordResetToken.create({
    data: {
      tokenHash: hashToken(token),
      userId: user.id,
      expiresAt: new Date(Date.now() + RESET_TTL_MS),
    },
  });

  const link = `${appUrl()}/reset/${token}`;
  await queueEmail(prisma, {
    toEmail: user.email,
    toName: user.name,
    subject: "Set your Contractable password",
    body:
      `Hi ${user.name},\n\n` +
      `Use the link below to set a new password for your Contractable account. ` +
      `The link is valid for one hour and can be used once.\n\n` +
      `${link}\n\n` +
      `If you didn't request this, you can ignore this message — your password is unchanged.`,
    kind: "PASSWORD_RESET",
  });
}

/** Resolve a raw token to its user, or null if unknown/expired/used. */
export async function validateResetToken(token: string) {
  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) return null;
  return row;
}

/**
 * Complete a reset: set the new password, burn the token, and revoke every
 * existing session for the user (a reset is the recovery path from a
 * compromised credential — nothing issued before it should survive).
 */
export async function resetPassword(token: string, newPassword: string): Promise<boolean> {
  const row = await validateResetToken(token);
  if (!row) return false;
  await prisma.$transaction([
    prisma.user.update({
      where: { id: row.userId },
      data: { passwordHash: hashPassword(newPassword) },
    }),
    prisma.passwordResetToken.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    }),
    prisma.session.deleteMany({ where: { userId: row.userId } }),
  ]);
  return true;
}
