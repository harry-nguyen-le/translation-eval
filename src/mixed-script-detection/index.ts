import {
  parse,
  TYPE,
  type Location,
  type MessageFormatElement,
  type PluralElement,
  type SelectElement,
} from "@formatjs/icu-messageformat-parser";

const NEUTRAL_SCRIPT_PATTERN = /^[\p{Script=Common}\p{Script=Inherited}]$/u;
const LATIN_SCRIPT_PATTERN = /^\p{Script_Extensions=Latn}$/u;
const EXPECTED_SCRIPTS = ["Latn"];

type Range = [start: number, end: number];

export type VisibleSegment = {
  text: string;
  path: string;
  start: number;
  end: number;
};

export type DetectedScript = "Latin" | "Neutral" | "NonLatin";

export type ScriptIssue = {
  char: string;
  script: DetectedScript;
  indexInSegment: number;
  indexInMessage: number;
  segment: string;
  path: string;
  expectedScripts: string[];
};

export type MixedScriptCheckOptions = {
  allowedPatterns?: Iterable<RegExp>;
  allowedTerms?: Iterable<string>;
};

export type MixedScriptCheckResult = {
  targetLocale: string;
  expectedScripts: string[];
  visibleSegments: VisibleSegment[];
  hasUnexpectedScript: boolean;
  issues: ScriptIssue[];
};

export function expectedUnicodeScriptsForLocale(_locale: string): Set<string> {
  return new Set(EXPECTED_SCRIPTS);
}

export function extractVisibleSegments(message: string): VisibleSegment[] {
  if (typeof message !== "string") {
    throw new TypeError("message must be a string");
  }

  const segments: VisibleSegment[] = [];
  collectVisibleSegments(
    parse(message, { captureLocation: true, requiresOtherClause: true }),
    "$",
    segments,
  );
  return segments;
}

export function checkIcuTranslationForMixedScripts(
  message: string,
  targetLocale: string,
  options: MixedScriptCheckOptions = {},
): MixedScriptCheckResult {
  const visibleSegments = extractVisibleSegments(message);
  const issues = visibleSegments.flatMap((segment) => checkSegment(segment, options));

  return {
    targetLocale,
    expectedScripts: EXPECTED_SCRIPTS,
    visibleSegments,
    hasUnexpectedScript: issues.length > 0,
    issues,
  };
}

export function isNeutralCharacter(char: string): boolean {
  return NEUTRAL_SCRIPT_PATTERN.test(char);
}

export function charMatchesScript(char: string, script: string): boolean {
  return (script === "Latn" || script === "Latin") && LATIN_SCRIPT_PATTERN.test(char);
}

export function detectedScriptForCharacter(char: string): DetectedScript {
  return isNeutralCharacter(char)
    ? "Neutral"
    : charMatchesScript(char, "Latn")
      ? "Latin"
      : "NonLatin";
}

function checkSegment(segment: VisibleSegment, options: MixedScriptCheckOptions): ScriptIssue[] {
  const text = segment.text.normalize("NFC");
  const allowedRanges = buildAllowedRanges(text, options);
  const issues: ScriptIssue[] = [];

  let index = 0;

  for (const char of text) {
    const script = detectedScriptForCharacter(char);

    if (!isIndexAllowed(index, allowedRanges) && script === "NonLatin") {
      issues.push({
        char,
        script,
        indexInSegment: index,
        indexInMessage: segment.start + index,
        segment: text,
        path: segment.path,
        expectedScripts: EXPECTED_SCRIPTS,
      });
    }

    index += char.length;
  }

  return issues;
}

function buildAllowedRanges(text: string, options: MixedScriptCheckOptions): Range[] {
  const ranges: Range[] = [];

  for (const term of options.allowedTerms ?? []) {
    const normalizedTerm = term.normalize("NFC");
    if (normalizedTerm) {
      collectMatches(text, normalizedTerm, (index) =>
        ranges.push([index, index + normalizedTerm.length]),
      );
    }
  }

  for (const pattern of options.allowedPatterns ?? []) {
    const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
    const globalPattern = new RegExp(pattern.source, flags);

    let match: RegExpExecArray | null;
    while ((match = globalPattern.exec(text)) !== null) {
      ranges.push([match.index, match.index + match[0].length]);

      if (match[0].length === 0) {
        globalPattern.lastIndex += 1;
      }
    }
  }

  return mergeRanges(ranges);
}

function collectMatches(text: string, term: string, onMatch: (index: number) => void): void {
  for (
    let index = text.indexOf(term);
    index !== -1;
    index = text.indexOf(term, index + term.length)
  ) {
    onMatch(index);
  }
}

function mergeRanges(ranges: Range[]): Range[] {
  ranges.sort((a, b) => a[0] - b[0]);

  const merged: Range[] = [];

  for (const range of ranges) {
    const previous = merged.at(-1);

    if (previous && range[0] <= previous[1]) {
      previous[1] = Math.max(previous[1], range[1]);
    } else {
      merged.push([...range]);
    }
  }

  return merged;
}

function isIndexAllowed(index: number, ranges: readonly Range[]): boolean {
  return ranges.some(([start, end]) => index >= start && index < end);
}

function collectVisibleSegments(
  ast: readonly MessageFormatElement[],
  path: string,
  segments: VisibleSegment[],
): void {
  for (const element of ast) {
    if (element.type === TYPE.literal) {
      pushSegment(segments, element.value, path, element.location);
    } else if (element.type === TYPE.pound) {
      pushSegment(segments, "#", path, element.location);
    } else if (element.type === TYPE.tag) {
      pushSegment(segments, visibleText(element.children), path, element.location);
    } else if (element.type === TYPE.plural || element.type === TYPE.select) {
      for (const [selector, option] of Object.entries(element.options)) {
        collectVisibleSegments(
          option.value,
          `${path}/{${element.value}, ${optionType(element)}, ${selector}}`,
          segments,
        );
      }
    }
  }
}

function optionType(element: PluralElement | SelectElement): "plural" | "select" | "selectordinal" {
  if (element.type === TYPE.select) {
    return "select";
  }

  return element.pluralType === "ordinal" ? "selectordinal" : "plural";
}

function visibleText(ast: readonly MessageFormatElement[]): string {
  return ast
    .map((element) =>
      element.type === TYPE.literal
        ? element.value
        : element.type === TYPE.pound
          ? "#"
          : element.type === TYPE.tag
            ? visibleText(element.children)
            : "",
    )
    .join("");
}

function pushSegment(
  segments: VisibleSegment[],
  text: string,
  path: string,
  location: Location | undefined,
): void {
  if (text.trim().length === 0 || !location) {
    return;
  }

  const previous = segments.at(-1);
  if (previous?.path === path && previous.end === location.start.offset) {
    previous.text += text;
    previous.end = location.end.offset;
    return;
  }

  segments.push({
    text,
    path,
    start: location.start.offset,
    end: location.end.offset,
  });
}
