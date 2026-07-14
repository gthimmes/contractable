import { describe, it, expect } from "vitest";
import { renderTemplate, extractVariables } from "./template";

describe("renderTemplate - interpolation", () => {
  it("renders a simple top-level value", () => {
    expect(renderTemplate("Hello {{ name }}!", { name: "World" })).toBe(
      "Hello World!"
    );
  });

  it("resolves dotted paths", () => {
    const ctx = { counterparty: { legalName: "Acme, Inc." } };
    expect(renderTemplate("Party: {{ counterparty.legalName }}", ctx)).toBe(
      "Party: Acme, Inc."
    );
  });

  it("renders missing / null / undefined values as empty string", () => {
    expect(renderTemplate("[{{ missing }}]", {})).toBe("[]");
    expect(renderTemplate("[{{ a.b.c }}]", { a: {} })).toBe("[]");
    expect(renderTemplate("[{{ x }}]", { x: null })).toBe("[]");
    expect(renderTemplate("[{{ x }}]", { x: undefined })).toBe("[]");
  });

  it("preserves whitespace and newlines outside tags", () => {
    const tpl = "Line 1\n  {{ v }}  \nLine 3";
    expect(renderTemplate(tpl, { v: "X" })).toBe("Line 1\n  X  \nLine 3");
  });

  it("renders numbers and booleans via their string form", () => {
    expect(renderTemplate("{{ n }}/{{ b }}", { n: 42, b: true })).toBe(
      "42/true"
    );
  });
});

describe("renderTemplate - helpers", () => {
  it("money formats a number as whole-dollar USD", () => {
    expect(renderTemplate("{{ amount | money }}", { amount: 240000 })).toBe(
      "$240,000"
    );
    expect(renderTemplate("{{ amount | money }}", { amount: 0 })).toBe("$0");
    expect(renderTemplate("{{ amount | money }}", { amount: 1234.9 })).toBe(
      "$1,235"
    );
  });

  it("money returns empty string for non-finite / missing input", () => {
    expect(renderTemplate("{{ amount | money }}", { amount: "nope" })).toBe("");
    expect(renderTemplate("{{ amount | money }}", {})).toBe("");
    expect(renderTemplate("{{ amount | money }}", { amount: NaN })).toBe("");
  });

  it("date formats an ISO date-string as 'Mon D, YYYY'", () => {
    expect(renderTemplate("{{ d | date }}", { d: "2026-07-14" })).toBe(
      "Jul 14, 2026"
    );
  });

  it("date formats a Date instance", () => {
    const d = new Date("2026-01-05T00:00:00Z");
    expect(renderTemplate("{{ d | date }}", { d })).toBe("Jan 5, 2026");
  });

  it("date returns empty string for unparseable input", () => {
    expect(renderTemplate("{{ d | date }}", { d: "not-a-date" })).toBe("");
    expect(renderTemplate("{{ d | date }}", {})).toBe("");
  });

  it("upper and lower change case", () => {
    expect(renderTemplate("{{ name | upper }}", { name: "aiwyn" })).toBe(
      "AIWYN"
    );
    expect(renderTemplate("{{ name | lower }}", { name: "Aiwyn" })).toBe(
      "aiwyn"
    );
  });

  it("default substitutes for empty/null/undefined values", () => {
    expect(renderTemplate('{{ x | default:"N/A" }}', {})).toBe("N/A");
    expect(renderTemplate('{{ x | default:"N/A" }}', { x: null })).toBe("N/A");
    expect(renderTemplate('{{ x | default:"N/A" }}', { x: "" })).toBe("N/A");
    expect(renderTemplate('{{ x | default:"N/A" }}', { x: "here" })).toBe(
      "here"
    );
  });

  it("chains helpers left-to-right", () => {
    expect(renderTemplate('{{ v | default:"0" | upper }}', {})).toBe("0");
    expect(
      renderTemplate('{{ name | default:"n/a" | upper }}', { name: "acme" })
    ).toBe("ACME");
  });

  it("leaves unknown helper names as pass-through (never throws)", () => {
    expect(renderTemplate("{{ v | bogus }}", { v: "raw" })).toBe("raw");
  });
});

describe("renderTemplate - conditionals", () => {
  it("renders the block when the path is truthy", () => {
    expect(
      renderTemplate("{{#if signed}}DONE{{/if}}", { signed: true })
    ).toBe("DONE");
    expect(renderTemplate("{{#if items}}has{{/if}}", { items: [1] })).toBe(
      "has"
    );
  });

  it("omits the block when the path is falsy", () => {
    expect(renderTemplate("{{#if signed}}DONE{{/if}}", { signed: false })).toBe(
      ""
    );
    expect(renderTemplate("{{#if n}}x{{/if}}", { n: 0 })).toBe("");
    expect(renderTemplate("{{#if s}}x{{/if}}", { s: "" })).toBe("");
    expect(renderTemplate("{{#if arr}}x{{/if}}", { arr: [] })).toBe("");
    expect(renderTemplate("{{#if o}}x{{/if}}", { o: {} })).toBe("");
    expect(renderTemplate("{{#if missing}}x{{/if}}", {})).toBe("");
  });

  it("supports else branches", () => {
    const tpl = "{{#if ok}}yes{{else}}no{{/if}}";
    expect(renderTemplate(tpl, { ok: true })).toBe("yes");
    expect(renderTemplate(tpl, { ok: false })).toBe("no");
  });

  it("treats a non-empty object as truthy", () => {
    expect(
      renderTemplate("{{#if party}}named{{/if}}", { party: { name: "X" } })
    ).toBe("named");
  });
});

describe("renderTemplate - iteration", () => {
  it("iterates a primitive array with {{this}}", () => {
    expect(
      renderTemplate("{{#each tags}}[{{this}}]{{/each}}", {
        tags: ["a", "b", "c"],
      })
    ).toBe("[a][b][c]");
  });

  it("exposes {{this.field}} and {{@index}} for object items", () => {
    const ctx = {
      parties: [{ name: "Acme" }, { name: "Beta" }],
    };
    expect(
      renderTemplate("{{#each parties}}{{@index}}:{{this.name}} {{/each}}", ctx)
    ).toBe("0:Acme 1:Beta ");
  });

  it("still resolves outer-context paths inside the block", () => {
    const ctx = {
      title: "Roster",
      people: [{ name: "A" }, { name: "B" }],
    };
    expect(
      renderTemplate("{{#each people}}{{title}}={{this.name}};{{/each}}", ctx)
    ).toBe("Roster=A;Roster=B;");
  });

  it("renders nothing for a missing or non-array list", () => {
    expect(renderTemplate("{{#each nope}}x{{/each}}", {})).toBe("");
    expect(renderTemplate("{{#each nope}}x{{/each}}", { nope: 5 })).toBe("");
  });

  it("applies helpers to item fields", () => {
    const ctx = { lines: [{ amt: 100 }, { amt: 2500 }] };
    expect(
      renderTemplate("{{#each lines}}{{this.amt | money}} {{/each}}", ctx)
    ).toBe("$100 $2,500 ");
  });
});

describe("renderTemplate - nested blocks", () => {
  it("nests an if inside an each", () => {
    const ctx = {
      rows: [
        { name: "A", active: true },
        { name: "B", active: false },
      ],
    };
    const tpl =
      "{{#each rows}}{{this.name}}:{{#if this.active}}on{{else}}off{{/if}} {{/each}}";
    expect(renderTemplate(tpl, ctx)).toBe("A:on B:off ");
  });

  it("nests an each inside an each with independent indexes", () => {
    const ctx = {
      groups: [
        { items: ["x", "y"] },
        { items: ["z"] },
      ],
    };
    const tpl =
      "{{#each groups}}G{{@index}}[{{#each this.items}}{{@index}}={{this}} {{/each}}]{{/each}}";
    expect(renderTemplate(tpl, ctx)).toBe("G0[0=x 1=y ]G1[0=z ]");
  });

  it("nests conditionals within conditionals", () => {
    const tpl = "{{#if a}}{{#if b}}both{{else}}onlyA{{/if}}{{/if}}";
    expect(renderTemplate(tpl, { a: true, b: true })).toBe("both");
    expect(renderTemplate(tpl, { a: true, b: false })).toBe("onlyA");
    expect(renderTemplate(tpl, { a: false, b: true })).toBe("");
  });
});

describe("renderTemplate - robustness", () => {
  it("does not throw on stray/unbalanced tags", () => {
    expect(() => renderTemplate("{{/if}} tail", {})).not.toThrow();
    expect(() => renderTemplate("{{else}}", {})).not.toThrow();
    expect(renderTemplate("a {{/each}} b", {})).toBe("a  b");
  });

  it("handles an unterminated if by rendering its body when truthy", () => {
    expect(renderTemplate("{{#if ok}}body", { ok: true })).toBe("body");
    expect(renderTemplate("{{#if ok}}body", { ok: false })).toBe("");
  });
});

describe("extractVariables", () => {
  it("returns sorted, de-duplicated interpolation paths", () => {
    const body = "{{ b }} {{ a }} {{ a }} {{ c.d }}";
    expect(extractVariables(body)).toEqual(["a", "b", "c.d"]);
  });

  it("strips helper pipes before extracting", () => {
    expect(extractVariables("{{ value | money }}")).toEqual(["value"]);
    expect(extractVariables('{{ x | default:"N/A" | upper }}')).toEqual(["x"]);
  });

  it("includes if/each block paths", () => {
    const body = "{{#if signed}}{{ date | date }}{{/if}}{{#each rows}}{{/each}}";
    expect(extractVariables(body)).toEqual(["date", "rows", "signed"]);
  });

  it("excludes this, this.* and @index", () => {
    const body = "{{#each items}}{{@index}} {{this}} {{this.name}}{{/each}}";
    expect(extractVariables(body)).toEqual(["items"]);
  });

  it("collects outer paths referenced inside blocks", () => {
    const body =
      "{{#each people}}{{ org.name }} {{this.name}}{{/each}}";
    expect(extractVariables(body)).toEqual(["org.name", "people"]);
  });

  it("returns an empty array when there are no variables", () => {
    expect(extractVariables("plain text, no tags")).toEqual([]);
  });
});
