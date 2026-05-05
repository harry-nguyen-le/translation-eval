import { describe, expect, it } from "vitest";

import {
  collectHtmlFunctionalElements,
  collectSpecialCharacters,
  extractHtmlLayout,
  validateHtmlLayoutPreservation,
} from "../src/html-layout-preservation/index";

describe("extractHtmlLayout", () => {
  it("extracts only block/layout structure", () => {
    expect(extractHtmlLayout("<p>Room A <strong>and</strong> Room B</p>")).toEqual([
      {
        tag: "p",
        children: [],
      },
    ]);
  });

  it("keeps nested layout structure through ignored inline wrappers", () => {
    expect(
      extractHtmlLayout("<span><section><span><ul><li>One</li></ul></span></section></span>"),
    ).toEqual([
      {
        tag: "section",
        children: [
          {
            tag: "ul",
            children: [
              {
                tag: "li",
                children: [],
              },
            ],
          },
        ],
      },
    ]);
  });
});

describe("collectHtmlFunctionalElements", () => {
  it("collects functional inline elements and attributes", () => {
    expect(
      collectHtmlFunctionalElements('<p>Read <a href="/guide" data-id="1">guide</a></p>'),
    ).toEqual([
      {
        tag: "a",
        attributes: {
          "data-id": "1",
          href: "/guide",
        },
      },
    ]);
  });
});

describe("collectSpecialCharacters", () => {
  it("normalizes special entities and literal characters to code point names", () => {
    expect(collectSpecialCharacters("A&nbsp;B &#x202F; C\u200B")).toEqual([
      "U+00A0",
      "U+202F",
      "U+200B",
    ]);
  });
});

describe("validateHtmlLayoutPreservation", () => {
  it("allows stylistic inline formatting to disappear when layout is preserved", () => {
    const result = validateHtmlLayoutPreservation(
      "<p>Room A <strong>and</strong> Room B</p>",
      "<p>Chambre A et chambre B</p>",
    );

    expect(result.isValid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("allows functional inline elements to move when their inventory is preserved", () => {
    const result = validateHtmlLayoutPreservation(
      '<p>Read the <a href="/guide">installation guide</a> before continuing.</p>',
      '<p><a href="/guide">Guide d’installation</a> a lire avant de continuer.</p>',
    );

    expect(result.isValid).toBe(true);
  });

  it("treats closed rich-text link tags as functional inline elements", () => {
    const result = validateHtmlLayoutPreservation(
      "Read our full <link>Terms & Conditions</link>",
      "Lisez nos <link>conditions generales</link> completes",
    );

    expect(result.isValid).toBe(true);
  });

  it("rejects changed block layout", () => {
    const result = validateHtmlLayoutPreservation(
      "<section><p>Intro</p><ul><li>One</li><li>Two</li></ul></section>",
      "<section><p>Intro</p><p>One. Two.</p></section>",
    );

    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "layout_structure_changed",
      }),
    );
  });

  it("rejects changed functional inline element inventory", () => {
    const result = validateHtmlLayoutPreservation(
      '<p>Read <a href="/terms">terms</a></p>',
      '<p>Lisez <a href="/conditions">les conditions</a></p>',
    );

    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "functional_inline_inventory_changed",
      }),
    );
  });

  it("rejects newly introduced special spaces and entities", () => {
    const result = validateHtmlLayoutPreservation(
      "<p>Hello world</p>",
      "<p>Bonjour&nbsp;le monde</p>",
    );

    expect(result.issues).toContainEqual({
      code: "special_character_added",
      sourceSpecialCharacters: [],
      targetSpecialCharacters: ["U+00A0"],
      addedSpecialCharacters: ["U+00A0"],
    });
  });

  it("allows existing special spaces when target does not add more", () => {
    const result = validateHtmlLayoutPreservation(
      "<p>Total:&nbsp;100</p>",
      "<p>Total :&#160;100</p>",
    );

    expect(result.isValid).toBe(true);
  });

  it("rejects unbalanced markup in the target", () => {
    const result = validateHtmlLayoutPreservation(
      "<p>Hello <strong>world</strong></p>",
      "<p>Bonjour <strong>monde</p>",
    );

    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "markup_parse_error",
        side: "target",
      }),
    );
  });
});
