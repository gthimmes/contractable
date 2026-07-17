// Dependency-free PDF generator.
//
// In keeping with the rest of this codebase (the template and diff engines are
// hand-rolled too), we emit PDF bytes directly rather than pulling in a heavy
// dependency. This produces a real, valid PDF/1.4 file with:
//   - the standard-14 fonts (Helvetica, Helvetica-Bold, Courier) — no font
//     embedding required, so files stay tiny;
//   - accurate text wrapping using the built-in Helvetica width metrics, so
//     lines actually fit the page instead of being guessed;
//   - automatic page breaks, headings, key/value rows, rules, and per-page
//     footers with page numbers.
//
// It is intentionally small and covers exactly what document export needs. See
// pdf.test.ts for the structural invariants it guarantees.

// Helvetica glyph advance widths (per 1000 units), ASCII 32..126. Used to wrap
// proportional text to the page width. Courier is monospaced (600 for every
// glyph) so it needs no table.
const HELVETICA_WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278,
  278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584,
  584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556,
  833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278,
  278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222,
  500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500,
  500, 334, 260, 334, 584,
];

export type FontName = "Helvetica" | "Helvetica-Bold" | "Courier";

const FONT_RES: Record<FontName, string> = {
  Helvetica: "/F1",
  "Helvetica-Bold": "/F2",
  Courier: "/F3",
};

// Map common non-Latin-1 punctuation to ASCII so smart quotes / dashes in
// contract text survive instead of turning into "?".
const NORMALIZE: Record<string, string> = {
  "‘": "'",
  "’": "'",
  "“": '"',
  "”": '"',
  "–": "-",
  "—": "-",
  "…": "...",
  "•": "-",
  " ": " ",
};

function normalize(s: string): string {
  return s.replace(/[‘’“”–—…• ]/g, (m) => NORMALIZE[m]);
}

/** Escape a string for a PDF literal string and drop anything outside Latin-1. */
function escapeText(s: string): string {
  return normalize(s)
    .replace(/[\r\n\t]/g, " ")
    .replace(/[\\()]/g, (m) => "\\" + m)
    .split("")
    .map((c) => (c.charCodeAt(0) > 255 ? "?" : c))
    .join("");
}

/** Width of a string at a given font size, in points. */
export function textWidth(text: string, size: number, font: FontName): number {
  const normalized = normalize(text);
  if (font === "Courier") return normalized.length * size * 0.6;
  let units = 0;
  for (const ch of normalized) {
    const code = ch.charCodeAt(0);
    units += code >= 32 && code <= 126 ? HELVETICA_WIDTHS[code - 32] : 556;
  }
  const width = (units / 1000) * size;
  // Bold is a touch wider than the regular metrics; pad conservatively so
  // wrapped bold lines never overrun the margin.
  return font === "Helvetica-Bold" ? width * 1.06 : width;
}

/** Greedy word-wrap to a max width, hard-splitting words longer than the line. */
function wrapText(text: string, maxWidth: number, size: number, font: FontName): string[] {
  const out: string[] = [];
  for (const rawLine of normalize(text).split("\n")) {
    if (rawLine.trim() === "") {
      out.push("");
      continue;
    }
    const words = rawLine.split(/(\s+)/); // keep whitespace tokens for fidelity
    let line = "";
    const flush = () => {
      out.push(line.replace(/\s+$/, ""));
      line = "";
    };
    for (const word of words) {
      const candidate = line + word;
      if (textWidth(candidate, size, font) <= maxWidth || line === "") {
        if (textWidth(word, size, font) > maxWidth && word.trim() !== "") {
          // A single token wider than the whole line: hard-split it.
          for (const ch of word) {
            if (textWidth(line + ch, size, font) > maxWidth && line !== "") flush();
            line += ch;
          }
        } else {
          line = candidate;
        }
      } else {
        flush();
        line = word.trimStart();
      }
    }
    flush();
  }
  return out;
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

interface TextOptions {
  size?: number;
  font?: FontName;
  color?: string; // "r g b" in 0..1, e.g. "0.4 0.4 0.4"
  indent?: number;
  lineHeight?: number;
}

/**
 * A cursor-based PDF page builder. Content flows top-to-bottom and pages break
 * automatically. Coordinates are PDF points (72 per inch); origin is bottom-left.
 */
export class PdfDocument {
  private readonly W = 612; // US Letter
  private readonly H = 792;
  private readonly margin = 54;
  private readonly x0 = 54;
  private readonly contentW: number;
  private readonly bottom: number;
  private readonly footer?: string;

  private pages: string[][] = [];
  private cur: string[] = [];
  private y = 0;

  constructor(opts: { footer?: string } = {}) {
    this.footer = opts.footer;
    this.contentW = this.W - 2 * this.margin;
    this.bottom = this.margin + (this.footer ? 24 : 0);
    this.newPage();
  }

  private op(text: string, x: number, baseline: number, size: number, font: FontName, color?: string) {
    const c = color ? `${color} rg ` : "";
    this.cur.push(
      `BT ${c}${FONT_RES[font]} ${fmt(size)} Tf ${fmt(x)} ${fmt(baseline)} Td (${escapeText(text)}) Tj ET`
    );
  }

  private newPage() {
    this.cur = [];
    this.pages.push(this.cur);
    this.y = this.H - this.margin;
    if (this.footer) {
      const n = this.pages.length;
      this.op(this.footer, this.x0, 38, 8, "Helvetica", "0.6 0.6 0.6");
      const label = `Page ${n}`;
      this.op(label, this.W - this.margin - textWidth(label, 8, "Helvetica"), 38, 8, "Helvetica", "0.6 0.6 0.6");
    }
  }

  private ensure(space: number) {
    if (this.y - space < this.bottom) this.newPage();
  }

  /** Force a new page. */
  pageBreak() {
    this.newPage();
  }

  /** Add vertical space (breaking to a new page if it would overflow). */
  spacer(height = 8) {
    if (this.y - height < this.bottom) this.newPage();
    else this.y -= height;
  }

  /** A thin horizontal rule across the content width. */
  rule() {
    this.ensure(10);
    this.y -= 4;
    const yy = this.y;
    this.cur.push(
      `0.85 0.85 0.85 RG 0.7 w ${fmt(this.x0)} ${fmt(yy)} m ${fmt(this.W - this.margin)} ${fmt(yy)} l S`
    );
    this.y -= 8;
  }

  /** Flow wrapped text. Honors embedded newlines and blank lines. */
  text(content: string, opts: TextOptions = {}) {
    const size = opts.size ?? 10;
    const font = opts.font ?? "Helvetica";
    const indent = opts.indent ?? 0;
    const lineHeight = opts.lineHeight ?? size * 1.4;
    const lines = wrapText(String(content), this.contentW - indent, size, font);
    for (const line of lines) {
      this.ensure(lineHeight);
      this.op(line, this.x0 + indent, this.y - size, size, font, opts.color);
      this.y -= lineHeight;
    }
  }

  /** A section heading. level 1 is large, level 2 is smaller. */
  heading(text: string, level: 1 | 2 = 1) {
    const size = level === 1 ? 16 : 12;
    this.spacer(level === 1 ? 6 : 10);
    this.text(text, { size, font: "Helvetica-Bold", lineHeight: size * 1.25 });
    this.spacer(2);
  }

  /** A label/value row (label muted on the left, value bold on the right). */
  kv(label: string, value: string, opts: { mono?: boolean } = {}) {
    const size = 10;
    const lineHeight = 15;
    const labelW = 130;
    this.ensure(lineHeight);
    const baseline = this.y - size;
    this.op(label, this.x0, baseline, size, "Helvetica", "0.45 0.45 0.45");
    const font: FontName = opts.mono ? "Courier" : "Helvetica-Bold";
    // Wrap the value within the remaining width if needed.
    const valueLines = wrapText(String(value), this.contentW - labelW, size, font);
    this.op(valueLines[0] ?? "", this.x0 + labelW, baseline, size, font);
    this.y -= lineHeight;
    for (let i = 1; i < valueLines.length; i++) {
      this.ensure(lineHeight);
      this.op(valueLines[i], this.x0 + labelW, this.y - size, size, font);
      this.y -= lineHeight;
    }
  }

  /** Serialize the document to PDF bytes. */
  toBuffer(): Uint8Array<ArrayBuffer> {
    const N = this.pages.length;
    const objects: string[] = [];
    objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
    const kids: string[] = [];
    for (let i = 0; i < N; i++) kids.push(`${6 + 2 * i} 0 R`);
    objects[2] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${N} >>`;
    objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
    objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
    objects[5] = "<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>";
    for (let i = 0; i < N; i++) {
      const pageNo = 6 + 2 * i;
      const contentNo = 7 + 2 * i;
      const content = this.pages[i].join("\n");
      objects[pageNo] =
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.W} ${this.H}] ` +
        `/Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${contentNo} 0 R >>`;
      objects[contentNo] =
        `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`;
    }

    const count = objects.length - 1;
    let out = "%PDF-1.4\n";
    const offsets: number[] = [];
    for (let n = 1; n <= count; n++) {
      offsets[n] = Buffer.byteLength(out, "latin1");
      out += `${n} 0 obj\n${objects[n]}\nendobj\n`;
    }
    const xrefStart = Buffer.byteLength(out, "latin1");
    out += `xref\n0 ${count + 1}\n0000000000 65535 f \n`;
    for (let n = 1; n <= count; n++) {
      out += `${String(offsets[n]).padStart(10, "0")} 00000 n \n`;
    }
    out += `trailer\n<< /Size ${count + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
    // Return a Uint8Array backed by a plain ArrayBuffer (not Buffer's
    // ArrayBufferLike) so it satisfies web BodyInit/BlobPart typing.
    const buf = Buffer.from(out, "latin1");
    const bytes = new Uint8Array(buf.length);
    bytes.set(buf);
    return bytes;
  }
}
