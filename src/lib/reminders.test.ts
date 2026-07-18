import { describe, it, expect } from "vitest";
import {
  classifyObligation,
  isExpiringContract,
  needsReminder,
  UPCOMING_DAYS,
  EXPIRING_DAYS,
  COOLDOWN_DAYS,
} from "./reminders";

const NOW = new Date("2026-07-18T12:00:00Z");
const days = (n: number) => new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000);

describe("classifyObligation", () => {
  it("flags past-due open obligations as OVERDUE", () => {
    expect(classifyObligation({ status: "OPEN", dueDate: days(-1) }, NOW)).toBe("OVERDUE");
  });

  it("flags obligations due inside the upcoming window", () => {
    expect(classifyObligation({ status: "OPEN", dueDate: days(3) }, NOW)).toBe("UPCOMING");
    expect(classifyObligation({ status: "OPEN", dueDate: days(UPCOMING_DAYS) }, NOW)).toBe("UPCOMING");
  });

  it("ignores obligations due beyond the window", () => {
    expect(classifyObligation({ status: "OPEN", dueDate: days(UPCOMING_DAYS + 1) }, NOW)).toBeNull();
  });

  it("ignores done/waived obligations and missing due dates", () => {
    expect(classifyObligation({ status: "DONE", dueDate: days(-5) }, NOW)).toBeNull();
    expect(classifyObligation({ status: "WAIVED", dueDate: days(-5) }, NOW)).toBeNull();
    expect(classifyObligation({ status: "OPEN", dueDate: null }, NOW)).toBeNull();
  });
});

describe("isExpiringContract", () => {
  it("flags executed contracts expiring within the window (or already past)", () => {
    expect(isExpiringContract({ status: "EXECUTED", expirationDate: days(10) }, NOW)).toBe(true);
    expect(isExpiringContract({ status: "EXECUTED", expirationDate: days(-2) }, NOW)).toBe(true);
    expect(isExpiringContract({ status: "EXECUTED", expirationDate: days(EXPIRING_DAYS) }, NOW)).toBe(true);
  });

  it("ignores far-future expirations, other statuses, and missing dates", () => {
    expect(isExpiringContract({ status: "EXECUTED", expirationDate: days(EXPIRING_DAYS + 1) }, NOW)).toBe(false);
    expect(isExpiringContract({ status: "DRAFT", expirationDate: days(5) }, NOW)).toBe(false);
    expect(isExpiringContract({ status: "EXECUTED", expirationDate: null }, NOW)).toBe(false);
  });
});

describe("needsReminder", () => {
  it("sends when never sent before", () => {
    expect(needsReminder(null, NOW)).toBe(true);
  });

  it("suppresses within the cooldown and resends after it", () => {
    expect(needsReminder(days(-(COOLDOWN_DAYS - 1)), NOW)).toBe(false);
    expect(needsReminder(days(-COOLDOWN_DAYS), NOW)).toBe(true);
  });

  it("honors a custom cooldown (signer nudges)", () => {
    expect(needsReminder(days(-2), NOW, 3)).toBe(false);
    expect(needsReminder(days(-3), NOW, 3)).toBe(true);
  });
});

describe("isSignatureExpired", () => {
  it("expires only pending signatures past their expiry", async () => {
    const { isSignatureExpired } = await import("./signing");
    expect(isSignatureExpired({ status: "PENDING", expiresAt: days(-1) }, NOW)).toBe(true);
    expect(isSignatureExpired({ status: "PENDING", expiresAt: days(1) }, NOW)).toBe(false);
    expect(isSignatureExpired({ status: "PENDING", expiresAt: null }, NOW)).toBe(false);
    expect(isSignatureExpired({ status: "SIGNED", expiresAt: days(-1) }, NOW)).toBe(false);
  });
});
