/**
 * Dependency-free, word-level text diff engine for contract "redlining".
 *
 * Given two versions of a text it produces a compact list of tracked-change
 * operations (equal / insert / delete) computed from a Longest Common
 * Subsequence over word/whitespace tokens. Whitespace is preserved so that the
 * original texts can be reconstructed exactly from the ops.
 */

export type DiffOpType = "equal" | "insert" | "delete";

export interface DiffOp {
  type: DiffOpType;
  text: string;
}

export interface DiffStats {
  insertions: number;
  deletions: number;
  unchanged: number;
}

/**
 * Split `text` into tokens where each token is either a maximal run of
 * non-whitespace ("word") or a maximal run of whitespace. Concatenating the
 * returned tokens in order reproduces `text` exactly.
 */
function tokenize(text: string): string[] {
  // Matches runs of whitespace OR runs of non-whitespace, covering every char.
  const tokens = text.match(/\s+|\S+/g);
  return tokens ?? [];
}

/** True when a token is a pure-whitespace run (rather than a word). */
function isWhitespace(token: string): boolean {
  return /^\s+$/.test(token);
}

/**
 * Compute the Longest Common Subsequence table for two token arrays using the
 * standard dynamic-programming approach. `lcs[i][j]` holds the LCS length of
 * `a[i..]` and `b[j..]`, which lets us backtrack forward through the arrays.
 */
function lcsLengths(a: string[], b: string[]): number[][] {
  const n = a.length;
  const m = b.length;
  // (n + 1) x (m + 1) table initialised to zero.
  const lcs: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0)
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (a[i] === b[j]) {
        lcs[i][j] = lcs[i + 1][j + 1] + 1;
      } else {
        lcs[i][j] = Math.max(lcs[i + 1][j], lcs[i][j + 1]);
      }
    }
  }
  return lcs;
}

/**
 * Diff two texts at the granularity of word/whitespace tokens.
 *
 * Returns a compact list of DiffOps where consecutive ops of the same type are
 * merged into one. Invariants:
 *   - concatenating the text of all "equal" + "delete" ops === oldText
 *   - concatenating the text of all "equal" + "insert" ops === newText
 */
export function diffWords(oldText: string, newText: string): DiffOp[] {
  const oldTokens = tokenize(oldText);
  const newTokens = tokenize(newText);
  const lcs = lcsLengths(oldTokens, newTokens);

  const ops: DiffOp[] = [];

  /** Append text as an op of `type`, merging into the previous op if possible. */
  const push = (type: DiffOpType, text: string): void => {
    if (text.length === 0) return;
    const last = ops[ops.length - 1];
    if (last && last.type === type) {
      last.text += text;
    } else {
      ops.push({ type, text });
    }
  };

  let i = 0;
  let j = 0;
  // Walk the LCS table forward, emitting ops along the alignment.
  while (i < oldTokens.length && j < newTokens.length) {
    if (oldTokens[i] === newTokens[j]) {
      push("equal", oldTokens[i]);
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      // Dropping oldTokens[i] keeps the alignment at least as long → delete.
      push("delete", oldTokens[i]);
      i++;
    } else {
      // Otherwise consume newTokens[j] as an insertion.
      push("insert", newTokens[j]);
      j++;
    }
  }
  // Drain any remaining tokens; only one of these loops can run.
  while (i < oldTokens.length) {
    push("delete", oldTokens[i]);
    i++;
  }
  while (j < newTokens.length) {
    push("insert", newTokens[j]);
    j++;
  }

  return ops;
}

/**
 * Count word-tokens (non-whitespace runs) that were inserted, deleted, or left
 * unchanged. Pure-whitespace tokens are ignored so the counts reflect words.
 */
export function diffStats(ops: DiffOp[]): DiffStats {
  const stats: DiffStats = { insertions: 0, deletions: 0, unchanged: 0 };
  for (const op of ops) {
    const words = tokenize(op.text).filter((t) => !isWhitespace(t)).length;
    if (op.type === "insert") {
      stats.insertions += words;
    } else if (op.type === "delete") {
      stats.deletions += words;
    } else {
      stats.unchanged += words;
    }
  }
  return stats;
}
