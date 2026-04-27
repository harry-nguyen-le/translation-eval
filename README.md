# translation-eval

ICU-aware mixed-script detection for translation QA.

The detector parses ICU MessageFormat enough to scan only user-visible literal
text. Placeholders, plural/select syntax, selector keys, number/date formats,
and rich-text tag names are ignored.

Expected scripts are derived from the target locale:

1. Use an explicit BCP-47 script subtag when present, such as `sr-Latn`.
2. Otherwise use `Intl.Locale(locale).maximize().script`.
3. Expand composite script subtags like `Jpan`, `Kore`, `Hans`, and `Hant`.
4. Compare visible literal characters with Unicode `Script_Extensions`.
5. Treat `Common` and `Inherited` characters as neutral.

Exact allowed terms can be supplied for product names, brands, glossary terms,
or other project-specific spans. Allowed terms are exact span matches, so an
allowlist entry such as `PayPal` will not hide a spoofed `PаyPal` containing a
Cyrillic `а`.

## Usage

```js
import { checkIcuTranslationForMixedScripts } from "translation-eval";

const result = checkIcuTranslationForMixedScripts("{userName} reset your Pаypal password", "en");

console.log(result.hasUnexpectedScript);
console.log(result.issues);
```

With exact exceptions:

```js
const result = checkIcuTranslationForMixedScripts("PayPalからメールを送信しました", "ja", {
  allowedTerms: ["PayPal"],
});
```

Run tests:

```sh
bun run test
```

Run typechecking:

```sh
bun run typecheck
```

Run the mixed-script detector against `master-translations.json`:

```sh
bun i18n:mixed-script-detection
```

Run the ICU syntax preservation proof of concept against `master-translations.json`:

```sh
bun i18n:icu-syntax-preservation
```

## ICU Syntax Preservation

The ICU syntax preservation proof of concept uses `@formatjs/icu-messageformat-parser`
to parse source and target messages, then adds stricter translation QA checks:

- `plural` and `selectordinal` selectors must be ICU plural selectors:
  `zero`, `one`, `two`, `few`, `many`, `other`, or canonical exact selectors like `=0`.
- `select` selector keys must match the source message exactly.
- FormatJS structural equality is still used for argument names and argument types.

```ts
import { validateIcuSyntaxPreservation } from "translation-eval";

const result = validateIcuSyntaxPreservation(
  "{count, plural, one {# file} other {# files}}",
  "{count, plural, un {# fichier} other {# fichiers}}",
);

console.log(result.isValid); // false
console.log(result.issues);
```
