# Special Character Preservation

Detects newly introduced invisible or control-like Unicode characters in translated content.

This check is separate from HTML layout preservation. It compares source and target strings as multisets of blocked special code points and reports characters that appear more times in the target than in the source.

French no-break spacing is intentionally allowed:

- `&nbsp;`
- `&#160;`
- `U+00A0`
- `U+202F`

These are commonly introduced before French punctuation and should not fail translation validation.

## API

```ts
import { validateSpecialCharacterPreservation } from "translation-eval";

const result = validateSpecialCharacterPreservation(
  "<p>Hello world</p>",
  "<p>Bonjour le monde\u200B</p>",
);

console.log(result.isValid); // false
console.log(result.issues);
```
