# HTML Layout Preservation

Post-translation validation for HTML/XML-like markup where only layout needs to be preserved.

The check is intentionally less strict than full tag preservation:

- block/layout tags must preserve their tag names and nesting
- inline tags such as `a`, `strong`, `em`, `span`, and `b` may move, change, or disappear
- malformed raw tags are rejected

This avoids false failures when a formatted English word has no direct translated equivalent, while still catching layout-breaking output.

Special character detection, such as zero-width characters or bidi controls, is intentionally not part of this check and should live in a separate validator.

## API

```ts
import { validateHtmlLayoutPreservation } from "translation-eval";

const result = validateHtmlLayoutPreservation(
  "<p>Room A <strong>and</strong> Room B</p>",
  "<p>Chambre A et chambre B</p>",
);

console.log(result.isValid); // true
```

## CLI

Run against `translation-data/cp-static-translations.json`:

```sh
bun i18n:html-layout-preservation
```
