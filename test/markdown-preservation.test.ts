import { describe, expect, it } from "vitest";

import {
  parseMarkdownForPreservation,
  validateMarkdownPreservation,
} from "../src/markdown-preservation/index";

const hotelDescriptionJson = String.raw`"\n#### Rooms  \nMake yourself at home in one of the 220 guestrooms. Complimentary wireless internet access keeps you connected, and cable programming is available for your entertainment. Bathrooms with bathtubs or showers are provided. Conveniences include phones, as well as desks and irons/ironing boards.\n\n#### Facilities  \nMake use of convenient amenities, which include complimentary wireless internet access and a banquet hall.\n\n#### Dining  \nYou can enjoy a meal at The Social Bar & Bistro serving the guests of Quality Hotel Lulea, or stop in at the snack bar/deli. Wrap up your day with a drink at the bar/lounge. A complimentary buffet breakfast is served on weekdays from 6:30 AM to 9:00 AM."`;

describe("parseMarkdownForPreservation", () => {
  it("parses JSON-string Markdown with escaped newlines from hotel descriptions", () => {
    const result = parseMarkdownForPreservation(hotelDescriptionJson);

    expect(result.inputFormat).toBe("json-string");
    expect(result.markdown.startsWith("\n#### Rooms")).toBe(true);
    expect(
      result.contract.blocks
        .filter((block) => block.signature === "heading(depth=4)")
        .map((block) => block.path),
    ).toEqual(["$/heading[0]", "$/heading[2]", "$/heading[4]"]);
    expect(result.contract.blocks.map((block) => block.signature)).toEqual([
      "heading(depth=4)",
      "paragraph",
      "heading(depth=4)",
      "paragraph",
      "heading(depth=4)",
      "paragraph",
    ]);
    expect(
      result.contract.escapeSequences.filter((escape) => escape.kind === "newline"),
    ).toHaveLength(8);
  });

  it("decodes JSON escape characters before parsing Markdown", () => {
    const result = parseMarkdownForPreservation(
      String.raw`"First line\n\tTabbed line\\suffix\u00A0"`,
    );

    expect(result.markdown).toBe("First line\n\tTabbed line\\suffix\u00A0");
    expect(result.contract.escapeSequences.map((escape) => escape.kind)).toEqual([
      "newline",
      "tab",
      "backslash",
      "unicode",
    ]);
  });
});

describe("validateMarkdownPreservation", () => {
  it("allows markdown link body text to be translated while preserving the destination", () => {
    const result = validateMarkdownPreservation(
      "Read [the cancellation policy](/policies/cancellation) before booking.",
      "Avant de réserver, lisez [la politique d’annulation](/policies/cancellation).",
    );

    expect(result.isValid).toBe(true);
  });

  it("rejects translated markdown link destinations even when the body text is valid", () => {
    const result = validateMarkdownPreservation(
      "Read [the cancellation policy](/policies/cancellation) before booking.",
      "Avant de réserver, lisez [la politique d’annulation](/politiques/annulation).",
    );

    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "protected_nodes_changed",
        missingNodes: ["link|url=/policies/cancellation|title=|ancestors="],
        extraNodes: ["link|url=/politiques/annulation|title=|ancestors="],
      }),
    );
  });

  it("allows translated text and inline node reordering inside the same block", () => {
    const result = validateMarkdownPreservation(
      "Read [the terms](/terms) before running `npm install`.",
      "Avant d’exécuter `npm install`, lisez [les conditions](/terms).",
    );

    expect(result.isValid).toBe(true);
  });

  it("rejects changed link destinations", () => {
    const result = validateMarkdownPreservation(
      "Read [the docs](/docs).",
      "Lisez [la documentation](/help).",
    );

    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "protected_nodes_changed",
        missingNodes: ["link|url=/docs|title=|ancestors="],
        extraNodes: ["link|url=/help|title=|ancestors="],
      }),
    );
  });

  it("rejects translated inline code", () => {
    const result = validateMarkdownPreservation(
      "Run `npm install` before continuing.",
      "Exécutez `npm installer` avant de continuer.",
    );

    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "protected_nodes_changed",
        missingNodes: ["inlineCode|value=npm install|ancestors="],
        extraNodes: ["inlineCode|value=npm installer|ancestors="],
      }),
    );
  });

  it("rejects moved protected nodes across block boundaries", () => {
    const result = validateMarkdownPreservation(
      "- Click [billing](/billing).\n- Contact support.",
      "- Cliquez sur la facturation.\n- Contactez [l’assistance](/billing).",
    );

    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "protected_nodes_changed",
        path: "$/list[0]/listItem[0]/paragraph[0]",
        missingNodes: ["link|url=/billing|title=|ancestors="],
      }),
    );
  });

  it("rejects changed JSON escape inventory", () => {
    const result = validateMarkdownPreservation(
      String.raw`"Line one\n\tLine two"`,
      String.raw`"Line one\nLine two"`,
    );

    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "escape_sequences_changed",
        sourceEscapes: ["\\n", "\\t"],
        targetEscapes: ["\\n"],
      }),
    );
  });
});
