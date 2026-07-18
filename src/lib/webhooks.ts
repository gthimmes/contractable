import { createHmac } from "crypto";
import { prisma } from "./db";

// Outbound webhooks: lifecycle events POST an HMAC-signed JSON payload to
// admin-managed endpoints. Dispatch piggybacks on the audit log (one call
// site, recordAudit), runs detached after a short delay so the enclosing
// transaction commits first, and every attempt is logged to WebhookDelivery.

/** Audit action → webhook event. Actions not listed don't emit webhooks. */
export const AUDIT_TO_EVENT: Record<string, string> = {
  CONTRACT_CREATED: "contract.created",
  CONTRACT_UPDATED: "contract.updated",
  CONTRACT_APPROVED: "contract.approved",
  CONTRACT_EXECUTED: "contract.executed",
  CONTRACT_REJECTED: "contract.rejected",
  CONTRACT_DELETED: "contract.deleted",
  AMENDMENT_CREATED: "contract.amended",
  WORKFLOW_STARTED: "workflow.started",
  SENT_FOR_SIGNATURE: "signature.requested",
  SIGNED: "signature.signed",
  DECLINED: "signature.declined",
  REDLINE_PROPOSED: "redline.proposed",
  REDLINE_ACCEPTED: "redline.accepted",
  REDLINE_REJECTED: "redline.rejected",
  DOCUMENT_GENERATED: "document.generated",
  OBLIGATION_ADDED: "obligation.added",
};

export const WEBHOOK_EVENTS = [...new Set(Object.values(AUDIT_TO_EVENT))].sort();

export interface WebhookPayload {
  event: string;
  timestamp: string;
  contractId: string | null;
  entityType: string;
  entityId: string;
  summary: string;
  actor: string | null;
}

/** Hex HMAC-SHA256 of the body — the value of X-Contractable-Signature. */
export function signPayload(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

/** Does an endpoint's event filter ("*" or CSV) match this event? */
export function eventMatches(filter: string, event: string): boolean {
  const f = filter.trim();
  if (f === "" || f === "*") return true;
  return f
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .some((pattern) =>
      pattern.endsWith(".*")
        ? event.startsWith(pattern.slice(0, -1))
        : pattern === event
    );
}

async function deliverOne(
  endpoint: { id: string; url: string; secret: string },
  event: string,
  body: string
): Promise<void> {
  let status = "SENT";
  let responseCode: number | null = null;
  let error: string | null = null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(endpoint.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Contractable-Event": event,
        "X-Contractable-Signature": signPayload(endpoint.secret, body),
      },
      body,
      signal: controller.signal,
    });
    clearTimeout(timer);
    responseCode = res.status;
    if (!res.ok) {
      status = "FAILED";
      error = `HTTP ${res.status}`;
    }
  } catch (err) {
    status = "FAILED";
    error = err instanceof Error ? err.message : String(err);
  }
  await prisma.webhookDelivery
    .create({
      data: { endpointId: endpoint.id, event, payload: body, status, responseCode, error },
    })
    .catch(() => {});
  if (status === "FAILED") {
    console.error(`[webhooks] ${event} → ${endpoint.url} FAILED: ${error}`);
  }
}

/**
 * Fire-and-forget dispatch to every active, matching endpoint. Called from
 * recordAudit (usually inside a transaction), so the actual network work is
 * delayed 250ms to let the transaction commit — a failure only logs.
 */
export function dispatchWebhooks(payload: WebhookPayload): void {
  void (async () => {
    await new Promise((r) => setTimeout(r, 250));
    try {
      const endpoints = await prisma.webhookEndpoint.findMany({ where: { active: true } });
      const matching = endpoints.filter((e) => eventMatches(e.events, payload.event));
      if (matching.length === 0) return;
      const body = JSON.stringify(payload);
      await Promise.all(matching.map((e) => deliverOne(e, payload.event, body)));
    } catch (err) {
      console.error("[webhooks] dispatch failed:", err);
    }
  })();
}
