import { characterEntities } from "character-entities";

const NAMED_REFERENCE_PATTERN = /&([A-Za-z][A-Za-z0-9]+);?/g;
const NUMERIC_REFERENCE_PATTERN = /&#(?:x[0-9a-fA-F]+|\d+);?/g;
const LITERAL_SPECIAL_CHARACTER_PATTERN =
  /[\u00ad\u2000-\u200f\u2028-\u202e\u205f\u2060-\u206f\u3000\ufeff]/g;

export type SpecialCharacterPreservationIssue = {
  code: "special_character_added";
  sourceSpecialCharacters: string[];
  targetSpecialCharacters: string[];
  addedSpecialCharacters: string[];
};

export type SpecialCharacterPreservationResult = {
  isValid: boolean;
  sourceSpecialCharacters: string[];
  targetSpecialCharacters: string[];
  issues: SpecialCharacterPreservationIssue[];
};

export function validateSpecialCharacterPreservation(
  source: string,
  target: string,
): SpecialCharacterPreservationResult {
  const sourceSpecialCharacters = collectSpecialCharacters(source);
  const targetSpecialCharacters = collectSpecialCharacters(target);
  const addedSpecialCharacters = difference(targetSpecialCharacters, sourceSpecialCharacters);
  const issues: SpecialCharacterPreservationIssue[] =
    addedSpecialCharacters.length > 0
      ? [
          {
            code: "special_character_added",
            sourceSpecialCharacters,
            targetSpecialCharacters,
            addedSpecialCharacters,
          },
        ]
      : [];

  return {
    isValid: issues.length === 0,
    sourceSpecialCharacters,
    targetSpecialCharacters,
    issues,
  };
}

function collectSpecialCharacters(input: string): string[] {
  const named = Array.from(input.matchAll(NAMED_REFERENCE_PATTERN), ([, name = ""]) => {
    const value = characterEntities[name] ?? characterEntities[name.toLowerCase()];

    return value
      ? Array.from(value).flatMap((char) => {
          const codePoint = char.codePointAt(0) ?? 0;
          return isBlockedSpecialCodePoint(codePoint) ? [formatCodePoint(codePoint)] : [];
        })
      : [];
  }).flat();
  const numeric = Array.from(input.matchAll(NUMERIC_REFERENCE_PATTERN), ([reference]) => {
    const body = reference.replace(/^&#/, "").replace(/;$/, "");
    const radix = body.toLowerCase().startsWith("x") ? 16 : 10;
    const codePoint = Number.parseInt(radix === 16 ? body.slice(1) : body, radix);

    return Number.isFinite(codePoint) && isBlockedSpecialCodePoint(codePoint)
      ? formatCodePoint(codePoint)
      : undefined;
  }).filter((value): value is string => value !== undefined);
  const literal = Array.from(input.matchAll(LITERAL_SPECIAL_CHARACTER_PATTERN), (match) => {
    const codePoint = match[0].codePointAt(0) ?? 0;
    return isBlockedSpecialCodePoint(codePoint) ? formatCodePoint(codePoint) : undefined;
  }).filter((value): value is string => value !== undefined);

  return [...named, ...numeric, ...literal];
}

function difference(source: readonly string[], target: readonly string[]): string[] {
  const remaining = new Map<string, number>();

  for (const value of target) {
    remaining.set(value, (remaining.get(value) ?? 0) + 1);
  }

  const missing: string[] = [];

  for (const value of source) {
    const count = remaining.get(value) ?? 0;

    if (count > 0) {
      remaining.set(value, count - 1);
      continue;
    }

    missing.push(value);
  }

  return missing;
}

function isBlockedSpecialCodePoint(codePoint: number): boolean {
  return (
    codePoint !== 0x00a0 &&
    codePoint !== 0x202f &&
    (codePoint === 0x00ad ||
      (codePoint >= 0x2000 && codePoint <= 0x200f) ||
      (codePoint >= 0x2028 && codePoint <= 0x202e) ||
      codePoint === 0x205f ||
      (codePoint >= 0x2060 && codePoint <= 0x206f) ||
      codePoint === 0x3000 ||
      codePoint === 0xfeff)
  );
}

function formatCodePoint(codePoint: number): string {
  return `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`;
}
