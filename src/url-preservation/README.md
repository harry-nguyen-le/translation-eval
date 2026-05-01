# URL preservation

Checks that URLs in source content are preserved exactly in translated content.

The check extracts plain URLs from source and target strings, then compares them as a multiset so repeated URLs must remain repeated. Translated text can move around the URLs, but URL values must not be translated, omitted, or changed.

```ts
import { validateUrlPreservation } from "translation-eval";

const result = validateUrlPreservation(
  "Read the policy at https://example.com/policies before booking.",
  "Avant de réserver, consultez https://example.com/policies.",
);

console.log(result.isValid); // true
```

Changed URLs are reported as missing source URLs and extra target URLs:

```ts
const result = validateUrlPreservation(
  "Read https://example.com/policies.",
  "Consultez https://example.fr/politiques.",
);

console.log(result.issues);
```

Run the proof of concept against `translation-data/cp-static-translations.json`:

```sh
bun i18n:url-preservation
```
