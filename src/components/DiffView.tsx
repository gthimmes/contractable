import { diffWords, diffStats } from "@/lib/diff";

/**
 * Renders a word-level "redline" between two document texts: deletions struck
 * through in red, insertions underlined in green, unchanged text plain.
 */
export function DiffView({
  oldText,
  newText,
}: {
  oldText: string;
  newText: string;
}) {
  const ops = diffWords(oldText, newText);
  const stats = diffStats(ops);

  return (
    <div>
      <div className="mb-2 flex gap-3 text-xs">
        <span className="text-emerald-700">+{stats.insertions} added</span>
        <span className="text-red-700">−{stats.deletions} removed</span>
        <span className="text-gray-400">{stats.unchanged} unchanged</span>
      </div>
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-4 text-xs leading-relaxed text-gray-700">
        {ops.map((op, i) => {
          if (op.type === "equal") return <span key={i}>{op.text}</span>;
          if (op.type === "insert")
            return (
              <span key={i} className="rounded bg-emerald-100 text-emerald-800 underline decoration-emerald-400">
                {op.text}
              </span>
            );
          return (
            <span key={i} className="rounded bg-red-100 text-red-800 line-through decoration-red-400">
              {op.text}
            </span>
          );
        })}
      </pre>
    </div>
  );
}
