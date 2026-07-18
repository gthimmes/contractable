// Dependency-free CSV codec (RFC 4180): quoted fields, escaped quotes,
// embedded newlines/commas, CRLF or LF input. Small on purpose — exactly what
// import/export needs, fully unit-tested.

/** Encode rows as CSV text (CRLF line endings, fields quoted when needed). */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const s = cell == null ? "" : String(cell);
          return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(",")
    )
    .join("\r\n");
}

/** Parse CSV text into rows of fields. Ignores a trailing empty line. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"' && field === "") {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      pushField();
      i++;
      continue;
    }
    if (ch === "\r" && text[i + 1] === "\n") {
      pushRow();
      i += 2;
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      pushRow();
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  // Final field/row (unless the text ended exactly on a line break).
  if (field !== "" || row.length > 0) pushRow();
  return rows;
}

/**
 * Parse CSV with a header row into records keyed by lower-cased header name.
 * Blank lines are skipped; short rows are padded with "".
 */
export function parseCsvRecords(text: string): Record<string, string>[] {
  const rows = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ""));
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((r) => {
    const rec: Record<string, string> = {};
    headers.forEach((h, idx) => {
      rec[h] = (r[idx] ?? "").trim();
    });
    return rec;
  });
}
