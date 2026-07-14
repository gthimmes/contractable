import { describe, it, expect } from "vitest";
import { diffWords, diffStats, type DiffOp } from "./diff";

/** Reconstruct the "old" side: everything that was equal or deleted. */
function reconstructOld(ops: DiffOp[]): string {
  return ops
    .filter((o) => o.type === "equal" || o.type === "delete")
    .map((o) => o.text)
    .join("");
}

/** Reconstruct the "new" side: everything that was equal or inserted. */
function reconstructNew(ops: DiffOp[]): string {
  return ops
    .filter((o) => o.type === "equal" || o.type === "insert")
    .map((o) => o.text)
    .join("");
}

/** No two adjacent ops may share a type (output must be merged/compact). */
function assertMerged(ops: DiffOp[]): void {
  for (let i = 1; i < ops.length; i++) {
    expect(ops[i].type).not.toBe(ops[i - 1].type);
  }
}

describe("diffWords", () => {
  it("returns a single equal op for identical text", () => {
    const text = "The quick brown fox";
    const ops = diffWords(text, text);
    expect(ops).toEqual([{ type: "equal", text }]);
  });

  it("handles a pure insertion at the end", () => {
    const ops = diffWords("hello world", "hello world again");
    expect(ops).toEqual([
      { type: "equal", text: "hello world" },
      { type: "insert", text: " again" },
    ]);
    expect(reconstructOld(ops)).toBe("hello world");
    expect(reconstructNew(ops)).toBe("hello world again");
  });

  it("handles a pure deletion at the end", () => {
    const ops = diffWords("hello world again", "hello world");
    expect(ops).toEqual([
      { type: "equal", text: "hello world" },
      { type: "delete", text: " again" },
    ]);
    expect(reconstructOld(ops)).toBe("hello world again");
    expect(reconstructNew(ops)).toBe("hello world");
  });

  it("represents a single-word replacement as delete + insert", () => {
    const ops = diffWords("the quick brown fox", "the slow brown fox");
    expect(reconstructOld(ops)).toBe("the quick brown fox");
    expect(reconstructNew(ops)).toBe("the slow brown fox");
    assertMerged(ops);
    // The changed word should surface as a delete of "quick" and insert of "slow".
    expect(ops.some((o) => o.type === "delete" && o.text.includes("quick"))).toBe(
      true
    );
    expect(ops.some((o) => o.type === "insert" && o.text.includes("slow"))).toBe(
      true
    );
    // The surrounding words remain equal.
    expect(ops[0]).toEqual({ type: "equal", text: "the " });
    expect(ops[ops.length - 1]).toEqual({ type: "equal", text: " brown fox" });
  });

  it("handles a change in the middle of a paragraph", () => {
    const oldText =
      "Payment shall be made within thirty days of the invoice date.";
    const newText =
      "Payment shall be made within sixty days of the invoice date.";
    const ops = diffWords(oldText, newText);
    expect(reconstructOld(ops)).toBe(oldText);
    expect(reconstructNew(ops)).toBe(newText);
    assertMerged(ops);
    expect(
      ops.some((o) => o.type === "delete" && o.text.includes("thirty"))
    ).toBe(true);
    expect(ops.some((o) => o.type === "insert" && o.text.includes("sixty"))).toBe(
      true
    );
  });

  it("preserves newlines in multi-line text", () => {
    const oldText = "Line one\nLine two\nLine three";
    const newText = "Line one\nLine 2\nLine three";
    const ops = diffWords(oldText, newText);
    expect(reconstructOld(ops)).toBe(oldText);
    expect(reconstructNew(ops)).toBe(newText);
    // The newline whitespace tokens must be carried through untouched.
    expect(reconstructOld(ops)).toContain("\n");
    expect(reconstructNew(ops)).toContain("\n");
  });

  it("handles multiple scattered changes while preserving whitespace", () => {
    const oldText = "alpha  beta   gamma\tdelta";
    const newText = "alpha  BETA   gamma\tDELTA";
    const ops = diffWords(oldText, newText);
    // Reconstruction proves the double-spaces and tab survive exactly.
    expect(reconstructOld(ops)).toBe(oldText);
    expect(reconstructNew(ops)).toBe(newText);
    assertMerged(ops);
  });

  describe("empty-string cases", () => {
    it("old empty, new non-empty → single insert", () => {
      const ops = diffWords("", "brand new text");
      expect(ops).toEqual([{ type: "insert", text: "brand new text" }]);
      expect(reconstructOld(ops)).toBe("");
      expect(reconstructNew(ops)).toBe("brand new text");
    });

    it("old non-empty, new empty → single delete", () => {
      const ops = diffWords("old removed text", "");
      expect(ops).toEqual([{ type: "delete", text: "old removed text" }]);
      expect(reconstructOld(ops)).toBe("old removed text");
      expect(reconstructNew(ops)).toBe("");
    });

    it("both empty → no ops", () => {
      const ops = diffWords("", "");
      expect(ops).toEqual([]);
      expect(reconstructOld(ops)).toBe("");
      expect(reconstructNew(ops)).toBe("");
    });
  });

  describe("reconstruction invariant", () => {
    const cases: Array<[string, string]> = [
      ["", ""],
      ["", "inserted only"],
      ["deleted only", ""],
      ["same text", "same text"],
      ["the quick brown fox", "the slow brown foxes jumped"],
      [
        "Section 1.\nThe party agrees to pay.\nSection 2.",
        "Section 1.\nThe party agrees to pay promptly.\nSection 3.",
      ],
      ["  leading and trailing  ", "leading and trailing"],
      ["a b c d e f g", "a x c y e f z"],
    ];

    for (const [oldText, newText] of cases) {
      it(`old+new reconstruct for ${JSON.stringify(oldText)} → ${JSON.stringify(
        newText
      )}`, () => {
        const ops = diffWords(oldText, newText);
        expect(reconstructOld(ops)).toBe(oldText);
        expect(reconstructNew(ops)).toBe(newText);
        assertMerged(ops);
      });
    }
  });
});

describe("diffStats", () => {
  it("counts all words as unchanged for identical text", () => {
    const ops = diffWords("one two three", "one two three");
    expect(diffStats(ops)).toEqual({
      insertions: 0,
      deletions: 0,
      unchanged: 3,
    });
  });

  it("counts a pure insertion", () => {
    const ops = diffWords("hello world", "hello world again today");
    expect(diffStats(ops)).toEqual({
      insertions: 2,
      deletions: 0,
      unchanged: 2,
    });
  });

  it("counts a pure deletion", () => {
    const ops = diffWords("hello there big world", "hello world");
    expect(diffStats(ops)).toEqual({
      insertions: 0,
      deletions: 2,
      unchanged: 2,
    });
  });

  it("counts a word replacement as one insertion and one deletion", () => {
    const ops = diffWords("the quick brown fox", "the slow brown fox");
    expect(diffStats(ops)).toEqual({
      insertions: 1,
      deletions: 1,
      unchanged: 3,
    });
  });

  it("ignores pure-whitespace tokens in the counts", () => {
    // Only whitespace differs; no word tokens change.
    const ops = diffWords("a b c", "a  b  c");
    const stats = diffStats(ops);
    expect(stats.insertions).toBe(0);
    expect(stats.deletions).toBe(0);
    expect(stats.unchanged).toBe(3);
  });

  it("counts nothing for two empty strings", () => {
    const ops = diffWords("", "");
    expect(diffStats(ops)).toEqual({
      insertions: 0,
      deletions: 0,
      unchanged: 0,
    });
  });
});
