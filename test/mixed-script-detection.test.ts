import { describe, expect, it } from "vitest";

import {
  checkIcuTranslationForMixedScripts,
  detectedScriptForCharacter,
  expectedUnicodeScriptsForLocale,
  extractVisibleSegments
} from "../src/index";

describe("expectedUnicodeScriptsForLocale", () => {
  it("derives scripts from likely subtags", () => {
    expect([...expectedUnicodeScriptsForLocale("en")]).toEqual(["Latn"]);
    expect([...expectedUnicodeScriptsForLocale("ru")]).toEqual(["Cyrl"]);
    expect([...expectedUnicodeScriptsForLocale("sr-Latn")]).toEqual(["Latn"]);
    expect([...expectedUnicodeScriptsForLocale("zh-TW")]).toEqual(["Hani"]);
    expect([...expectedUnicodeScriptsForLocale("ja")]).toEqual([
      "Hani",
      "Hira",
      "Kana"
    ]);
    expect([...expectedUnicodeScriptsForLocale("ko")]).toEqual(["Hang", "Hani"]);
  });
});

describe("extractVisibleSegments", () => {
  it("ignores placeholders and simple format arguments", () => {
    expect(
      extractVisibleSegments("{userName} reset {count, number} files").map(
        (segment) => segment.text
      )
    ).toEqual([" reset ", " files"]);
  });

  it("walks plural and select option bodies", () => {
    const segments = extractVisibleSegments(
      "{count, plural, one {{gender, select, male {He has one file} other {They have one file}}} other {# files deleted}}"
    );

    expect(segments.map((segment) => segment.text)).toEqual([
      "He has one file",
      "They have one file",
      "# files deleted"
    ]);
    expect(segments[0]?.path).toBe(
      "$/{count, plural, one}/{gender, select, male}"
    );
  });

  it("strips rich-text tag names from visible literals", () => {
    expect(
      extractVisibleSegments("<link>メール</link>を送信しました").map(
        (segment) => segment.text
      )
    ).toEqual(["メールを送信しました"]);
  });
});

describe("checkIcuTranslationForMixedScripts", () => {
  it("reports a Cyrillic homoglyph in English visible text", () => {
    const result = checkIcuTranslationForMixedScripts(
      "{userName} reset your Pаypal password",
      "en"
    );

    expect(result.hasUnexpectedScript).toBe(true);
    expect(
      result.issues.map((issue) => ({
        char: issue.char,
        script: issue.script,
        path: issue.path
      }))
    ).toEqual([
      {
        char: "а",
        script: "Cyrillic",
        path: "$"
      }
    ]);
  });

  it("does not report Latin ICU syntax in a Japanese plural", () => {
    const result = checkIcuTranslationForMixedScripts(
      "{count, plural, one {# 件のファイル} other {# 件のファイル}}",
      "ja"
    );

    expect(result.hasUnexpectedScript).toBe(false);
  });

  it("allows exact exception terms without allowing spoofed variants", () => {
    const valid = checkIcuTranslationForMixedScripts(
      "PayPalからメールを送信しました",
      "ja",
      {
        allowedTerms: ["PayPal"]
      }
    );

    expect(valid.hasUnexpectedScript).toBe(false);

    const spoofed = checkIcuTranslationForMixedScripts(
      "PаyPalからメールを送信しました",
      "ja",
      {
        allowedTerms: ["PayPal"]
      }
    );

    expect(spoofed.hasUnexpectedScript).toBe(true);
    expect(spoofed.issues.some((issue) => issue.script === "Cyrillic")).toBe(
      true
    );
  });

  it("respects explicit script subtags for multi-script languages", () => {
    expect(
      checkIcuTranslationForMixedScripts("Lozinka je promenjena", "sr-Latn")
        .hasUnexpectedScript
    ).toBe(false);
    expect(
      checkIcuTranslationForMixedScripts("Lozinka je promenjena", "sr")
        .hasUnexpectedScript
    ).toBe(true);
  });

  it("supports optional pattern-based allowed spans", () => {
    const result = checkIcuTranslationForMixedScripts(
      "詳しくは https://example.com/help を参照してください",
      "ja",
      {
        allowedPatterns: [/https?:\/\/[^\s]+/u]
      }
    );

    expect(result.hasUnexpectedScript).toBe(false);
  });
});

describe("detectedScriptForCharacter", () => {
  it("labels common scripts for issue reporting", () => {
    expect(detectedScriptForCharacter("a")).toBe("Latin");
    expect(detectedScriptForCharacter("а")).toBe("Cyrillic");
    expect(detectedScriptForCharacter("あ")).toBe("Hiragana");
  });
});
