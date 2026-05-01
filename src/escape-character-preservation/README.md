# Escape Character Preservation

Checks that translated JSON string literals preserve the source string's raw escape sequences.

The check scans raw JSON string text for escapes such as `\n`, `\t`, `\\`, and `\u00A0`, then compares source and target as a multiset. Translated text can change and escapes can move, but the same escape sequences must remain present.

Escaped quotes (`\"`) are intentionally ignored because translations often replace ASCII quotes with locale-appropriate punctuation such as `« ... »` or `„...“`.

This is useful before or alongside content-specific checks such as Markdown preservation, where `"\n#### Rooms"` needs to decode correctly while still preserving the original newline escape inventory.

## API

```ts
import { collectJsonStringEscapes, validateEscapeCharacterPreservation } from "translation-eval";

const escapes = collectJsonStringEscapes(String.raw`"Line one\n\tLine two"`);

console.log(escapes.map((escape) => escape.kind)); // ["newline", "tab"]

const result = validateEscapeCharacterPreservation(
  String.raw`"Line one\n\tLine two"`,
  String.raw`"Ligne un\tLigne deux\n"`,
);

console.log(result); // []
```

Changed escape inventories are reported with the raw source and target escapes:

```ts
const issues = validateEscapeCharacterPreservation(
  String.raw`"Line one\n\tLine two"`,
  String.raw`"Ligne un\nLigne deux"`,
);

console.log(issues);
// [
//   {
//     code: "escape_sequences_changed",
//     sourceEscapes: ["\\n", "\\t"],
//     targetEscapes: ["\\n"],
//   },
// ]
```

## CLI

Run the proof of concept against `translation-data/cp-static-translations.json`:

```sh
bun i18n:escape-character-preservation
```
