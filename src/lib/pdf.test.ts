import { describe, it, expect } from "vitest";
import { PdfDocument, textWidth } from "./pdf";
import { renderContractPdf } from "./contract-pdf";

function decode(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("latin1");
}

describe("PdfDocument", () => {
  it("emits a structurally valid PDF", () => {
    const doc = new PdfDocument();
    doc.heading("Hello");
    doc.text("Some body text.");
    const pdf = decode(doc.toBuffer());

    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(pdf).toContain("/Type /Catalog");
    expect(pdf).toContain("/Type /Pages");
    expect(pdf).toContain("/BaseFont /Helvetica");
  });

  it("declares a page count matching the objects it emits", () => {
    const doc = new PdfDocument();
    doc.text("one page of content");
    const pdf = decode(doc.toBuffer());
    expect(pdf).toContain("/Count 1");
    // Objects: catalog, pages, 3 fonts, 1 page dict, 1 content = 7.
    expect(pdf).toContain("/Size 8");
  });

  it("breaks into multiple pages when content overflows", () => {
    const doc = new PdfDocument();
    for (let i = 0; i < 200; i++) doc.text(`line ${i}`);
    const pdf = decode(doc.toBuffer());
    const count = Number(pdf.match(/\/Count (\d+)/)![1]);
    expect(count).toBeGreaterThan(1);
  });

  it("xref startxref offset points at the xref table", () => {
    const doc = new PdfDocument();
    doc.text("x");
    const pdf = decode(doc.toBuffer());
    const startxref = Number(pdf.match(/startxref\n(\d+)/)![1]);
    // The bytes at that offset must begin the cross-reference section.
    expect(pdf.slice(startxref, startxref + 4)).toBe("xref");
  });

  it("records accurate byte offsets for each object", () => {
    const doc = new PdfDocument();
    doc.text("offsets must be exact");
    const pdf = decode(doc.toBuffer());
    // Parse the xref table and confirm each offset lands on "N 0 obj".
    const xrefIdx = pdf.indexOf("xref\n");
    const lines = pdf.slice(xrefIdx).split("\n");
    // lines[0]="xref", lines[1]="0 8", lines[2]=free entry, then object entries.
    const total = Number(lines[1].split(" ")[1]);
    for (let n = 1; n < total; n++) {
      const entry = lines[2 + n];
      const offset = Number(entry.slice(0, 10));
      expect(pdf.slice(offset).startsWith(`${n} 0 obj`)).toBe(true);
    }
  });

  it("escapes parentheses and backslashes in text", () => {
    const doc = new PdfDocument();
    doc.text("value (with parens) and a \\ backslash");
    const pdf = decode(doc.toBuffer());
    expect(pdf).toContain("\\(with parens\\)");
    expect(pdf).toContain("\\\\ backslash");
  });

  it("wraps long unbroken tokens to fit the page width", () => {
    const doc = new PdfDocument();
    const longWord = "x".repeat(500);
    doc.text(longWord, { size: 10, font: "Courier" });
    const pdf = decode(doc.toBuffer());
    // Each emitted line's literal must be shorter than the raw token, proving
    // it was hard-split rather than run off the page.
    const literals = [...pdf.matchAll(/\(([^)]*)\)\s*Tj/g)].map((m) => m[1]);
    const xLines = literals.filter((l) => /^x+$/.test(l));
    expect(xLines.length).toBeGreaterThan(1);
    for (const l of xLines) expect(l.length).toBeLessThan(500);
  });
});

describe("textWidth", () => {
  it("is monospaced for Courier", () => {
    expect(textWidth("abcd", 10, "Courier")).toBeCloseTo(4 * 6);
  });

  it("is proportional for Helvetica (i narrower than m)", () => {
    expect(textWidth("i", 10, "Helvetica")).toBeLessThan(
      textWidth("m", 10, "Helvetica")
    );
  });
});

describe("renderContractPdf", () => {
  const base = {
    org: { name: "Acme Co", legalName: "Acme Corporation" },
    contract: {
      reference: "CTR-0001",
      title: "Master Services Agreement",
      status: "EXECUTED",
      value: 120000,
      currency: "USD",
      counterpartyName: "Globex LLC",
      executedAt: new Date("2026-01-15T00:00:00Z"),
    },
    version: {
      versionNumber: 3,
      body: "1. The parties agree to the following terms.\n\n2. Payment is due net-30.",
      contentHash: "a".repeat(64),
      origin: "GENERATED",
    },
    signatures: [
      {
        signerName: "Jane Signer",
        signerEmail: "jane@globex.example",
        order: 0,
        status: "SIGNED",
        signatureType: "TYPED",
        signatureData: "Jane Signer",
        signedAt: new Date("2026-01-15T10:30:00Z"),
        ipAddress: "203.0.113.7",
        documentHash: "a".repeat(64),
      },
    ],
    generatedAt: new Date("2026-07-16T00:00:00Z"),
  };

  it("produces a multi-page PDF with the document and certificate", () => {
    const pdf = decode(renderContractPdf(base));
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    // Cover + certificate force at least two pages.
    const count = Number(pdf.match(/\/Count (\d+)/)![1]);
    expect(count).toBeGreaterThanOrEqual(2);
    expect(pdf).toContain("Signature Certificate");
    expect(pdf).toContain("Jane Signer");
  });

  it("marks non-executed contracts as draft", () => {
    const pdf = decode(
      renderContractPdf({
        ...base,
        contract: { ...base.contract, status: "DRAFT" },
      })
    );
    expect(pdf).toContain("DRAFT");
  });

  it("handles a contract with no version or signatures", () => {
    const pdf = decode(
      renderContractPdf({ ...base, version: null, signatures: [] })
    );
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf).toContain("No signatures have been collected");
  });
});
