# Markdown Validation

Validates translated Markdown by parsing it with `mdast-util-from-markdown`.

The check accepts runtime Markdown strings and JSON string literals, so raw escaped values such as `"\n#### Rooms  \n..."` are decoded before Markdown parsing.

When source content is available, it compares source and target Markdown structure:

- heading hierarchy, as the sequence of heading depths
- list structure, as list count, nesting depth, ordered/unordered type, and item counts
- pipe table shape, as table count, row count, and column count

When source content is not available, such as `translation-data/extracted-translations.json`, the CLI can only parse-check the target strings.

## API

```ts
import { parseMarkdownForValidation, validateMarkdownPreservation } from "translation-eval";

const parsed = parseMarkdownForValidation(String.raw`"\n#### Rooms  \nMake yourself at home."`);

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
