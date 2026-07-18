import { describe, it, expect } from "vitest";
import { toCsv, parseCsv, parseCsvRecords } from "./csv";

describe("toCsv", () => {
  it("quotes only fields that need it and escapes quotes", () => {
    expect(toCsv([["plain", 'has "quotes"', "has,comma", "has\nnewline"]])).toBe(
      'plain,"has ""quotes""","has,comma","has\nnewline"'
    );
  });

  it("renders null/undefined as empty and numbers as-is", () => {
    expect(toCsv([["a", null, undefined, 42]])).toBe("a,,,42");
  });
});

describe("parseCsv", () => {
  it("parses simple rows with LF or CRLF endings", () => {
    expect(parseCsv("a,b\r\nc,d\n")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("handles quoted fields with commas, quotes, and newlines", () => {
    expect(parseCsv('"x,y","he said ""hi""","line1\nline2"')).toEqual([
      ["x,y", 'he said "hi"', "line1\nline2"],
    ]);
  });

  it("round-trips through toCsv", () => {
    const rows = [
      ["name", "notes"],
      ["Acme, Inc.", 'Said "call us"\nnext week'],
      ["Plain Co", ""],
    ];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});

describe("parseCsvRecords", () => {
  it("keys fields by lower-cased headers and skips blank lines", () => {
    const recs = parseCsvRecords("Name,Contact_Email\r\nGlobex,hank@globex.example\r\n\r\n");
    expect(recs).toEqual([{ name: "Globex", contact_email: "hank@globex.example" }]);
  });

  it("pads short rows and returns [] without data rows", () => {
    expect(parseCsvRecords("name,email\r\nOnlyName")).toEqual([
      { name: "OnlyName", email: "" },
    ]);
    expect(parseCsvRecords("name,email")).toEqual([]);
  });
});
