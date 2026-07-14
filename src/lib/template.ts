/**
 * Dependency-free, safe template rendering engine for document generation.
 *
 * This module implements a small mustache-like language using pure string
 * parsing only — no `eval`, no `Function()`, no third-party packages. It is
 * used to turn contract templates into finished documents by merging author
 * supplied values into a body of text.
 *
 * Supported syntax:
 *   - Interpolation:  {{ path.to.value }}
 *   - Helpers (pipe): {{ value | money }}, {{ name | upper | default:"N/A" }}
 *   - Conditionals:   {{#if path}} ... {{else}} ... {{/if}}
 *   - Iteration:      {{#each list}} ... {{this}} / {{this.field}} / {{@index}} ... {{/each}}
 */

/** The data supplied to a template. Values may be nested objects/arrays. */
export type TemplateContext = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

/** A raw token produced by scanning the template body. */
type Token =
  | { kind: "text"; value: string }
  | { kind: "interp"; expr: string }
  | { kind: "openIf"; path: string }
  | { kind: "openEach"; path: string }
  | { kind: "else" }
  | { kind: "closeIf" }
  | { kind: "closeEach" };

/** Matches a single `{{ ... }}` tag; the inner content is captured lazily. */
const TAG_RE = /\{\{([\s\S]*?)\}\}/g;

/**
 * Split a template body into a flat list of text and tag tokens. Text outside
 * of tags is preserved verbatim (including whitespace and newlines).
 */
function tokenize(body: string): Token[] {
  const tokens: Token[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  TAG_RE.lastIndex = 0;
  while ((match = TAG_RE.exec(body)) !== null) {
    // Emit any literal text preceding this tag.
    if (match.index > lastIndex) {
      tokens.push({ kind: "text", value: body.slice(lastIndex, match.index) });
    }
    tokens.push(classifyTag(match[1].trim()));
    lastIndex = TAG_RE.lastIndex;
  }

  // Trailing literal text after the final tag.
  if (lastIndex < body.length) {
    tokens.push({ kind: "text", value: body.slice(lastIndex) });
  }
  return tokens;
}

/** Classify the trimmed inner content of a tag into a specific token kind. */
function classifyTag(content: string): Token {
  if (/^#if\b/.test(content)) {
    return { kind: "openIf", path: content.slice(3).trim() };
  }
  if (/^#each\b/.test(content)) {
    return { kind: "openEach", path: content.slice(5).trim() };
  }
  if (content === "else") return { kind: "else" };
  if (content === "/if") return { kind: "closeIf" };
  if (content === "/each") return { kind: "closeEach" };
  return { kind: "interp", expr: content };
}

// ---------------------------------------------------------------------------
// Parser (token list -> node tree)
// ---------------------------------------------------------------------------

/** A parsed template node. Blocks may nest arbitrarily. */
type Node =
  | { type: "text"; value: string }
  | { type: "interp"; expr: string }
  | { type: "if"; path: string; body: Node[]; elseBody: Node[] }
  | { type: "each"; path: string; body: Node[] };

/**
 * Build a node tree from a flat token list. Malformed input (stray or
 * unbalanced tags) is tolerated and never throws — unexpected close/else
 * tokens are simply ignored.
 */
function parse(tokens: Token[]): Node[] {
  let pos = 0;

  function parseBlock(stop: Token["kind"][]): Node[] {
    const nodes: Node[] = [];

    while (pos < tokens.length) {
      const token = tokens[pos];
      if (stop.includes(token.kind)) break;
      pos++;

      switch (token.kind) {
        case "text":
          nodes.push({ type: "text", value: token.value });
          break;
        case "interp":
          nodes.push({ type: "interp", expr: token.expr });
          break;
        case "openIf": {
          const body = parseBlock(["else", "closeIf", "closeEach"]);
          let elseBody: Node[] = [];
          if (tokens[pos]?.kind === "else") {
            pos++; // consume {{else}}
            elseBody = parseBlock(["closeIf", "closeEach"]);
          }
          if (tokens[pos]?.kind === "closeIf") pos++; // consume {{/if}}
          nodes.push({ type: "if", path: token.path, body, elseBody });
          break;
        }
        case "openEach": {
          const body = parseBlock(["closeEach", "closeIf"]);
          if (tokens[pos]?.kind === "closeEach") pos++; // consume {{/each}}
          nodes.push({ type: "each", path: token.path, body });
          break;
        }
        // Stray else / close tags with no matching opener: ignore them.
        default:
          break;
      }
    }
    return nodes;
  }

  return parseBlock([]);
}

// ---------------------------------------------------------------------------
// Scope & path resolution
// ---------------------------------------------------------------------------

/**
 * A rendering scope. Normal dotted paths always resolve against `context`
 * (the outer/root data), while `item`/`index` carry the current `{{#each}}`
 * element so that `this`, `this.field` and `@index` resolve correctly.
 */
interface Scope {
  context: TemplateContext;
  item: unknown;
  index: number;
  hasItem: boolean;
  parent: Scope | null;
}

/** Create the top-level scope for a render. */
function rootScope(context: TemplateContext): Scope {
  return { context, item: undefined, index: -1, hasItem: false, parent: null };
}

/** Find the nearest enclosing `{{#each}}` scope, if any. */
function nearestEach(scope: Scope): Scope | null {
  let s: Scope | null = scope;
  while (s) {
    if (s.hasItem) return s;
    s = s.parent;
  }
  return null;
}

/**
 * Resolve a path expression to a value.
 *   - `@index`      -> current each index
 *   - `this`        -> current each item
 *   - `this.field`  -> field of the current each item
 *   - `a.b.c`       -> dotted lookup in the (outer) context
 * Missing lookups yield `undefined`.
 */
function resolvePath(path: string, scope: Scope): unknown {
  const p = path.trim();
  if (p === "") return undefined;

  if (p === "@index") {
    const each = nearestEach(scope);
    return each ? each.index : undefined;
  }
  if (p === "this") {
    const each = nearestEach(scope);
    return each ? each.item : undefined;
  }
  if (p.startsWith("this.")) {
    const each = nearestEach(scope);
    return each ? getDotted(each.item, p.slice(5)) : undefined;
  }
  return getDotted(scope.context, p);
}

/** Walk a dotted path (`a.b.c`) into a value, returning `undefined` on any gap. */
function getDotted(obj: unknown, path: string): unknown {
  const segments = path
    .split(".")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  let cur: unknown = obj;
  for (const seg of segments) {
    if (cur === null || cur === undefined) return undefined;
    if (typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

// ---------------------------------------------------------------------------
// Helpers (pipe functions)
// ---------------------------------------------------------------------------

/** A helper transforms a value, optionally using a single quoted argument. */
type Helper = (value: unknown, arg: string | undefined) => unknown;

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const HELPERS: Record<string, Helper> = {
  /** Format a finite number as whole-dollar USD, e.g. 240000 -> "$240,000". */
  money(value) {
    if (value === null || value === undefined || value === "") return "";
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n)) return "";
    return USD.format(n);
  },

  /** Format a Date or date-string as "Mon D, YYYY", e.g. "Jul 14, 2026". */
  date(value) {
    if (value === null || value === undefined || value === "") return "";
    const d =
      value instanceof Date
        ? value
        : new Date(value as string | number | Date);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      // Use UTC so date-only strings ("2026-07-14") are not shifted by the
      // host machine's timezone.
      timeZone: "UTC",
    });
  },

  /** Uppercase the stringified value. */
  upper(value) {
    return toStr(value).toUpperCase();
  },

  /** Lowercase the stringified value. */
  lower(value) {
    return toStr(value).toLowerCase();
  },

  /** If the value is empty/null/undefined, substitute the quoted default. */
  default(value, arg) {
    return isEmpty(value) ? arg ?? "" : value;
  },
};

// ---------------------------------------------------------------------------
// Interpolation (path + helper pipeline)
// ---------------------------------------------------------------------------

/** Render a `{{ expr }}` interpolation, applying any chained helpers. */
function renderInterp(expr: string, scope: Scope): string {
  const parts = splitPipes(expr);
  const path = parts[0];

  let value: unknown = resolvePath(path, scope);
  for (let i = 1; i < parts.length; i++) {
    const { name, arg } = parseHelper(parts[i]);
    const helper = HELPERS[name];
    // Unknown helpers are ignored: the value passes through unchanged.
    if (helper) value = helper(value, arg);
  }
  return toStr(value);
}

/**
 * Split an interpolation expression on the `|` pipe character while ignoring
 * pipes that appear inside a double-quoted helper argument.
 */
function splitPipes(expr: string): string[] {
  const parts: string[] = [];
  let cur = "";
  let inQuote = false;

  for (const ch of expr) {
    if (ch === '"') {
      inQuote = !inQuote;
      cur += ch;
    } else if (ch === "|" && !inQuote) {
      parts.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  parts.push(cur.trim());
  return parts;
}

/** Parse a helper segment like `default:"N/A"` into a name and optional arg. */
function parseHelper(segment: string): { name: string; arg: string | undefined } {
  const colon = segment.indexOf(":");
  if (colon === -1) return { name: segment.trim(), arg: undefined };

  const name = segment.slice(0, colon).trim();
  const rest = segment.slice(colon + 1).trim();
  const quoted = rest.match(/^"([\s\S]*)"$/);
  return { name, arg: quoted ? quoted[1] : rest };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/** Render a list of nodes within a scope. */
function renderNodes(nodes: Node[], scope: Scope): string {
  let out = "";
  for (const node of nodes) {
    switch (node.type) {
      case "text":
        out += node.value;
        break;
      case "interp":
        out += renderInterp(node.expr, scope);
        break;
      case "if": {
        const value = resolvePath(node.path, scope);
        out += isTruthy(value)
          ? renderNodes(node.body, scope)
          : renderNodes(node.elseBody, scope);
        break;
      }
      case "each": {
        const list = resolvePath(node.path, scope);
        if (Array.isArray(list)) {
          for (let i = 0; i < list.length; i++) {
            const child: Scope = {
              context: scope.context,
              item: list[i],
              index: i,
              hasItem: true,
              parent: scope,
            };
            out += renderNodes(node.body, child);
          }
        }
        // A non-array (missing/null) list simply renders nothing.
        break;
      }
    }
  }
  return out;
}

/**
 * Render a template `body` against `context`, producing the finished text.
 * Never throws: unknown helpers and malformed tags degrade gracefully to
 * empty or literal output.
 */
export function renderTemplate(body: string, context: TemplateContext): string {
  const nodes = parse(tokenize(body));
  return renderNodes(nodes, rootScope(context ?? {}));
}

// ---------------------------------------------------------------------------
// Variable extraction
// ---------------------------------------------------------------------------

/**
 * Return the sorted, de-duplicated list of top-level merge-field paths an
 * author must supply. Includes interpolation paths (with helper pipes
 * stripped) and `{{#if}}` / `{{#each}}` block paths, but excludes the
 * iteration locals `this`, `this.*` and `@index`.
 */
export function extractVariables(body: string): string[] {
  const found = new Set<string>();

  for (const token of tokenize(body)) {
    let path: string | undefined;
    if (token.kind === "interp") {
      // Drop the helper pipeline; only the leading path names a variable.
      path = splitPipes(token.expr)[0];
    } else if (token.kind === "openIf" || token.kind === "openEach") {
      path = token.path;
    }
    if (path === undefined) continue;

    path = path.trim();
    if (path === "" || path === "this" || path === "@index") continue;
    if (path.startsWith("this.")) continue;

    found.add(path);
  }

  return Array.from(found).sort();
}

// ---------------------------------------------------------------------------
// Small value utilities
// ---------------------------------------------------------------------------

/** Convert any value to its output string; null/undefined become "". */
function toStr(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  return String(value);
}

/** True when a value counts as "empty" for the `default` helper. */
function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

/**
 * Truthiness test for `{{#if}}`: non-empty string, non-zero (non-NaN) number,
 * `true`, non-empty array, or object with at least one own key.
 */
function isTruthy(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0 && !Number.isNaN(value);
  if (typeof value === "string") return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return Boolean(value);
}
