import { describe, expect, it } from "vitest";

import {
  parseMarkdownForValidation,
  validateMarkdown,
  validateMarkdownPreservation,
} from "../src/markdown-preservation/index";

const hotelDescriptionJson = String.raw`"\n#### Rooms  \nMake yourself at home in one of the 220 guestrooms.\n\n#### Facilities  \nMake use of convenient amenities."`;

describe("parseMarkdownForValidation", () => {
  it("parses JSON-string Markdown with escaped newlines", () => {
    const result = parseMarkdownForValidation(hotelDescriptionJson);

    expect(result.inputFormat).toBe("json-string");
    expect(result.markdown.startsWith("\n#### Rooms")).toBe(true);
    expect(result.ast.children.map((node) => node.type)).toEqual([
      "heading",
      "paragraph",
      "heading",
      "paragraph",
    ]);
  });

  it("parses runtime Markdown strings directly", () => {
    const result = parseMarkdownForValidation("Read [the docs](/docs).");

    expect(result.inputFormat).toBe("runtime");
    expect(result.ast.children[0]?.type).toBe("paragraph");
  });
});

describe("validateMarkdown", () => {
  it("returns valid for parseable Markdown, including plain text that looks like markup", () => {
    const result = validateMarkdown("#Heading without a space\nnumber #1\n####\n######");

    expect(result.isValid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("returns invalid for JSON-string input that cannot be decoded", () => {
    const result = validateMarkdown(String.raw`"Line one\z"`);

    expect(result.isValid).toBe(false);
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "input_parse_error",
        side: "input",
      }),
    ]);
  });
});

describe("validateMarkdownPreservation", () => {
  it("allows translated text when heading structure is preserved", () => {
    const result = validateMarkdownPreservation(
      "## Cancellation\n### Refunds",
      "## Annulation\n### Remboursements",
    );

    expect(result.isValid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("rejects changed heading hierarchy", () => {
    const result = validateMarkdownPreservation(
      "## Cancellation\n### Refunds",
      "## Annulation\n###### Remboursements",
    );

    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "heading_structure_changed",
        sourceHeadingDepths: [2, 3],
        targetHeadingDepths: [2, 6],
      }),
    ]);
  });

  it("rejects changed list count or item counts", () => {
    const result = validateMarkdownPreservation("- One\n- Two\n  - Nested", "- Un\n  - Imbrique");

    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "list_structure_changed",
        sourceLists: [
          { depth: 0, ordered: false, itemCount: 2 },
          { depth: 2, ordered: false, itemCount: 1 },
        ],
        targetLists: [
          { depth: 0, ordered: false, itemCount: 1 },
          { depth: 2, ordered: false, itemCount: 1 },
        ],
      }),
    ]);
  });

  it("does not treat single-line list-looking labels as structural lists", () => {
    const result = validateMarkdownPreservation("- less", "weniger");

    expect(result.isValid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("rejects changed pipe table shape", () => {
    const result = validateMarkdownPreservation(
      "| A | B |\n| --- | --- |\n| one | two |",
      "| A | B | C |\n| --- | --- | --- |\n| un | deux | trois |",
    );

    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "table_structure_changed",
        sourceTables: [{ columns: 2, rows: 2 }],
        targetTables: [{ columns: 3, rows: 2 }],
      }),
    ]);
  });

  it("reports every structural preservation failure type in one input", () => {
    const source = [
      "## Cancellation",
      "### Refunds",
      "- Seven days",
      "- Fourteen days",
      "  - Store credit",
      "",
      "| Option | Window |",
      "| --- | --- |",
      "| Refund | 7 days |",
    ].join("\n");
    const target = [
      "## Annulation",
      "###### Remboursements",
      "- Sept jours",
      "  - Credit boutique",
      "",
      "| Option | Fenetre | Notes |",
      "| --- | --- | --- |",
      "| Remboursement | 7 jours | Disponible |",
    ].join("\n");

    const result = validateMarkdownPreservation(source, target);

    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "heading_structure_changed",
        sourceHeadingDepths: [2, 3],
        targetHeadingDepths: [2, 6],
      }),
      expect.objectContaining({
        code: "list_structure_changed",
        sourceLists: [
          { depth: 0, ordered: false, itemCount: 2 },
          { depth: 2, ordered: false, itemCount: 1 },
        ],
        targetLists: [
          { depth: 0, ordered: false, itemCount: 1 },
          { depth: 2, ordered: false, itemCount: 1 },
        ],
      }),
      expect.objectContaining({
        code: "table_structure_changed",
        sourceTables: [{ columns: 2, rows: 2 }],
        targetTables: [{ columns: 3, rows: 2 }],
      }),
    ]);
  });
});
