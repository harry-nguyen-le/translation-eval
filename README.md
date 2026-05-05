# translation-eval

ICU-aware translation QA utilities. The ultimate goal is for these checks to be integrated into `svc-translation`, modifications will be needed to use existing fields in `svc-translation` request task

This package contains deterministic validation checks for translated UI strings:

- [Mixed script detection](src/mixed-script-detection/README.md) detects unexpected Unicode scripts in user-visible ICU text.
- [Escape character preservation](src/escape-character-preservation/README.md) checks that translated strings preserve escape sequences.
- [HTML layout preservation](src/html-layout-preservation/README.md) checks post-translation HTML/XML-like layout while allowing stylistic inline formatting to change.
- [ICU syntax preservation](src/icu-syntax-preservation/README.md) checks that translated ICU messages preserve source syntax and selector contracts.
- [Markdown validation](src/markdown-preservation/README.md) parses translated Markdown with `mdast-util-from-markdown`.
- [URL preservation](src/url-preservation/README.md) checks that translated content preserves source URLs exactly.

## Usage

Install dependencies:

```sh
bun install
```

Run tests:

```sh
bun run test
```

Run typechecking:

```sh
bun run typecheck
```

Run the mixed-script detector against `translation-data/cp-static-translations.json`:

```sh
bun i18n:mixed-script-detection
```

Run the ICU syntax preservation proof of concept against `translation-data/cp-static-translations.json`:

```sh
bun i18n:icu-syntax-preservation
```

Run ICU plural selector validation against extracted translations:

```sh
bun i18n:icu-syntax-preservation translation-data/extracted-translations.json
```

Run the escape character preservation proof of concept against `translation-data/cp-static-translations.json`:

```sh
bun i18n:escape-character-preservation
```

Run the HTML layout preservation proof of concept against `translation-data/cp-static-translations.json`:

```sh
bun i18n:html-layout-preservation
```

Run Markdown validation against `dummy-markdown.json`:

```sh
bun i18n:markdown-preservation
```

Run Markdown validation against extracted translations:

```sh
bun i18n:markdown-preservation translation-data/extracted-translations.json
```

Run the URL preservation proof of concept against `translation-data/cp-static-translations.json`:

```sh
bun i18n:url-preservation
```
