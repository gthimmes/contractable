import { describe, it, expect } from "vitest";
import { createHmac } from "crypto";
import { signPayload, eventMatches, AUDIT_TO_EVENT, WEBHOOK_EVENTS } from "./webhooks";

describe("signPayload", () => {
  it("produces a hex HMAC-SHA256 a receiver can reproduce", () => {
    const body = JSON.stringify({ event: "contract.executed" });
    const sig = signPayload("whsec_abc", body);
    const expected = createHmac("sha256", "whsec_abc").update(body, "utf8").digest("hex");
    expect(sig).toBe(expected);
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes with either the secret or the body", () => {
    expect(signPayload("a", "x")).not.toBe(signPayload("b", "x"));
    expect(signPayload("a", "x")).not.toBe(signPayload("a", "y"));
  });
});

describe("eventMatches", () => {
  it("matches everything with * or an empty filter", () => {
    expect(eventMatches("*", "contract.executed")).toBe(true);
    expect(eventMatches("", "anything.at.all")).toBe(true);
  });

  it("matches exact names in a CSV list", () => {
    expect(eventMatches("contract.executed, signature.signed", "signature.signed")).toBe(true);
    expect(eventMatches("contract.executed", "contract.rejected")).toBe(false);
  });

  it("supports prefix wildcards like contract.*", () => {
    expect(eventMatches("contract.*", "contract.executed")).toBe(true);
    expect(eventMatches("contract.*", "signature.signed")).toBe(false);
    expect(eventMatches("redline.*, signature.signed", "redline.accepted")).toBe(true);
  });
});

describe("event map", () => {
  it("maps the key lifecycle audit actions", () => {
    expect(AUDIT_TO_EVENT.CONTRACT_EXECUTED).toBe("contract.executed");
    expect(AUDIT_TO_EVENT.SIGNED).toBe("signature.signed");
    expect(AUDIT_TO_EVENT.REDLINE_PROPOSED).toBe("redline.proposed");
  });

  it("exposes a deduplicated, sorted event catalog", () => {
    expect(WEBHOOK_EVENTS).toEqual([...new Set(WEBHOOK_EVENTS)].sort());
    expect(WEBHOOK_EVENTS).toContain("workflow.started");
  });
});
