import { describe, expect, it } from "vitest";

import {
  assertUrlPreservation,
  extractUrls,
  formatUrlPreservationIssues,
  validateUrlPreservation,
} from "../src/url-preservation/index";

describe("extractUrls", () => {
  it("extracts common URL forms and trims sentence punctuation", () => {
    expect(
      extractUrls(
        "Open https://example.com/deals?a=1, email mailto:support@example.com, or visit www.example.com.",
      ),
    ).toEqual(["https://example.com/deals?a=1", "mailto:support@example.com", "www.example.com"]);
  });

  it("keeps balanced closing delimiters inside URLs", () => {
    expect(extractUrls("See https://example.com/search?q=(spa).")).toEqual([
      "https://example.com/search?q=(spa)",
    ]);
  });
});

describe("validateUrlPreservation", () => {
  it("accepts translated text when all source URLs are preserved", () => {
    const result = validateUrlPreservation(
      "Read more at https://example.com/policies before booking.",
      "Avant de réserver, consultez https://example.com/policies.",
    );

    expect(result).toEqual({
      isValid: true,
      sourceUrls: ["https://example.com/policies"],
      targetUrls: ["https://example.com/policies"],
      issues: [],
    });
  });

  it("rejects translated or changed URLs", () => {
    const result = validateUrlPreservation(
      "Read more at https://example.com/policies before booking.",
      "Consultez https://example.fr/politiques avant de réserver.",
    );

    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "urls_missing",
        missingUrls: ["https://example.com/policies"],
      }),
    );
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "urls_added",
        extraUrls: ["https://example.fr/politiques"],
      }),
    );
  });

  it("treats duplicate source URLs as preservation requirements", () => {
    const result = validateUrlPreservation(
      "Use https://example.com, then confirm at https://example.com.",
      "Utilisez https://example.com.",
    );

    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "urls_missing",
        missingUrls: ["https://example.com"],
      }),
    );
  });
});

describe("assertUrlPreservation", () => {
  it("throws a readable error when validation fails", () => {
    expect(() =>
      assertUrlPreservation("Visit https://example.com.", "Consultez https://example.fr."),
    ).toThrow(/missing "https:\/\/example\.com"/);
  });
});

describe("formatUrlPreservationIssues", () => {
  it("formats issue arrays for guard-step logs", () => {
    const result = validateUrlPreservation(
      "Visit https://example.com.",
      "Consultez https://example.fr.",
    );

    expect(formatUrlPreservationIssues(result.issues)).toContain(
      'URL preservation failed: missing "https://example.com"',
    );
  });
});
