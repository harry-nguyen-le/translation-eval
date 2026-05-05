export type EscapeCharacterPreservationIssue = {
  code: "escape_sequences_changed";
  sourceEscapes: string[];
  targetEscapes: string[];
};

export function collectEscapeSequences(input: string): string[] {
  const escapePattern = /\\(?:[\\/bfnrt]|u[0-9a-fA-F]{4})/g;
  return Array.from(input.matchAll(escapePattern), (match) => match[0]);
}

export function compareEscapeCharacterSequences(
  sourceEscapes: readonly string[],
  targetEscapes: readonly string[],
): EscapeCharacterPreservationIssue[] {
  if (!sameArray(sourceEscapes, targetEscapes)) {
    return [
      {
        code: "escape_sequences_changed",
        sourceEscapes: [...sourceEscapes],
        targetEscapes: [...targetEscapes],
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
