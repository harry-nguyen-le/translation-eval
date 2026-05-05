# Mixed Script Detection

Detects non-Latin Unicode characters in translated ICU MessageFormat strings.

The detector parses ICU MessageFormat enough to scan only user-visible literal text. Placeholders, plural/select syntax, selector keys, number/date formats, and rich-text tag names are ignored.

Expected script handling is intentionally narrow:

1. Always allow Latin characters.
2. Compare visible literal characters with Unicode `Script_Extensions=Latn`.
3. Treat `Common` and `Inherited` characters as neutral.
4. Report every other visible character as `NonLatin`.

Exact allowed terms can be supplied for product names, brands, glossary terms, or other project-specific spans. Allowed terms are exact span matches, so an allowlist entry such as `PayPal` will not hide a spoofed `PаyPal` containing a Cyrillic `а`.

## API

```ts
import { checkMixedScripts } from "translation-eval";

const result = checkMixedScripts("{userName} reset your Pаypal password", "en");

console.log(result.hasUnexpectedScript);
console.log(result.issues);
```

With exact exceptions:

```ts
import { checkMixedScripts } from "translation-eval";

const result = checkMixedScripts("Email from PayPal sent", "en", {
  allowedTerms: ["PayPal"],
});

console.log(result.hasUnexpectedScript);
```

For plain text rather than ICU MessageFormat input, pass `inputFormat: "text"`.

## CLI

Run the proof of concept against `translation-data/cp-static-translations.json`:

```sh
bun i18n:mixed-script-detection
```
