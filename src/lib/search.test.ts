import { describe, it, expect } from "vitest";
import { makeSnippet } from "./search";

const doc =
  "MASTER SERVICES AGREEMENT\n\nThis Agreement is entered into between Acme, Inc. " +
  "and Wonka Industries. The parties agree that liability shall not exceed the fees " +
  "paid in the six (6) months preceding the claim. Liability for breaches of " +
  "confidentiality is excluded from this cap.";

describe("makeSnippet", () => {
  it("returns null when the query does not occur", () => {
    expect(makeSnippet(doc, "arbitration")).toBeNull();
    expect(makeSnippet(doc, "")).toBeNull();
    expect(makeSnippet(doc, "   ")).toBeNull();
  });

  it("finds matches case-insensitively and flags every occurrence in view", () => {
    const parts = makeSnippet(doc, "liability")!;
    const matches = parts.filter((p) => p.match);
    expect(matches.length).toBeGreaterThanOrEqual(2); // "liability" and "Liability"
    expect(matches[0].text.toLowerCase()).toBe("liability");
    // Original casing is preserved in the flagged text.
    expect(matches.some((p) => p.text === "Liability")).toBe(true);
  });

  it("adds ellipses only where the excerpt is truncated", () => {
    const startHit = makeSnippet(doc, "MASTER SERVICES")!;
    expect(startHit[0].text.startsWith("…")).toBe(false);
    expect(startHit[startHit.length - 1].text.endsWith("…")).toBe(true);

    const middleHit = makeSnippet(doc, "six (6) months")!;
    expect(middleHit[0].text.startsWith("…")).toBe(true);
  });

  it("reassembles into readable text containing the query", () => {
    const parts = makeSnippet(doc, "Wonka")!;
    const text = parts.map((p) => p.text).join("");
    expect(text).toContain("Wonka Industries");
    // Newlines are collapsed for one-line display.
    expect(text).not.toContain("\n");
  });

  it("handles a query longer than the radius", () => {
    const long = "preceding the claim. Liability for breaches of confidentiality";
    const parts = makeSnippet(doc, long, 20)!;
    expect(parts.some((p) => p.match)).toBe(true);
  });
});
