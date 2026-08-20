// Maps app routes to the help articles most relevant on that page —
// surfaced as "Suggested for this page" when the help panel opens.

const ROUTE_HELP: Array<{ pattern: RegExp; articles: string[] }> = [
  { pattern: /^\/$/, articles: ["dashboard-actions", "lifecycle-tour", "roles-permissions"] },
  { pattern: /^\/contracts\/new/, articles: ["creating-contracts", "templates-binding", "workflow-basics"] },
  { pattern: /^\/contracts\/[^/]+/, articles: ["redlining", "workflow-acting", "signing-flow", "attachments"] },
  { pattern: /^\/contracts/, articles: ["creating-contracts", "lifecycle-tour", "executed-store"] },
  { pattern: /^\/obligations/, articles: ["obligations-basics", "executed-store"] },
  { pattern: /^\/insights/, articles: ["insights-help", "obligations-basics"] },
  { pattern: /^\/counterparties/, articles: ["counterparties-help", "creating-contracts"] },
  { pattern: /^\/templates/, articles: ["templates-binding", "clause-library"] },
  { pattern: /^\/clauses/, articles: ["clause-library", "templates-binding"] },
  { pattern: /^\/workflows/, articles: ["workflow-builder", "workflow-basics"] },
  { pattern: /^\/outbox/, articles: ["outbox-email", "signing-flow"] },
  { pattern: /^\/audit/, articles: ["audit-log", "signing-experience"] },
  { pattern: /^\/settings/, articles: ["settings-admin", "outbox-email", "roles-permissions"] },
  { pattern: /^\/search/, articles: ["search-notifications"] },
];

export function helpArticlesFor(pathname: string): string[] {
  return ROUTE_HELP.find((r) => r.pattern.test(pathname))?.articles ?? ["lifecycle-tour"];
}

// Exported for tests: every article id referenced by the map.
export function allMappedArticleIds(): string[] {
  return [...new Set(ROUTE_HELP.flatMap((r) => r.articles))];
}
