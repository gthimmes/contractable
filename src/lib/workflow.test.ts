import { describe, it, expect } from "vitest";
import { evaluateStepOutcome, positiveDecisionFor } from "./workflow";

describe("evaluateStepOutcome", () => {
  it("ALL rule stays ACTIVE until every assignee has acted positively", () => {
    expect(
      evaluateStepOutcome({
        completionRule: "ALL",
        allowReject: true,
        actions: [{ decision: "APPROVED" }, { decision: "PENDING" }],
      })
    ).toBe("ACTIVE");
  });

  it("ALL rule COMPLETES when every assignee acted positively", () => {
    expect(
      evaluateStepOutcome({
        completionRule: "ALL",
        allowReject: true,
        actions: [{ decision: "APPROVED" }, { decision: "APPROVED" }],
      })
    ).toBe("COMPLETED");
  });

  it("ANY rule COMPLETES on the first positive decision", () => {
    expect(
      evaluateStepOutcome({
        completionRule: "ANY",
        allowReject: true,
        actions: [{ decision: "PENDING" }, { decision: "REVIEWED" }],
      })
    ).toBe("COMPLETED");
  });

  it("ANY rule stays ACTIVE while all assignees are pending", () => {
    expect(
      evaluateStepOutcome({
        completionRule: "ANY",
        allowReject: true,
        actions: [{ decision: "PENDING" }, { decision: "PENDING" }],
      })
    ).toBe("ACTIVE");
  });

  it("a single rejection blocks the step when allowReject is set", () => {
    expect(
      evaluateStepOutcome({
        completionRule: "ALL",
        allowReject: true,
        actions: [{ decision: "APPROVED" }, { decision: "REJECTED" }],
      })
    ).toBe("REJECTED");
  });

  it("rejection is ignored when allowReject is false (advisory review)", () => {
    // With allowReject false, a REJECTED decision is not positive, so ALL
    // cannot complete — the step stays ACTIVE rather than short-circuiting.
    expect(
      evaluateStepOutcome({
        completionRule: "ALL",
        allowReject: false,
        actions: [{ decision: "APPROVED" }, { decision: "REJECTED" }],
      })
    ).toBe("ACTIVE");
  });

  it("rejection with allowReject false still allows ANY to complete via a positive", () => {
    expect(
      evaluateStepOutcome({
        completionRule: "ANY",
        allowReject: false,
        actions: [{ decision: "REJECTED" }, { decision: "APPROVED" }],
      })
    ).toBe("COMPLETED");
  });

  it("a step with no assignees is vacuously complete", () => {
    expect(
      evaluateStepOutcome({
        completionRule: "ALL",
        allowReject: true,
        actions: [],
      })
    ).toBe("COMPLETED");
  });

  it("SIGNED counts as a positive decision (signature steps)", () => {
    expect(
      evaluateStepOutcome({
        completionRule: "ALL",
        allowReject: true,
        actions: [{ decision: "SIGNED" }],
      })
    ).toBe("COMPLETED");
  });
});

describe("positiveDecisionFor", () => {
  it("maps step types to their positive decision", () => {
    expect(positiveDecisionFor("APPROVAL")).toBe("APPROVED");
    expect(positiveDecisionFor("REVIEW")).toBe("REVIEWED");
    expect(positiveDecisionFor("SIGNATURE")).toBe("SIGNED");
  });
});
