import type { Db } from "./audit";
import { prisma } from "./db";
import { sendSmtp, smtpConfigFromEnv } from "./smtp";

// Notification layer. Every message is written to the in-app outbox (the
// EmailMessage table) and logged to the console, so notifications are demoable
// with zero infrastructure. When SMTP_* environment variables are set
// (SMTP_HOST at minimum; see smtp.ts), each message is ALSO delivered over
// real SMTP and the outbox row records the outcome (SENT / FAILED).

export type EmailKind =
  | "APPROVAL_REQUEST"
  | "SIGNATURE_REQUEST"
  | "CONTRACT_EXECUTED"
  | "CONTRACT_REJECTED"
  | "REDLINE_PROPOSED"
  | "PASSWORD_RESET"
  | "REMINDER";

export interface EmailInput {
  toEmail: string;
  toName?: string | null;
  subject: string;
  body: string;
  kind: EmailKind;
  contractId?: string | null;
}

export function appUrl(): string {
  return process.env.APP_BASE_URL ?? "http://localhost:3000";
}

/**
 * Deliver one outbox row over SMTP, detached from the caller. queueEmail is
 * often invoked inside a Prisma transaction, and a network round-trip must
 * never hold a transaction open — so this runs fire-and-forget after a short
 * delay (letting the enclosing transaction commit) and records the outcome on
 * the row via the global client. A delivery failure only marks the row FAILED;
 * it never breaks the workflow that queued it.
 */
function deliverDetached(messageId: string, input: EmailInput): void {
  const config = smtpConfigFromEnv();
  if (!config) return;
  void (async () => {
    await new Promise((r) => setTimeout(r, 250));
    try {
      await sendSmtp(config, {
        to: input.toEmail,
        toName: input.toName,
        subject: input.subject,
        body: input.body,
      });
      await prisma.emailMessage.update({
        where: { id: messageId },
        data: { status: "SENT", deliveryError: null },
      });
      console.log(`[email] SMTP sent → ${input.toEmail} :: ${input.subject}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[email] SMTP FAILED → ${input.toEmail} :: ${message}`);
      await prisma.emailMessage
        .update({ where: { id: messageId }, data: { status: "FAILED", deliveryError: message } })
        .catch(() => {});
    }
  })();
}

/** Queue one notification: persist to the outbox and hand to the transport. */
export async function queueEmail(db: Db, input: EmailInput) {
  const msg = await db.emailMessage.create({
    data: {
      toEmail: input.toEmail,
      toName: input.toName ?? null,
      subject: input.subject,
      body: input.body,
      kind: input.kind,
      contractId: input.contractId ?? null,
    },
  });
  console.log(`[email] → ${input.toEmail} :: ${input.subject}`);
  deliverDetached(msg.id, input);
  return msg;
}

export async function queueEmails(db: Db, inputs: EmailInput[]) {
  for (const input of inputs) {
    await queueEmail(db, input);
  }
}
