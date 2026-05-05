# Markdown Validation

Validates translated Markdown by parsing it with `mdast-util-from-markdown`.

When source content is available, it compares source and target Markdown structure:

- heading hierarchy, as the sequence of heading depths
- list structure, as list count, nesting depth, ordered/unordered type, and item counts

When source content is not available, such as `translation-data/extracted-translations.json`, the CLI can only parse-check the target strings.

## API

```ts
import { parseMarkdownForValidation, validateMarkdownPreservation } from "translation-eval";

const parsed = parseMarkdownForValidation("\n#### Rooms  \nMake yourself at home.");

console.log(parsed.ast.children);

const result = validateMarkdownPreservation(
  "## Cancellation\n### Refunds",
  "## Annulation\n### Remboursements",
);

console.log(result.isValid); // true
```

## CLI

Run against `dummy-markdown.json`:

```sh
bun i18n:markdown-preservation
```

Run against extracted translations:

```sh
bun i18n:markdown-preservation translation-data/extracted-translations.json
```
