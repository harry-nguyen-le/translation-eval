# HTML Layout Preservation

Post-translation validation for HTML/XML-like markup where only layout needs to be preserved.

The check is intentionally less strict than full tag preservation:

- block/layout tags must preserve their tag names and nesting
- inline tags such as `a`, `strong`, `em`, `span`, and `b` may move, change, or disappear
- newly introduced special spaces or invisible characters, such as `&nbsp;`, `&#160;`, `U+00A0`, zero-width characters, and bidi controls, are rejected
- malformed raw tags are rejected

This avoids false failures when a formatted English word has no direct translated equivalent, while still catching layout-breaking output.

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
