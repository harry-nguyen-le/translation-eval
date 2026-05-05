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

export function collectEscapeSequences(input: string): EscapeCharacterSequence[] {
  const escapePattern = /\\(?:[\\/bfnrt]|u[0-9a-fA-F]{4})/g;
  return Array.from(input.matchAll(escapePattern), (match) => ({
    raw: match[0],
    kind: classifyEscapeSequence(match[0]),
    index: match.index,
  }));
}

export function classifyEscapeSequence(raw: string): EscapeCharacterKind {
  const kind = ESCAPE_KINDS[raw[1] ?? ""];

  if (!kind) {
    throw new Error(`Unsupported escape sequence: ${raw}`);
  }

  return kind;
}

export function compareEscapeCharacterSequences(
  source: readonly EscapeCharacterSequence[],
  target: readonly EscapeCharacterSequence[],
): EscapeCharacterPreservationIssue[] {
  const sourceEscapes = source.map((escape) => escape.raw);
  const targetEscapes = target.map((escape) => escape.raw);

  if (!sameArray(sourceEscapes, targetEscapes)) {
    return [
      {
        code: "escape_sequences_changed",
        sourceEscapes,
        targetEscapes,
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
    collectEscapeSequences(sourceInput),
    collectEscapeSequences(targetInput),
  );
}

function sameArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
