// Assembles a printable PDF for a contract: a cover with the deal summary, the
// full current document text, and a signature certificate page recording every
// signer, their method, timestamp, IP, and the document hash they signed.
//
// This module is pure (no DB, no framework) so it can be unit-tested; the route
// handler in app/(app)/contracts/[id]/pdf/route.ts loads the data and calls it.

import { PdfDocument } from "./pdf";
import { CONTRACT_STATUS_LABELS, type ContractStatus } from "./constants";

export interface ContractPdfInput {
  org: {
    name: string;
    legalName?: string | null;
    signatoryName?: string | null;
    signatoryTitle?: string | null;
  } | null;
  contract: {
    reference: string;
    title: string;
    status: string;
    category?: string | null;
    description?: string | null;
    counterpartyName?: string | null;
    value?: number | null;
    currency?: string | null;
    effectiveDate?: Date | null;
    expirationDate?: Date | null;
    executedAt?: Date | null;
    ownerName?: string | null;
    createdByName?: string | null;
  };
  version: {
    versionNumber: number;
    body: string;
    contentHash: string;
    origin: string;
  } | null;
  signatures: {
    signerName: string;
    signerEmail: string;
    order: number;
    status: string;
    signatureType?: string | null;
    signatureData?: string | null;
    signedAt?: Date | null;
    ipAddress?: string | null;
    documentHash?: string | null;
  }[];
  generatedAt: Date;
}

function fmtDate(d?: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function fmtDateTime(d?: Date | null): string {
  if (!d) return "—";
  return (
    d.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
    }) + " UTC"
  );
}

function fmtMoney(value?: number | null, currency?: string | null): string {
  if (value == null) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
    }).format(value);
  } catch {
    return `${currency || "USD"} ${value.toFixed(2)}`;
  }
}

export function renderContractPdf(input: ContractPdfInput): Uint8Array<ArrayBuffer> {
  const { org, contract, version, signatures, generatedAt } = input;
  const statusLabel =
    CONTRACT_STATUS_LABELS[contract.status as ContractStatus] ?? contract.status;

  const doc = new PdfDocument({
    footer: `${contract.reference} · ${contract.title} · generated ${fmtDate(generatedAt)}`,
  });

  // --- Cover / summary ------------------------------------------------------
  if (org) {
    doc.text(org.legalName || org.name, { size: 11, font: "Helvetica-Bold" });
  }
  doc.text(`${contract.reference}  ·  ${statusLabel}`, {
    size: 10,
    font: "Helvetica",
    color: "0.45 0.45 0.45",
  });
  doc.spacer(2);
  doc.text(contract.title, { size: 20, font: "Helvetica-Bold", lineHeight: 24 });
  if (contract.description) {
    doc.spacer(2);
    doc.text(contract.description, { size: 10, color: "0.4 0.4 0.4" });
  }

  if (contract.status !== "EXECUTED") {
    doc.spacer(6);
    doc.text(`DRAFT — this contract is not yet executed (status: ${statusLabel}).`, {
      size: 10,
      font: "Helvetica-Bold",
      color: "0.75 0.35 0.1",
    });
  }

  doc.rule();
  if (contract.counterpartyName) doc.kv("Counterparty", contract.counterpartyName);
  if (org) doc.kv("Party", org.legalName || org.name);
  doc.kv("Value", fmtMoney(contract.value, contract.currency));
  if (contract.category) doc.kv("Category", contract.category);
  if (contract.ownerName) doc.kv("Owner", contract.ownerName);
  doc.kv("Effective date", fmtDate(contract.effectiveDate));
  doc.kv("Expiration date", fmtDate(contract.expirationDate));
  doc.kv("Executed", fmtDate(contract.executedAt));
  doc.rule();

  // --- Agreement body -------------------------------------------------------
  doc.heading("Agreement");
  if (version) {
    doc.text(version.body, { size: 10, lineHeight: 14 });
  } else {
    doc.text("No document has been generated for this contract yet.", {
      size: 10,
      color: "0.4 0.4 0.4",
    });
  }

  // --- Signature certificate ------------------------------------------------
  doc.pageBreak();
  doc.heading("Signature Certificate");
  doc.text(
    "This page records the electronic signatures collected for this agreement, " +
      "including the signer, method, timestamp, network address, and the SHA-256 " +
      "hash of the exact document text at the time of signing.",
    { size: 10, color: "0.35 0.35 0.35", lineHeight: 14 }
  );
  doc.spacer(6);

  if (signatures.length === 0) {
    doc.text("No signatures have been collected.", { size: 10, color: "0.4 0.4 0.4" });
  } else {
    signatures.forEach((sig, i) => {
      if (i > 0) doc.rule();
      doc.text(`${sig.order + 1}. ${sig.signerName}`, {
        size: 12,
        font: "Helvetica-Bold",
        lineHeight: 16,
      });
      doc.kv("Email", sig.signerEmail);
      doc.kv("Status", sig.status);
      if (sig.status === "SIGNED") {
        doc.kv(
          "Method",
          sig.signatureType === "DRAWN"
            ? "Drawn signature"
            : sig.signatureType === "TYPED"
              ? `Typed: ${sig.signatureData ?? ""}`
              : sig.signatureType ?? "—"
        );
        doc.kv("Signed at", fmtDateTime(sig.signedAt));
        doc.kv("IP address", sig.ipAddress ?? "—");
        if (sig.documentHash) doc.kv("Document hash", sig.documentHash, { mono: true });
      }
    });
  }

  if (version) {
    doc.rule();
    doc.text("Document integrity", { size: 11, font: "Helvetica-Bold" });
    doc.kv("Version", `v${version.versionNumber} (${version.origin.toLowerCase()})`);
    doc.kv("Content hash", version.contentHash, { mono: true });
  }

  doc.spacer(10);
  doc.text(
    `Generated by Contractable on ${fmtDateTime(generatedAt)}. The hash-chained ` +
      `audit log is the system of record for this contract's history.`,
    { size: 8, color: "0.55 0.55 0.55", lineHeight: 11 }
  );

  return doc.toBuffer();
}
