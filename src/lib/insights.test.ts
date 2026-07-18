import { describe, it, expect } from "vitest";
import { computeInsights, trailingMonths, type ContractFacts } from "./insights";

const NOW = new Date("2026-07-18T12:00:00Z");

function fact(over: Partial<ContractFacts>): ContractFacts {
  return {
    status: "DRAFT",
    category: null,
    counterpartyName: null,
    value: null,
    createdAt: new Date("2026-06-01T00:00:00Z"),
    executedAt: null,
    ...over,
  };
}

describe("trailingMonths", () => {
  it("returns the trailing n months oldest-first, crossing year boundaries", () => {
    expect(trailingMonths(new Date("2026-02-15T00:00:00Z"), 4)).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
  });
});

describe("computeInsights", () => {
  it("handles an empty portfolio", () => {
    const i = computeInsights([], NOW);
    expect(i.total).toBe(0);
    expect(i.avgCycleDays).toBeNull();
    expect(i.medianCycleDays).toBeNull();
    expect(i.funnel).toEqual([]);
    expect(i.executedByMonth).toHaveLength(6);
  });

  it("computes totals, funnel, and in-flight counts", () => {
    const i = computeInsights(
      [
        fact({ status: "DRAFT", value: 100 }),
        fact({ status: "IN_REVIEW", value: 200 }),
        fact({ status: "OUT_FOR_SIGNATURE" }),
        fact({ status: "EXECUTED", value: 700, executedAt: new Date("2026-07-01T00:00:00Z") }),
      ],
      NOW
    );
    expect(i.total).toBe(4);
    expect(i.totalValue).toBe(1000);
    expect(i.executedCount).toBe(1);
    expect(i.executedValue).toBe(700);
    expect(i.inFlightCount).toBe(2);
    // Funnel keeps lifecycle order and only present statuses.
    expect(i.funnel.map((f) => f.key)).toEqual([
      "DRAFT",
      "IN_REVIEW",
      "OUT_FOR_SIGNATURE",
      "EXECUTED",
    ]);
  });

  it("computes avg and median cycle days from created to executed", () => {
    const mk = (createdDaysAgo: number, executedDaysAgo: number) =>
      fact({
        status: "EXECUTED",
        createdAt: new Date(NOW.getTime() - createdDaysAgo * 86400e3),
        executedAt: new Date(NOW.getTime() - executedDaysAgo * 86400e3),
      });
    // Cycles: 10, 20, 60 days → avg 30, median 20.
    const i = computeInsights([mk(15, 5), mk(30, 10), mk(80, 20)], NOW);
    expect(i.avgCycleDays).toBeCloseTo(30);
    expect(i.medianCycleDays).toBeCloseTo(20);
  });

  it("buckets executed contracts into trailing months and ignores older ones", () => {
    const i = computeInsights(
      [
        fact({ status: "EXECUTED", value: 10, executedAt: new Date("2026-07-02T00:00:00Z") }),
        fact({ status: "EXECUTED", value: 20, executedAt: new Date("2026-05-15T00:00:00Z") }),
        fact({ status: "EXECUTED", value: 40, executedAt: new Date("2025-01-01T00:00:00Z") }), // too old
      ],
      NOW
    );
    const july = i.executedByMonth.find((m) => m.month === "2026-07")!;
    const may = i.executedByMonth.find((m) => m.month === "2026-05")!;
    expect(july).toMatchObject({ count: 1, value: 10 });
    expect(may).toMatchObject({ count: 1, value: 20 });
    expect(i.executedByMonth.reduce((s, m) => s + m.count, 0)).toBe(2);
  });

  it("groups by category and counterparty, sorted by value", () => {
    const i = computeInsights(
      [
        fact({ category: "NDA", counterpartyName: "Globex", value: 0 }),
        fact({ category: "MSA", counterpartyName: "Wonka", value: 500 }),
        fact({ category: "MSA", counterpartyName: "Wonka", value: 300 }),
        fact({ category: null, counterpartyName: null, value: 50 }),
      ],
      NOW
    );
    expect(i.byCategory[0]).toMatchObject({ key: "MSA", count: 2, value: 800 });
    expect(i.byCategory.map((g) => g.key)).toContain("Uncategorized");
    expect(i.topCounterparties[0]).toMatchObject({ key: "Wonka", value: 800 });
  });
});
