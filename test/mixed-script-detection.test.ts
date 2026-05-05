import { describe, expect, it } from "vitest";

import {
  checkIcuTranslationForMixedScripts,
  detectedScriptForCharacter,
  expectedUnicodeScriptsForLocale,
  extractVisibleSegments,
} from "../src/mixed-script-detection/index";

describe("expectedUnicodeScriptsForLocale", () => {
  it("uses the likely Unicode script for the target locale", () => {
    expect(expectedUnicodeScriptsForLocale("de-DE")).toEqual(["Latn"]);
    expect(expectedUnicodeScriptsForLocale("ar-EG")).toEqual(["Arab"]);
  });
});

describe("extractVisibleSegments", () => {
  it("ignores placeholders and simple format arguments", () => {
    expect(
      extractVisibleSegments("{userName} reset {count, number} files").map(
        (segment) => segment.text,
      ),
    ).toEqual([" reset ", " files"]);
  });

  it("walks plural and select option bodies", () => {
    const segments = extractVisibleSegments(
      "{count, plural, one {{gender, select, male {He has one file} other {They have one file}}} other {# files deleted}}",
    );

    expect(segments.map((segment) => segment.text)).toEqual([
      "He has one file",
      "They have one file",
      "# files deleted",
    ]);
    expect(segments[0]?.path).toBe("$/{count, plural, one}/{gender, select, male}");
  });

  it("strips rich-text tag names from visible literals", () => {
    expect(
      extractVisibleSegments("<link>Read more</link> now").map((segment) => segment.text),
    ).toEqual(["Read more now"]);
  });
});

describe("checkIcuTranslationForMixedScripts", () => {
  it("reports a Cyrillic homoglyph in English visible text", () => {
    const result = checkIcuTranslationForMixedScripts(
      "{userName} reset your Pаypal password",
      "en",
    );

    expect(result.hasUnexpectedScript).toBe(true);
    expect(
      result.issues.map((issue) => ({
        char: issue.char,
        script: issue.script,
        path: issue.path,
      })),
    ).toEqual([
      {
        char: "а",
        script: "NonLatin",
        path: "$",
      },
    ]);
  });

  it("does not report ICU syntax", () => {
    const result = checkIcuTranslationForMixedScripts(
      "{count, plural, one {# file deleted} other {# files deleted}}",
      "en",
    );

    expect(result.hasUnexpectedScript).toBe(false);
  });

  it("allows exact exception terms without allowing spoofed variants", () => {
    const valid = checkIcuTranslationForMixedScripts("Email from PayPal sent", "en", {
      allowedTerms: ["PayPal"],
    });

    expect(valid.hasUnexpectedScript).toBe(false);

    const spoofed = checkIcuTranslationForMixedScripts("Email from PаyPal sent", "en", {
      allowedTerms: ["PayPal"],
    });

    expect(spoofed.hasUnexpectedScript).toBe(true);
    expect(spoofed.issues.some((issue) => issue.script === "NonLatin")).toBe(true);
  });

  it("uses the locale's likely script", () => {
    expect(
      checkIcuTranslationForMixedScripts("Лозинка је промењена", "sr").hasUnexpectedScript,
    ).toBe(false);
    expect(
      checkIcuTranslationForMixedScripts("Lozinka je promenjena", "sr").hasUnexpectedScript,
    ).toBe(true);
  });

  it("allows the expected script for non-Latin locales", () => {
    expect(
      checkIcuTranslationForMixedScripts("تحقّق من شمولات الحجز الخاصة بي", "ar-EG")
        .hasUnexpectedScript,
    ).toBe(false);
    expect(
      checkIcuTranslationForMixedScripts("تحقّق من شمولات الحجز الخاصة بي", "fr-FR")
        .hasUnexpectedScript,
    ).toBe(true);
  });

  it("supports optional pattern-based allowed spans", () => {
    const result = checkIcuTranslationForMixedScripts(
      "See https://例.example/help for details",
      "en",
      {
        allowedPatterns: [/https?:\/\/[^\s]+/u],
      },
    );

    expect(result.hasUnexpectedScript).toBe(false);
  });
});

describe("detectedScriptForCharacter", () => {
  it("labels Latin, neutral, and non-Latin characters", () => {
    expect(detectedScriptForCharacter("a")).toBe("Latin");
    expect(detectedScriptForCharacter(".")).toBe("Neutral");
    expect(detectedScriptForCharacter("а")).toBe("NonLatin");
  });
});
