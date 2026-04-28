# Mixed Script Detection

Detects unexpected Unicode scripts in translated ICU MessageFormat strings.

The detector parses ICU MessageFormat enough to scan only user-visible literal text. Placeholders, plural/select syntax, selector keys, number/date formats, and rich-text tag names are ignored.

Expected scripts are derived from the target locale:

1. Use an explicit BCP-47 script subtag when present, such as `sr-Latn`.
2. Otherwise use `Intl.Locale(locale).maximize().script`.
3. Expand composite script subtags like `Jpan`, `Kore`, `Hans`, and `Hant`.
4. Compare visible literal characters with Unicode `Script_Extensions`.
5. Treat `Common` and `Inherited` characters as neutral.

Exact allowed terms can be supplied for product names, brands, glossary terms, or other project-specific spans. Allowed terms are exact span matches, so an allowlist entry such as `PayPal` will not hide a spoofed `PаyPal` containing a Cyrillic `а`.

## API

```ts
import { checkIcuTranslationForMixedScripts } from "translation-eval";

const result = checkIcuTranslationForMixedScripts("{userName} reset your Pаypal password", "en");

console.log(result.hasUnexpectedScript);
console.log(result.issues);
```

With exact exceptions:

```ts
import { checkIcuTranslationForMixedScripts } from "translation-eval";

const result = checkIcuTranslationForMixedScripts("PayPalからメールを送信しました", "ja", {
  allowedTerms: ["PayPal"],
});

console.log(result.hasUnexpectedScript);
```

## CLI

Run the proof of concept against `master-translations.json`:

```sh
bun i18n:mixed-script-detection
```
