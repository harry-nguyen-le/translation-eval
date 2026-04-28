# Markdown Preservation

Checks that translated Markdown preserves protected structure and destinations.

The check parses Markdown before and after translation. It accepts runtime Markdown strings and JSON string literals, so raw escaped values such as `"\n#### Rooms  \n..."` are decoded before Markdown parsing while the raw escape inventory is still recorded.

`master-translations.json` is the static frontend string set and is not expected to contain Markdown. Use `dummy-markdown.json` for Markdown preservation evaluation.

For embedded Markdown links, the visible label is translatable but the destination is protected. For example, `[the docs](/docs)` may become `[la documentation](/docs)`, but not `[la documentation](/aide)`.

## API

```ts
import { parseMarkdownForPreservation, validateMarkdownPreservation } from "translation-eval";

const parsed = parseMarkdownForPreservation(String.raw`"\n#### Rooms  \nMake yourself at home."`);

console.log(parsed.contract.blocks);

const result = validateMarkdownPreservation(
  "Read [the docs](/docs) before running `npm install`.",
  "Avant d'executer `npm install`, lisez [la documentation](/docs).",
);

console.log(result.isValid); // true

const invalidLink = validateMarkdownPreservation(
  "Read [the cancellation policy](/policies/cancellation) before booking.",
  "Avant de reserver, lisez [la politique d'annulation](/politiques/annulation).",
);

console.log(invalidLink.isValid); // false
console.log(invalidLink.issues);
```

## CLI

Run the proof of concept against `dummy-markdown.json`:

```sh
bun i18n:markdown-preservation
```
