import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { searchAll, type SnippetPart } from "@/lib/search";
import { StatusBadge, EmptyState } from "@/components/ui";

function Snippet({ parts }: { parts: SnippetPart[] }) {
  return (
    <p className="mt-1 text-xs leading-relaxed text-gray-500">
      {parts.map((p, i) =>
        p.match ? (
          <mark key={i} className="rounded bg-yellow-100 px-0.5 font-medium text-gray-900">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </p>
  );
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await getCurrentUser();
  const { q = "" } = await searchParams;
  const results = await searchAll(q);
  const total =
    results.contracts.length +
    results.counterparties.length +
    results.templates.length +
    results.clauses.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Search</h1>
        <p className="text-sm text-gray-500">
          Search contracts (including the document text), counterparties, and templates.
        </p>
      </div>

      <form action="/search" method="get" className="flex max-w-xl gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search titles, references, document text, counterparties…"
          className="input"
          autoFocus
        />
        <button type="submit" className="btn-primary">
          Search
        </button>
      </form>

      {q.trim() === "" ? (
        <EmptyState>Type a query to search everything.</EmptyState>
      ) : total === 0 ? (
        <EmptyState>No results for “{q}”.</EmptyState>
      ) : (
        <div className="space-y-6">
          {results.contracts.length > 0 && (
            <section className="card p-5">
              <h2 className="mb-3 text-lg font-semibold">
                Contracts <span className="text-sm font-normal text-gray-400">({results.contracts.length})</span>
              </h2>
              <ul className="divide-y divide-gray-100">
                {results.contracts.map((c) => (
                  <li key={c.id} className="py-3">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <Link
                          href={`/contracts/${c.id}`}
                          className="font-medium text-gray-900 hover:text-brand-600"
                        >
                          <span className="mr-2 font-mono text-xs text-gray-400">{c.reference}</span>
                          {c.title}
                        </Link>
                        <div className="mt-0.5 text-xs text-gray-500">
                          {c.counterpartyName && <>{c.counterpartyName} · </>}
                          matched in {c.matchedIn.join(", ")}
                        </div>
                        {c.snippet && <Snippet parts={c.snippet} />}
                      </div>
                      <StatusBadge status={c.status} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {results.counterparties.length > 0 && (
            <section className="card p-5">
              <h2 className="mb-3 text-lg font-semibold">
                Counterparties <span className="text-sm font-normal text-gray-400">({results.counterparties.length})</span>
              </h2>
              <ul className="divide-y divide-gray-100">
                {results.counterparties.map((p) => (
                  <li key={p.id} className="flex items-center justify-between py-2.5">
                    <Link href={`/counterparties`} className="font-medium text-gray-900 hover:text-brand-600">
                      {p.name}
                    </Link>
                    {p.contactName && <span className="text-xs text-gray-500">{p.contactName}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {results.templates.length > 0 && (
            <section className="card p-5">
              <h2 className="mb-3 text-lg font-semibold">
                Templates <span className="text-sm font-normal text-gray-400">({results.templates.length})</span>
              </h2>
              <ul className="divide-y divide-gray-100">
                {results.templates.map((t) => (
                  <li key={t.id} className="py-2.5">
                    <div className="flex items-center justify-between">
                      <Link href={`/templates/${t.id}/edit`} className="font-medium text-gray-900 hover:text-brand-600">
                        {t.name}
                      </Link>
                      {t.category && <span className="badge bg-gray-100 text-gray-600">{t.category}</span>}
                    </div>
                    {t.snippet && <Snippet parts={t.snippet} />}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {results.clauses.length > 0 && (
            <section className="card p-5">
              <h2 className="mb-3 text-lg font-semibold">
                Clauses <span className="text-sm font-normal text-gray-400">({results.clauses.length})</span>
              </h2>
              <ul className="divide-y divide-gray-100">
                {results.clauses.map((c) => (
                  <li key={c.id} className="py-2.5">
                    <div className="flex items-center justify-between">
                      <Link href="/clauses" className="font-medium text-gray-900 hover:text-brand-600">
                        {c.name}
                      </Link>
                      {c.category && <span className="badge bg-gray-100 text-gray-600">{c.category}</span>}
                    </div>
                    {c.snippet && <Snippet parts={c.snippet} />}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
