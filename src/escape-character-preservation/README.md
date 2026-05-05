# Escape Character Preservation

Checks that translated strings preserve the source string's escape sequences.

The check scans string content for escapes such as `\n`, `\t`, `\\`, and `\u00A0`, then compares source and target in order. Translated text can change, but the same escape sequences must remain present in the same sequence.

Escaped quotes (`\"`) are intentionally ignored because translations often replace ASCII quotes with locale-appropriate punctuation such as `« ... »` or `„...“`.

This check assumes callers pass the string value to validate. It does not parse JSON objects or recover raw JSON string literals.

## API

```ts
import { collectEscapeSequences, validateEscapeCharacterPreservation } from "translation-eval";

const escapes = collectEscapeSequences(String.raw`Line one\n\tLine two`);

console.log(escapes.map((escape) => escape.kind)); // ["newline", "tab"]

const result = validateEscapeCharacterPreservation(
  String.raw`Line one\n\tLine two`,
  String.raw`Ligne un\n\tLigne deux`,
);

console.log(result); // []
```

Changed escape inventories are reported with the raw source and target escapes:

```ts
const issues = validateEscapeCharacterPreservation(
  String.raw`Line one\n\tLine two`,
  String.raw`Ligne un\nLigne deux`,
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
