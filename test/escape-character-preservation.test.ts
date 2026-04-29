import { describe, expect, it } from "vitest";

import {
  collectJsonStringEscapes,
  validateEscapeCharacterPreservation,
} from "../src/escape-character-preservation/index";

describe("collectJsonStringEscapes", () => {
  it("collects and classifies JSON escape sequences", () => {
    const escapes = collectJsonStringEscapes(String.raw`"First\n\tSecond\\suffix\u00A0\""`);

    expect(escapes.map((escape) => escape.kind)).toEqual([
      "newline",
      "tab",
      "backslash",
      "unicode",
    ]);
    expect(escapes.map((escape) => escape.raw)).toEqual([
      String.raw`\n`,
      String.raw`\t`,
      String.raw`\\`,
      String.raw`\u00A0`,
    ]);
  });
});

describe("validateEscapeCharacterPreservation", () => {
  it("allows translated text when the escape inventory is preserved", () => {
    const issues = validateEscapeCharacterPreservation(
      String.raw`"Line one\n\tLine two"`,
      String.raw`"Ligne un\tLigne deux\n"`,
    );

    expect(issues).toEqual([]);
  });

  it("reports changed escape inventories", () => {
    const issues = validateEscapeCharacterPreservation(
      String.raw`"Line one\n\tLine two"`,
      String.raw`"Ligne un\nLigne deux"`,
    );

    expect(issues).toEqual([
      {
        code: "escape_sequences_changed",
        sourceEscapes: [String.raw`\n`, String.raw`\t`],
        targetEscapes: [String.raw`\n`],
      },
    ]);
  });
});
