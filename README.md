# translation-eval

ICU-aware translation QA utilities. The ultimate goal is for these checks to be integrated into `svc-translation`

This package contains deterministic validation checks for translated UI strings:

- [Mixed script detection](src/mixed-script-detection/README.md) detects unexpected Unicode scripts in user-visible ICU text.
- [ICU syntax preservation](src/icu-syntax-preservation/README.md) checks that translated ICU messages preserve source syntax and selector contracts.
- [Markdown preservation](src/markdown-preservation/README.md) checks that translated Markdown preserves protected structure and destinations.

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

Run the mixed-script detector against `master-translations.json`:

```sh
bun i18n:mixed-script-detection
```

Run the ICU syntax preservation proof of concept against `master-translations.json`:

```sh
bun i18n:icu-syntax-preservation
```

Run the Markdown preservation proof of concept against `dummy-markdown.json`:

```sh
bun i18n:markdown-preservation
```
