import { describe, expect, it } from "vitest";

import {
  assertIcuSyntaxPreservation,
  formatIcuSyntaxPreservationIssues,
  validateIcuSyntaxPreservation,
} from "../src/icu-syntax-preservation/index";

describe("validateIcuSyntaxPreservation", () => {
  it("accepts translated plural branch text when ICU selectors are preserved", () => {
    const result = validateIcuSyntaxPreservation(
      "{count, plural, one {# file} other {# files}}",
      "{count, plural, one {# fichier} other {# fichiers}}",
    );

    expect(result).toEqual({
      isValid: true,
      issues: [],
    });
  });

  it("rejects translated plural selectors that FormatJS can parse", () => {
    const result = validateIcuSyntaxPreservation(
      "{count, plural, one {# file} other {# files}}",
      "{count, plural, un {# fichier} other {# fichiers}}",
    );

    expect(result.isValid).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "invalid_plural_selector",
        side: "target",
        argumentName: "count",
        selector: "un",
      }),
    );
  });

  it("allows valid ICU plural categories and canonical exact-number selectors", () => {
    const result = validateIcuSyntaxPreservation(
      "{count, plural, =0 {No files} one {# file} other {# files}}",
      "{count, plural, =0 {Aucun fichier} one {# fichier} other {# fichiers}}",
    );

    expect(result.isValid).toBe(true);
  });

  it("rejects noncanonical exact-number plural selectors", () => {
    const result = validateIcuSyntaxPreservation(
      "{count, plural, one {# file} other {# files}}",
      "{count, plural, =01 {# fichier} other {# fichiers}}",
    );

    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "invalid_plural_selector",
        selector: "=01",
      }),
    );
  });

  it("rejects invalid selectordinal selectors", () => {
    const result = validateIcuSyntaxPreservation(
      "{position, selectordinal, one {#st} other {#th}}",
      "{position, selectordinal, premier {#er} other {#e}}",
    );

    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "invalid_plural_selector",
        side: "target",
        argumentName: "position",
        selector: "premier",
      }),
    );
  });

  it("accepts select branch text translations when selector keys are preserved", () => {
    const result = validateIcuSyntaxPreservation(
      "{gender, select, male {He will respond.} female {She will respond.} other {They will respond.}}",
      "{gender, select, male {Il répondra.} female {Elle répondra.} other {La personne répondra.}}",
    );

    expect(result.isValid).toBe(true);
  });

  it("rejects translated select selector keys", () => {
    const result = validateIcuSyntaxPreservation(
      "{gender, select, male {He will respond.} female {She will respond.} other {They will respond.}}",
      "{gender, select, homme {Il répondra.} femme {Elle répondra.} other {La personne répondra.}}",
    );

    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "select_selectors_changed",
        argumentName: "gender",
        sourceSelectors: ["female", "male", "other"],
        targetSelectors: ["femme", "homme", "other"],
        missingSelectors: ["female", "male"],
        extraSelectors: ["femme", "homme"],
      }),
    );
  });

  it("rejects target select messages missing a source selector key", () => {
    const result = validateIcuSyntaxPreservation(
      "{status, select, pending {Pending approval} approved {Approved} rejected {Rejected} other {Unknown}}",
      "{status, select, pending {En attente d’approbation} approved {Approuvé} other {Inconnu}}",
    );

    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "select_selectors_changed",
        argumentName: "status",
        sourceSelectors: ["approved", "other", "pending", "rejected"],
        targetSelectors: ["approved", "other", "pending"],
        missingSelectors: ["rejected"],
        extraSelectors: [],
      }),
    );
  });

  it("rejects target select messages with extra selector keys", () => {
    const result = validateIcuSyntaxPreservation(
      "{status, select, pending {Pending approval} approved {Approved} other {Unknown}}",
      "{status, select, approved {Approuvé} pending {En attente d’approbation} rejected {Rejeté} other {Inconnu}}",
    );

    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "select_selectors_changed",
        argumentName: "status",
        sourceSelectors: ["approved", "other", "pending"],
        targetSelectors: ["approved", "other", "pending", "rejected"],
        missingSelectors: [],
        extraSelectors: ["rejected"],
      }),
    );
  });

  it("rejects changed argument names via FormatJS structural comparison", () => {
    const result = validateIcuSyntaxPreservation(
      "{count, plural, one {# file} other {# files}}",
      "{nombre, plural, one {# fichier} other {# fichiers}}",
    );

    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "structural_mismatch",
      }),
    );
  });

  it("reports target parse errors from FormatJS", () => {
    const result = validateIcuSyntaxPreservation(
      "{count, plural, one {# file} other {# files}}",
      "{count, pluriel, one {# fichier} other {# fichiers}}",
    );

    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "parse_error",
        side: "target",
      }),
    );
  });
});

describe("assertIcuSyntaxPreservation", () => {
  it("throws a readable error when validation fails", () => {
    expect(() =>
      assertIcuSyntaxPreservation(
        "{count, plural, one {# file} other {# files}}",
        "{count, plural, un {# fichier} other {# fichiers}}",
      ),
    ).toThrow(/invalid plural selector "un"/);
  });
});

describe("formatIcuSyntaxPreservationIssues", () => {
  it("formats issue arrays for guard-step logs", () => {
    const result = validateIcuSyntaxPreservation(
      "{gender, select, male {He} female {She} other {They}}",
      "{gender, select, homme {Il} female {Elle} other {Iel}}",
    );

    expect(formatIcuSyntaxPreservationIssues(result.issues)).toContain(
      'ICU select selectors changed for "gender"',
    );
  });
});
