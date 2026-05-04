# ICU Syntax Preservation

Checks that translated ICU MessageFormat strings preserve the source message's ICU syntax.

The check uses `@formatjs/icu-messageformat-parser` to parse source and target messages, then adds stricter translation QA checks:

- `plural` and `selectordinal` selectors must be ICU plural selectors: `zero`, `one`, `two`, `few`, `many`, `other`, or canonical exact selectors like `=0`.
- `select` selector keys must match the source message exactly.
- FormatJS structural equality is still used for argument names and argument types.

## API

```ts
import { validateIcuSyntaxPreservation } from "translation-eval";

const result = validateIcuSyntaxPreservation(
  "{count, plural, one {# file} other {# files}}",
  "{count, plural, un {# fichier} other {# fichiers}}",
);

console.log(result.isValid); // false
console.log(result.issues);
```

## CLI

Run the proof of concept against `translation-data/cp-static-translations.json`:

```sh
bun i18n:icu-syntax-preservation
```

Run plural selector validation only against extracted target strings:

```sh
bun i18n:icu-syntax-preservation translation-data/extracted-translations.json
```
