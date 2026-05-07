import { describe, expect, it } from "vitest";

import { validateSpecialCharacterPreservation } from "../src/special-character-preservation/index";

describe("validateSpecialCharacterPreservation", () => {
  it("allows target content that does not add special characters", () => {
    const result = validateSpecialCharacterPreservation("<p>Hello world</p>", "<p>Bonjour</p>");

    expect(result).toEqual({
      isValid: true,
      sourceSpecialCharacters: [],
      targetSpecialCharacters: [],
      issues: [],
    });
  });

  it("allows newly introduced French no-break spaces", () => {
    const result = validateSpecialCharacterPreservation(
      "<p>Hello world</p>",
      "<p>Bonjour&nbsp;le monde &#x202F;! Total :\u00A0100\u202F€</p>",
    );

    expect(result).toEqual({
      isValid: true,
      sourceSpecialCharacters: [],
      targetSpecialCharacters: [],
      issues: [],
    });
  });

  it("rejects newly introduced invisible controls", () => {
    const result = validateSpecialCharacterPreservation(
      "<p>Hello world</p>",
      "<p>Bonjour le monde C\u200B</p>",
    );

    expect(result).toEqual({
      isValid: false,
      sourceSpecialCharacters: [],
      targetSpecialCharacters: ["U+200B"],
      issues: [
        {
          code: "special_character_added",
          sourceSpecialCharacters: [],
          targetSpecialCharacters: ["U+200B"],
          addedSpecialCharacters: ["U+200B"],
        },
      ],
    });
  });

  it("allows existing special characters when target does not add more", () => {
    const result = validateSpecialCharacterPreservation(
      "<p>Total:&#x200B;100</p>",
      "<p>Total:&#8203;100</p>",
    );

    expect(result.isValid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("rejects extra copies of existing special characters", () => {
    const result = validateSpecialCharacterPreservation(
      "<p>Total:&#x200B;100</p>",
      "<p>Total:&#8203;\u200B100</p>",
    );

    expect(result.issues).toEqual([
      {
        code: "special_character_added",
        sourceSpecialCharacters: ["U+200B"],
        targetSpecialCharacters: ["U+200B", "U+200B"],
        addedSpecialCharacters: ["U+200B"],
      },
    ]);
  });
});
