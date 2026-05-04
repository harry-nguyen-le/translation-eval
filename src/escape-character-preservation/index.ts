export type EscapeCharacterKind =
  | "backspace"
  | "backslash"
  | "carriage-return"
  | "form-feed"
  | "newline"
  | "slash"
  | "tab"
  | "unicode";

export type EscapeCharacterSequence = {
  raw: string;
  kind: EscapeCharacterKind;
  index: number;
};

export type EscapeCharacterPreservationIssue = {
  code: "escape_sequences_changed";
  sourceEscapes: string[];
  targetEscapes: string[];
};

const ESCAPE_KINDS: Partial<Record<string, EscapeCharacterKind>> = {
  "\\": "backslash",
  "/": "slash",
  b: "backspace",
  f: "form-feed",
  n: "newline",
  r: "carriage-return",
  t: "tab",
  u: "unicode",
};

export function collectJsonStringEscapes(input: string): EscapeCharacterSequence[] {
  const escapePattern = /\\(?:[\\/bfnrt]|u[0-9a-fA-F]{4})/g;
  return Array.from(input.matchAll(escapePattern), (match) => ({
    raw: match[0],
    kind: classifyJsonEscape(match[0]),
    index: match.index,
  }));
}

export function classifyJsonEscape(raw: string): EscapeCharacterKind {
  const kind = ESCAPE_KINDS[raw[1] ?? ""];

  if (!kind) {
    throw new Error(`Unsupported JSON escape sequence: ${raw}`);
  }

  return kind;
}

export function compareEscapeCharacterSequences(
  source: readonly EscapeCharacterSequence[],
  target: readonly EscapeCharacterSequence[],
): EscapeCharacterPreservationIssue[] {
  const sourceEscapes = source.map((escape) => escape.raw);
  const targetEscapes = target.map((escape) => escape.raw);

  if (!sameMultiset(sourceEscapes, targetEscapes)) {
    return [
      {
        code: "escape_sequences_changed",
        sourceEscapes: sortStrings(sourceEscapes),
        targetEscapes: sortStrings(targetEscapes),
      },
    ];
  }

  return [];
}

export function validateEscapeCharacterPreservation(
  sourceInput: string,
  targetInput: string,
): EscapeCharacterPreservationIssue[] {
  return compareEscapeCharacterSequences(
    collectJsonStringEscapes(sourceInput),
    collectJsonStringEscapes(targetInput),
  );
}

export function extractRawJsonStringFieldsByObjectKey<Field extends string>(
  rawJson: string,
  fieldNames: readonly Field[],
): Map<string, Partial<Record<Field, string>>> {
  const entries = new Map<string, Partial<Record<Field, string>>>();
  const fieldNameSet = new Set<string>(fieldNames);
  let index = skipWhitespace(rawJson, 0);

  if (rawJson[index] !== "{") {
    return entries;
  }

  index += 1;

  while (index < rawJson.length) {
    index = skipWhitespace(rawJson, index);

    if (rawJson[index] === "}") {
      return entries;
    }

    const id = readJsonStringLiteral(rawJson, index);
    index = skipWhitespace(rawJson, id.end);

    if (rawJson[index] !== ":") {
      return entries;
    }

    index = skipWhitespace(rawJson, index + 1);

    if (rawJson[index] !== "{") {
      index = skipJsonValue(rawJson, index);
    } else {
      const entryEnd = findMatchingObjectEnd(rawJson, index);
      entries.set(
        id.value,
        extractRawJsonObjectStringFields(rawJson, index, entryEnd, fieldNameSet),
      );
      index = entryEnd + 1;
    }

    index = skipWhitespace(rawJson, index);

    if (rawJson[index] === ",") {
      index += 1;
    }
  }

  return entries;
}

function sameArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameMultiset(left: readonly string[], right: readonly string[]): boolean {
  return sameArray(sortStrings(left), sortStrings(right));
}

function sortStrings(values: readonly string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function extractRawJsonObjectStringFields<Field extends string>(
  rawJson: string,
  start: number,
  end: number,
  fieldNames: ReadonlySet<string>,
): Partial<Record<Field, string>> {
  const fields: Partial<Record<Field, string>> = {};
  let index = start + 1;

  while (index < end) {
    index = skipWhitespace(rawJson, index);

    if (rawJson[index] === "}") {
      return fields;
    }

    const key = readJsonStringLiteral(rawJson, index);
    index = skipWhitespace(rawJson, key.end);

    if (rawJson[index] !== ":") {
      return fields;
    }

    index = skipWhitespace(rawJson, index + 1);

    if (fieldNames.has(key.value) && rawJson[index] === '"') {
      const value = readJsonStringLiteral(rawJson, index);
      fields[key.value as Field] = value.raw;
      index = value.end;
    } else {
      index = skipJsonValue(rawJson, index);
    }

    index = skipWhitespace(rawJson, index);

    if (rawJson[index] === ",") {
      index += 1;
    }
  }

  return fields;
}

function readJsonStringLiteral(
  rawJson: string,
  start: number,
): { raw: string; value: string; end: number } {
  if (rawJson[start] !== '"') {
    throw new Error(`Expected JSON string at index ${start}`);
  }

  let index = start + 1;

  while (index < rawJson.length) {
    const char = rawJson[index];

    if (char === "\\") {
      index += 2;
      continue;
    }

    if (char === '"') {
      const raw = rawJson.slice(start, index + 1);

      return {
        raw,
        value: JSON.parse(raw) as string,
        end: index + 1,
      };
    }

    index += 1;
  }

  throw new Error(`Unterminated JSON string at index ${start}`);
}

function findMatchingObjectEnd(rawJson: string, start: number): number {
  return findMatchingDelimitedEnd(rawJson, start, "{", "}", "object");
}

function skipJsonValue(rawJson: string, start: number): number {
  const index = skipWhitespace(rawJson, start);
  const char = rawJson[index];

  if (char === '"') {
    return readJsonStringLiteral(rawJson, index).end;
  }

  if (char === "{") {
    return findMatchingObjectEnd(rawJson, index) + 1;
  }

  if (char === "[") {
    return findMatchingArrayEnd(rawJson, index) + 1;
  }

  let cursor = index;

  while (cursor < rawJson.length && rawJson[cursor] !== "," && rawJson[cursor] !== "}") {
    cursor += 1;
  }

  return cursor;
}

function findMatchingArrayEnd(rawJson: string, start: number): number {
  return findMatchingDelimitedEnd(rawJson, start, "[", "]", "array");
}

function findMatchingDelimitedEnd(
  rawJson: string,
  start: number,
  open: string,
  close: string,
  label: "array" | "object",
): number {
  let index = start;
  let depth = 0;

  while (index < rawJson.length) {
    const char = rawJson[index];

    if (char === '"') {
      index = readJsonStringLiteral(rawJson, index).end;
      continue;
    }

    if (char === open) {
      depth += 1;
    } else if (char === close) {
      depth -= 1;

      if (depth === 0) {
        return index;
      }
    }

    index += 1;
  }

  throw new Error(`Unterminated JSON ${label} at index ${start}`);
}

function skipWhitespace(rawJson: string, start: number): number {
  let index = start;

  while (index < rawJson.length && /\s/u.test(rawJson[index])) {
    index += 1;
  }

  return index;
}
