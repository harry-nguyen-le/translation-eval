import { describe, expect, it } from "vitest";

import { checkMixedScripts } from "../src/mixed-script-detection/index";

describe("checkMixedScripts", () => {
  it("uses the likely Unicode script for the target locale", () => {
    expect(checkMixedScripts("Hallo", "de-DE").expectedScripts).toEqual(["Latn"]);
    expect(checkMixedScripts("مرحبا", "ar-EG").expectedScripts).toEqual(["Arab"]);
  });

  it("ignores placeholders and simple format arguments", () => {
    expect(
      checkMixedScripts("{userName} reset {count, number} files", "en").visibleSegments.map(
        (segment) => segment.text,
      ),
    ).toEqual([" reset ", " files"]);
  });

  it("walks plural and select option bodies", () => {
    const segments = checkMixedScripts(
      "{count, plural, one {{gender, select, male {He has one file} other {They have one file}}} other {# files deleted}}",
      "en",
    ).visibleSegments;

    expect(segments.map((segment) => segment.text)).toEqual([
      "He has one file",
      "They have one file",
      "# files deleted",
    ]);
    expect(segments[0]?.path).toBe("$/{count, plural, one}/{gender, select, male}");
  });

  it("strips rich-text tag names from visible literals", () => {
    expect(
      checkMixedScripts("<link>Read more</link> now", "en").visibleSegments.map(
        (segment) => segment.text,
      ),
    ).toEqual(["Read more now"]);
  });

  it("reports a Cyrillic homoglyph in English visible text", () => {
    const result = checkMixedScripts("{userName} reset your Pаypal password", "en");

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
    const result = checkMixedScripts(
      "{count, plural, one {# file deleted} other {# files deleted}}",
      "en",
    );

    expect(result.hasUnexpectedScript).toBe(false);
  });

  it("allows exact exception terms without allowing spoofed variants", () => {
    const valid = checkMixedScripts("Email from PayPal sent", "en", {
      allowedTerms: ["PayPal"],
    });

    expect(valid.hasUnexpectedScript).toBe(false);

    const spoofed = checkMixedScripts("Email from PаyPal sent", "en", {
      allowedTerms: ["PayPal"],
    });

    expect(spoofed.hasUnexpectedScript).toBe(true);
    expect(spoofed.issues.some((issue) => issue.script === "NonLatin")).toBe(true);
  });

  it("uses the locale's likely script", () => {
    expect(checkMixedScripts("Лозинка је промењена", "sr").hasUnexpectedScript).toBe(false);
    expect(checkMixedScripts("Lozinka je promenjena", "sr").hasUnexpectedScript).toBe(true);
  });

  it("allows the expected script for non-Latin locales", () => {
    expect(checkMixedScripts("تحقّق من شمولات الحجز الخاصة بي", "ar-EG").hasUnexpectedScript).toBe(
      false,
    );
    expect(checkMixedScripts("تحقّق من شمولات الحجز الخاصة بي", "fr-FR").hasUnexpectedScript).toBe(
      true,
    );
  });

  it("supports optional pattern-based allowed spans", () => {
    const result = checkMixedScripts("See https://例.example/help for details", "en", {
      allowedPatterns: [/https?:\/\/[^\s]+/u],
    });

    expect(result.hasUnexpectedScript).toBe(false);
  });

  it("checks plain text when requested", () => {
    const result = checkMixedScripts("Email from PаyPal sent", "en", { inputFormat: "text" });

    expect(result.visibleSegments).toEqual([
      {
        text: "Email from PаyPal sent",
        path: "$",
        start: 0,
        end: 22,
      },
    ]);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        char: "а",
        script: "NonLatin",
      }),
    );
  });
});
