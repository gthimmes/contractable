// Cross-entity search: contracts (metadata + current document text),
// counterparties, and templates.
//
// Matching uses SQL LIKE via Prisma `contains`, which SQLite evaluates
// case-insensitively for ASCII — no extra infrastructure, and it ports to
// Postgres by adding `mode: "insensitive"` to the filters. The snippet logic
// is pure and unit-tested.

import { prisma } from "./db";

export interface SnippetPart {
  text: string;
  match: boolean;
}

/**
 * Build a short excerpt of `text` around the first occurrence of `query`
 * (case-insensitive), split into parts with every occurrence inside the
 * excerpt flagged so the UI can highlight it. Returns null when the query
 * doesn't occur.
 */
export function makeSnippet(text: string, query: string, radius = 90): SnippetPart[] | null {
  const q = query.trim();
  if (!q) return null;
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  const first = lower.indexOf(needle);
  if (first === -1) return null;

  // Excerpt window around the first hit, expanded to word boundaries.
  let start = Math.max(0, first - radius);
  let end = Math.min(text.length, first + needle.length + radius);
  if (start > 0) {
    const ws = text.lastIndexOf(" ", start);
    start = ws === -1 ? start : ws + 1;
  }
  if (end < text.length) {
    const ws = text.indexOf(" ", end);
    end = ws === -1 ? end : ws;
  }

  const excerpt = text.slice(start, end).replace(/\s+/g, " ");
  const excerptLower = excerpt.toLowerCase();
  const parts: SnippetPart[] = [];
  let cursor = 0;
  for (;;) {
    const hit = excerptLower.indexOf(needle, cursor);
    if (hit === -1) break;
    if (hit > cursor) parts.push({ text: excerpt.slice(cursor, hit), match: false });
    parts.push({ text: excerpt.slice(hit, hit + needle.length), match: true });
    cursor = hit + needle.length;
  }
  if (cursor < excerpt.length) parts.push({ text: excerpt.slice(cursor), match: false });

  if (start > 0) parts.unshift({ text: "… ", match: false });
  if (end < text.length) parts.push({ text: " …", match: false });
  return parts;
}

export interface SearchResults {
  contracts: {
    id: string;
    reference: string;
    title: string;
    status: string;
    counterpartyName: string | null;
    /** Which fields matched, for the result line. */
    matchedIn: string[];
    /** Snippet from the current document body, when it matched. */
    snippet: SnippetPart[] | null;
  }[];
  counterparties: { id: string; name: string; contactName: string | null }[];
  templates: { id: string; name: string; category: string | null; snippet: SnippetPart[] | null }[];
}

/** Run the search across all entities. Empty query → empty results. */
export async function searchAll(query: string, limit = 20): Promise<SearchResults> {
  const q = query.trim();
  if (!q) return { contracts: [], counterparties: [], templates: [] };
  const contains = { contains: q };

  const [contracts, counterparties, templates] = await Promise.all([
    prisma.contract.findMany({
      where: {
        OR: [
          { title: contains },
          { reference: contains },
          { description: contains },
          { counterparty: contains },
          { counterpartyRef: { name: contains } },
          { currentVersion: { body: contains } },
        ],
      },
      include: { counterpartyRef: true, currentVersion: true },
      orderBy: { updatedAt: "desc" },
      take: limit,
    }),
    prisma.counterparty.findMany({
      where: {
        OR: [
          { name: contains },
          { legalName: contains },
          { contactName: contains },
          { contactEmail: contains },
          { notes: contains },
        ],
      },
      orderBy: { name: "asc" },
      take: limit,
    }),
    prisma.contractTemplate.findMany({
      where: {
        OR: [{ name: contains }, { description: contains }, { body: contains }],
      },
      orderBy: { name: "asc" },
      take: limit,
    }),
  ]);

  const lc = q.toLowerCase();
  const has = (s: string | null | undefined) => !!s && s.toLowerCase().includes(lc);

  return {
    contracts: contracts.map((c) => {
      const matchedIn: string[] = [];
      if (has(c.title)) matchedIn.push("title");
      if (has(c.reference)) matchedIn.push("reference");
      if (has(c.description)) matchedIn.push("description");
      if (has(c.counterpartyRef?.name) || has(c.counterparty)) matchedIn.push("counterparty");
      const bodyMatched = has(c.currentVersion?.body);
      if (bodyMatched) matchedIn.push("document");
      return {
        id: c.id,
        reference: c.reference,
        title: c.title,
        status: c.status,
        counterpartyName: c.counterpartyRef?.name ?? c.counterparty,
        matchedIn,
        snippet: bodyMatched ? makeSnippet(c.currentVersion!.body, q) : null,
      };
    }),
    counterparties: counterparties.map((p) => ({
      id: p.id,
      name: p.name,
      contactName: p.contactName,
    })),
    templates: templates.map((t) => ({
      id: t.id,
      name: t.name,
      category: t.category,
      snippet: has(t.body) ? makeSnippet(t.body, q) : null,
    })),
  };
}
