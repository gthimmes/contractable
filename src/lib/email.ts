import type { Db } from "./audit";

// Notification layer. The transport is intentionally pluggable: this MVP writes
// every message to an in-app outbox (the EmailMessage table) and logs it to the
// console, so approval requests and signing links are demoable with zero
// infrastructure. To send real email in production, replace the body of
// `deliver` with an SMTP/API call — the call sites don't change.

export type EmailKind =
  | "APPROVAL_REQUEST"
  | "SIGNATURE_REQUEST"
  | "CONTRACT_EXECUTED"
  | "CONTRACT_REJECTED"
  | "REDLINE_PROPOSED";

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

async function deliver(input: EmailInput): Promise<void> {
  // Production: send via SMTP / provider API here.
  console.log(`[email] → ${input.toEmail} :: ${input.subject}`);
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
  await deliver(input);
  return msg;
}

export async function queueEmails(db: Db, inputs: EmailInput[]) {
  for (const input of inputs) {
    await queueEmail(db, input);
  }
}
