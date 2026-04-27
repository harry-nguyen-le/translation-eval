const NEUTRAL_SCRIPT_PATTERN = /^[\p{Script=Common}\p{Script=Inherited}]$/u;
const RICH_TEXT_TAG_PATTERN = /<\/?[A-Za-z][A-Za-z0-9_.-]*\s*\/?>/g;

type Range = [start: number, end: number];
type ComplexArgumentType = "plural" | "select" | "selectordinal";

export type VisibleSegment = {
  text: string;
  path: string;
  start: number;
  end: number;
};

export type DetectedScript =
  | (typeof SCRIPT_DETECTION_ORDER)[number][1]
  | "Neutral"
  | "Unknown";

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
  additionalAllowedScripts?: Iterable<string>;
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

const SCRIPT_SUBTAG_EXPANSIONS: Readonly<Record<string, readonly string[]>> =
  Object.freeze({
    Hans: ["Hani"],
    Hant: ["Hani"],
    Jpan: ["Hani", "Hira", "Kana"],
    Kore: ["Hang", "Hani"],
    Hanb: ["Hani", "Bopo"],
    Hrkt: ["Hira", "Kana"],
    Latf: ["Latn"],
    Latg: ["Latn"],
    Cyrs: ["Cyrl"],
    Aran: ["Arab"]
  });

const SCRIPT_DETECTION_ORDER = [
  ["Latn", "Latin"],
  ["Cyrl", "Cyrillic"],
  ["Grek", "Greek"],
  ["Arab", "Arabic"],
  ["Hebr", "Hebrew"],
  ["Deva", "Devanagari"],
  ["Beng", "Bengali"],
  ["Guru", "Gurmukhi"],
  ["Gujr", "Gujarati"],
  ["Orya", "Oriya"],
  ["Taml", "Tamil"],
  ["Telu", "Telugu"],
  ["Knda", "Kannada"],
  ["Mlym", "Malayalam"],
  ["Sinh", "Sinhala"],
  ["Hani", "Han"],
  ["Hira", "Hiragana"],
  ["Kana", "Katakana"],
  ["Hang", "Hangul"],
  ["Bopo", "Bopomofo"],
  ["Thai", "Thai"],
  ["Laoo", "Lao"],
  ["Khmr", "Khmer"],
  ["Mymr", "Myanmar"],
  ["Armn", "Armenian"],
  ["Geor", "Georgian"],
  ["Ethi", "Ethiopic"],
  ["Thaa", "Thaana"],
  ["Tibt", "Tibetan"]
] as const;

const COMPLEX_ARGUMENT_TYPES = new Set<string>([
  "plural",
  "select",
  "selectordinal"
]);

const scriptPatternCache = new Map<string, RegExp>();

export function expectedUnicodeScriptsForLocale(locale: string): Set<string> {
  const parsedLocale = new Intl.Locale(locale);
  const script = parsedLocale.script ?? parsedLocale.maximize().script;

  if (!script) {
    return new Set();
  }

  const expandedScripts = SCRIPT_SUBTAG_EXPANSIONS[script] ?? [script];
  return new Set(expandedScripts);
}

export function extractVisibleSegments(message: string): VisibleSegment[] {
  if (typeof message !== "string") {
    throw new TypeError("message must be a string");
  }

  const segments: VisibleSegment[] = [];
  walkMessage(message, 0, message.length, "$", segments);
  return segments;
}

export function checkIcuTranslationForMixedScripts(
  message: string,
  targetLocale: string,
  options: MixedScriptCheckOptions = {}
): MixedScriptCheckResult {
  const expectedScripts = expectedUnicodeScriptsForLocale(targetLocale);

  for (const script of options.additionalAllowedScripts ?? []) {
    expectedScripts.add(script);
  }

  if (expectedScripts.size === 0) {
    throw new Error(`No expected scripts could be derived for locale: ${targetLocale}`);
  }

  const visibleSegments = extractVisibleSegments(message);
  const issues = visibleSegments.flatMap((segment) =>
    checkSegment(segment, expectedScripts, options)
  );

  return {
    targetLocale,
    expectedScripts: [...expectedScripts],
    visibleSegments,
    hasUnexpectedScript: issues.length > 0,
    issues
  };
}

export function isNeutralCharacter(char: string): boolean {
  return NEUTRAL_SCRIPT_PATTERN.test(char);
}

export function charMatchesScript(char: string, script: string): boolean {
  return scriptPattern(script).test(char);
}

export function detectedScriptForCharacter(char: string): DetectedScript {
  if (isNeutralCharacter(char)) {
    return "Neutral";
  }

  for (const [script, name] of SCRIPT_DETECTION_ORDER) {
    if (charMatchesScript(char, script)) {
      return name;
    }
  }

  return "Unknown";
}

function checkSegment(
  segment: VisibleSegment,
  expectedScripts: ReadonlySet<string>,
  options: MixedScriptCheckOptions
): ScriptIssue[] {
  const text = segment.text.normalize("NFC");
  const allowedRanges = buildAllowedRanges(text, options);
  const issues: ScriptIssue[] = [];

  let index = 0;

  for (const char of text) {
    if (
      !isIndexAllowed(index, allowedRanges) &&
      !isNeutralCharacter(char) &&
      !matchesAnyExpectedScript(char, expectedScripts)
    ) {
      issues.push({
        char,
        script: detectedScriptForCharacter(char),
        indexInSegment: index,
        indexInMessage: segment.start + index,
        segment: text,
        path: segment.path,
        expectedScripts: [...expectedScripts]
      });
    }

    index += char.length;
  }

  return issues;
}

function matchesAnyExpectedScript(
  char: string,
  expectedScripts: ReadonlySet<string>
): boolean {
  for (const script of expectedScripts) {
    if (charMatchesScript(char, script)) {
      return true;
    }
  }

  return false;
}

function scriptPattern(script: string): RegExp {
  if (!/^[A-Za-z_]+$/.test(script)) {
    throw new Error(`Invalid Unicode script alias: ${script}`);
  }

  let pattern = scriptPatternCache.get(script);

  if (!pattern) {
    pattern = new RegExp(`^\\p{Script_Extensions=${script}}$`, "u");
    scriptPatternCache.set(script, pattern);
  }

  return pattern;
}

function buildAllowedRanges(
  text: string,
  options: MixedScriptCheckOptions
): Range[] {
  const ranges: Range[] = [];

  for (const term of options.allowedTerms ?? []) {
    const normalizedTerm = term.normalize("NFC");

    if (normalizedTerm.length === 0) {
      continue;
    }

    let index = text.indexOf(normalizedTerm);

    while (index !== -1) {
      ranges.push([index, index + normalizedTerm.length]);
      index = text.indexOf(normalizedTerm, index + normalizedTerm.length);
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

function walkMessage(
  message: string,
  start: number,
  end: number,
  path: string,
  segments: VisibleSegment[]
): void {
  let index = start;
  let literal = "";
  let literalStart = start;

  const appendLiteral = (text: string, position: number): void => {
    if (literal.length === 0) {
      literalStart = position;
    }

    literal += text;
  };

  const flushLiteral = (position: number): void => {
    pushLiteralSegment(segments, literal, path, literalStart, position);
    literal = "";
    literalStart = position;
  };

  while (index < end) {
    const char = message[index];

    if (char === "'") {
      const quoted = readApostropheLiteral(message, index, end);
      appendLiteral(quoted.text, index);
      index = quoted.nextIndex;
      continue;
    }

    if (char === "{") {
      flushLiteral(index);
      index = walkArgument(message, index, end, path, segments);
      literalStart = index;
      continue;
    }

    appendLiteral(char, index);
    index += 1;
  }

  flushLiteral(end);
}

function pushLiteralSegment(
  segments: VisibleSegment[],
  rawText: string,
  path: string,
  start: number,
  end: number
): void {
  const text = rawText.replace(RICH_TEXT_TAG_PATTERN, "");

  if (text.trim().length === 0) {
    return;
  }

  segments.push({
    text,
    path,
    start,
    end
  });
}

function walkArgument(
  message: string,
  openIndex: number,
  end: number,
  path: string,
  segments: VisibleSegment[]
): number {
  const closeIndex = findMatchingBrace(message, openIndex, end);

  if (closeIndex === -1) {
    throw new SyntaxError(`Unmatched ICU argument brace at index ${openIndex}`);
  }

  const contentStart = openIndex + 1;
  const contentEnd = closeIndex;
  const firstComma = findTopLevelComma(message, contentStart, contentEnd);

  if (firstComma === -1) {
    return closeIndex + 1;
  }

  const argumentName = message.slice(contentStart, firstComma).trim();
  const secondComma = findTopLevelComma(message, firstComma + 1, contentEnd);
  const typeEnd = secondComma === -1 ? contentEnd : secondComma;
  const argumentType = message.slice(firstComma + 1, typeEnd).trim();

  if (!isComplexArgumentType(argumentType)) {
    return closeIndex + 1;
  }

  if (secondComma === -1) {
    throw new SyntaxError(
      `Missing ICU options for ${argumentType} argument at index ${openIndex}`
    );
  }

  walkOptions(
    message,
    secondComma + 1,
    contentEnd,
    argumentName,
    argumentType,
    path,
    segments
  );

  return closeIndex + 1;
}

function isComplexArgumentType(type: string): type is ComplexArgumentType {
  return COMPLEX_ARGUMENT_TYPES.has(type);
}

function walkOptions(
  message: string,
  start: number,
  end: number,
  argumentName: string,
  argumentType: ComplexArgumentType,
  path: string,
  segments: VisibleSegment[]
): void {
  let index = start;
  let sawOther = false;

  while (index < end) {
    index = skipWhitespace(message, index, end);

    if (index >= end) {
      break;
    }

    if (argumentType !== "select" && message.startsWith("offset:", index)) {
      index = skipToken(message, index, end);
      continue;
    }

    const selectorStart = index;
    index = readSelector(message, index, end);
    const selector = message.slice(selectorStart, index).trim();

    if (!selector) {
      throw new SyntaxError(`Missing ICU selector at index ${selectorStart}`);
    }

    sawOther ||= selector === "other";
    index = skipWhitespace(message, index, end);

    if (message[index] !== "{") {
      throw new SyntaxError(`Missing ICU option body for selector "${selector}"`);
    }

    const bodyOpen = index;
    const bodyClose = findMatchingBrace(message, bodyOpen, end);

    if (bodyClose === -1) {
      throw new SyntaxError(`Unmatched ICU option body for selector "${selector}"`);
    }

    walkMessage(
      message,
      bodyOpen + 1,
      bodyClose,
      `${path}/{${argumentName}, ${argumentType}, ${selector}}`,
      segments
    );

    index = bodyClose + 1;
  }

  if (!sawOther) {
    throw new SyntaxError(
      `ICU ${argumentType} argument "${argumentName}" is missing an "other" option`
    );
  }
}

function findTopLevelComma(message: string, start: number, end: number): number {
  let depth = 0;
  let index = start;

  while (index < end) {
    const char = message[index];

    if (char === "'") {
      index = skipApostropheLiteral(message, index, end);
      continue;
    }

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
    } else if (char === "," && depth === 0) {
      return index;
    }

    index += 1;
  }

  return -1;
}

function findMatchingBrace(message: string, openIndex: number, end: number): number {
  let depth = 0;
  let index = openIndex;

  while (index < end) {
    const char = message[index];

    if (char === "'") {
      index = skipApostropheLiteral(message, index, end);
      continue;
    }

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;

      if (depth === 0) {
        return index;
      }
    }

    index += 1;
  }

  return -1;
}

function readApostropheLiteral(
  message: string,
  index: number,
  end: number
): { text: string; nextIndex: number } {
  if (message[index + 1] === "'") {
    return {
      text: "'",
      nextIndex: index + 2
    };
  }

  if (!isIcuSyntaxCharacter(message[index + 1])) {
    return {
      text: "'",
      nextIndex: index + 1
    };
  }

  let cursor = index + 1;
  let text = "";

  while (cursor < end) {
    if (message[cursor] === "'") {
      if (message[cursor + 1] === "'") {
        text += "'";
        cursor += 2;
        continue;
      }

      return {
        text,
        nextIndex: cursor + 1
      };
    }

    text += message[cursor];
    cursor += 1;
  }

  return {
    text,
    nextIndex: cursor
  };
}

function skipApostropheLiteral(
  message: string,
  index: number,
  end: number
): number {
  return readApostropheLiteral(message, index, end).nextIndex;
}

function isIcuSyntaxCharacter(char: string | undefined): boolean {
  return char === "{" || char === "}" || char === "#" || char === "<" || char === ">";
}

function skipWhitespace(message: string, start: number, end: number): number {
  let index = start;

  while (index < end && /\s/u.test(message[index])) {
    index += 1;
  }

  return index;
}

function skipToken(message: string, start: number, end: number): number {
  let index = start;

  while (index < end && !/\s/u.test(message[index])) {
    index += 1;
  }

  return index;
}

function readSelector(message: string, start: number, end: number): number {
  let index = start;

  while (index < end && !/\s/u.test(message[index]) && message[index] !== "{") {
    index += 1;
  }

  return index;
}
