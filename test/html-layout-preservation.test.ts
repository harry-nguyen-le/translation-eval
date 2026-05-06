import { describe, expect, it } from "vitest";

import { validateHtmlLayoutPreservation } from "../src/html-layout-preservation/index";

describe("validateHtmlLayoutPreservation", () => {
  it("extracts only block/layout structure", () => {
    const result = validateHtmlLayoutPreservation(
      "<p>Room A <strong>and</strong> Room B</p>",
      "<p>Room A and Room B</p>",
    );

    expect(result.sourceLayout).toEqual([{ tag: "p", children: [] }]);
    expect(result.targetLayout).toEqual([{ tag: "p", children: [] }]);
    expect(result.isValid).toBe(true);
  });

  it("keeps nested layout structure through ignored inline wrappers", () => {
    const result = validateHtmlLayoutPreservation(
      "<span><section><span><ul><li>One</li></ul></span></section></span>",
      "<section><ul><li>One</li></ul></section>",
    );

    expect(result.sourceLayout).toEqual([
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
    expect(result.targetLayout).toEqual(result.sourceLayout);
    expect(result.isValid).toBe(true);
  });

  it("ignores table hierarchy", () => {
    const result = validateHtmlLayoutPreservation(
      "<table><thead><tr><th>Name</th></tr></thead><tbody><tr><td>Ada</td></tr></tbody></table>",
      "<table><tbody><tr><td>Nom Ada</td></tr></tbody></table>",
    );

    expect(result.sourceLayout).toEqual([]);
    expect(result.targetLayout).toEqual(result.sourceLayout);
    expect(result.isValid).toBe(true);
  });

  it("allows stylistic inline formatting to disappear when layout is preserved", () => {
    const result = validateHtmlLayoutPreservation(
      "<p>Room A <strong>and</strong> Room B</p>",
      "<p>Chambre A et chambre B</p>",
    );

    expect(result.isValid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("ignores inline element changes when layout is preserved", () => {
    const result = validateHtmlLayoutPreservation(
      '<p>Read the <a href="/guide">installation guide</a> before continuing.</p>',
      "<p>Guide d’installation a lire avant de continuer.</p>",
    );

    expect(result.isValid).toBe(true);
  });

  it("ignores closed rich-text link tags", () => {
    const result = validateHtmlLayoutPreservation(
      "Read our full <link>Terms & Conditions</link>",
      "Lisez nos conditions generales completes",
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

  it("rejects newly introduced special spaces and entities", () => {
    const result = validateHtmlLayoutPreservation(
      "<p>Hello world</p>",
      "<p>Bonjour&nbsp;le monde &#x202F; C\u200B</p>",
    );

    expect(result.issues).toContainEqual({
      code: "special_character_added",
      sourceSpecialCharacters: [],
      targetSpecialCharacters: ["U+00A0", "U+202F", "U+200B"],
      addedSpecialCharacters: ["U+00A0", "U+202F", "U+200B"],
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
