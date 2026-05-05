import { parseDocument } from "htmlparser2";
import { isTag, type ChildNode, type Element } from "domhandler";
import htmlTags, { voidHtmlTags } from "html-tags";
import { characterEntities } from "character-entities";

const setOf = (values: string): Set<string> => new Set(values.split(" "));

const NON_LAYOUT_TAGS = setOf(
  "a abbr area audio b base bdi bdo button canvas cite code data datalist del dfn em embed head i iframe img input ins kbd label link map mark math meta meter object optgroup option output picture progress q rp rt ruby s samp script select selectedcontent slot small source span strong style sub sup svg template textarea time title track u var video wbr",
);
const FUNCTIONAL_INLINE_TAGS = setOf(
  "a audio button embed iframe img input label link object option picture select source textarea video",
);
const LAYOUT_TAGS: Set<string> = new Set(htmlTags.filter((tag) => !NON_LAYOUT_TAGS.has(tag)));
const VOID_TAGS: Set<string> = new Set(voidHtmlTags);

const RAW_TAG_PATTERN = /<\/?\s*([A-Za-z][\w:.-]*)(?:\s+(?:"[^"]*"|'[^']*'|[^'"<>])*)?\s*\/?>/g;

const NAMED_REFERENCE_PATTERN = /&([A-Za-z][A-Za-z0-9]+);?/g;
const NUMERIC_REFERENCE_PATTERN = /&#(?:x[0-9a-fA-F]+|\d+);?/g;
const LITERAL_SPECIAL_CHARACTER_PATTERN =
  /[\u00a0\u00ad\u2000-\u200f\u2028-\u202f\u205f\u2060-\u206f\u3000\ufeff]/g;

export type LayoutElement = {
  tag: string;
  children: LayoutElement[];
};

export type FunctionalElement = {
  tag: string;
  attributes: Record<string, string>;
};

export type HtmlLayoutPreservationIssue =
  | {
      code: "markup_parse_error";
      side: "source" | "target";
      message: string;
    }
  | {
      code: "layout_structure_changed";
      sourceLayout: LayoutElement[];
      targetLayout: LayoutElement[];
    }
  | {
      code: "functional_inline_inventory_changed";
      sourceElements: FunctionalElement[];
      targetElements: FunctionalElement[];
    }
  | {
      code: "special_character_added";
      sourceSpecialCharacters: string[];
      targetSpecialCharacters: string[];
      addedSpecialCharacters: string[];
    };

export type HtmlLayoutPreservationResult = {
  isValid: boolean;
  sourceLayout: LayoutElement[];
  targetLayout: LayoutElement[];
  sourceFunctionalElements: FunctionalElement[];
  targetFunctionalElements: FunctionalElement[];
  issues: HtmlLayoutPreservationIssue[];
};

type MarkupAnalysis = {
  balance: { ok: true } | { ok: false; message: string };
  layout: LayoutElement[];
  functionalElements: FunctionalElement[];
  specialCharacters: string[];
};

type MarkupStructure = Pick<MarkupAnalysis, "layout" | "functionalElements">;

export function validateHtmlLayoutPreservation(
  source: string,
  target: string,
): HtmlLayoutPreservationResult {
  const sourceAnalysis = analyzeMarkup(source);
  const targetAnalysis = analyzeMarkup(target);
  const addedSpecialCharacters = multisetDifference(
    targetAnalysis.specialCharacters,
    sourceAnalysis.specialCharacters,
  );
  const issues: HtmlLayoutPreservationIssue[] = [];

  if (!sourceAnalysis.balance.ok) {
    issues.push({
      code: "markup_parse_error",
      side: "source",
      message: sourceAnalysis.balance.message,
    });
  }

  if (!targetAnalysis.balance.ok) {
    issues.push({
      code: "markup_parse_error",
      side: "target",
      message: targetAnalysis.balance.message,
    });
  }

  if (!sameJson(sourceAnalysis.layout, targetAnalysis.layout)) {
    issues.push({
      code: "layout_structure_changed",
      sourceLayout: sourceAnalysis.layout,
      targetLayout: targetAnalysis.layout,
    });
  }

  if (
    !sameJson(
      sortFunctionalElements(sourceAnalysis.functionalElements),
      sortFunctionalElements(targetAnalysis.functionalElements),
    )
  ) {
    issues.push({
      code: "functional_inline_inventory_changed",
      sourceElements: sourceAnalysis.functionalElements,
      targetElements: targetAnalysis.functionalElements,
    });
  }

  if (addedSpecialCharacters.length > 0) {
    issues.push({
      code: "special_character_added",
      sourceSpecialCharacters: sourceAnalysis.specialCharacters,
      targetSpecialCharacters: targetAnalysis.specialCharacters,
      addedSpecialCharacters,
    });
  }

  return {
    isValid: issues.length === 0,
    sourceLayout: sourceAnalysis.layout,
    targetLayout: targetAnalysis.layout,
    sourceFunctionalElements: sourceAnalysis.functionalElements,
    targetFunctionalElements: targetAnalysis.functionalElements,
    issues,
  };
}

export function extractHtmlLayout(input: string): LayoutElement[] {
  return collectStructure(parseDocument(input, parserOptions).children).layout;
}

export function collectHtmlFunctionalElements(input: string): FunctionalElement[] {
  return collectStructure(parseDocument(input, parserOptions).children).functionalElements;
}

export function collectSpecialCharacters(input: string): string[] {
  const named = Array.from(input.matchAll(NAMED_REFERENCE_PATTERN), (match) =>
    specialCodePointsForEntity(match[1] ?? ""),
  ).flat();
  const numeric = Array.from(input.matchAll(NUMERIC_REFERENCE_PATTERN), (match) =>
    parseSpecialNumericReference(match[0]),
  ).filter((value): value is string => value !== undefined);
  const literal = Array.from(input.matchAll(LITERAL_SPECIAL_CHARACTER_PATTERN), (match) =>
    formatCodePoint(match[0].codePointAt(0) ?? 0),
  );

  return [...named, ...numeric, ...literal];
}

const parserOptions = {
  lowerCaseAttributeNames: true,
  lowerCaseTags: true,
  recognizeSelfClosing: true,
  xmlMode: false,
};

function analyzeMarkup(input: string): MarkupAnalysis {
  const structure = collectStructure(parseDocument(input, parserOptions).children);

  return {
    balance: validateMarkupBalance(input),
    ...structure,
    specialCharacters: collectSpecialCharacters(input),
  };
}

function collectStructure(
  nodes: readonly ChildNode[],
  layout: LayoutElement[] = [],
  functionalElements: FunctionalElement[] = [],
): MarkupStructure {
  for (const node of nodes) {
    if (!isTag(node)) {
      continue;
    }

    const tag = node.name.toLowerCase();

    if (FUNCTIONAL_INLINE_TAGS.has(tag)) {
      functionalElements.push({
        tag,
        attributes: normalizeAttributes(node),
      });
    }

    if (!LAYOUT_TAGS.has(tag)) {
      collectStructure(node.children, layout, functionalElements);
      continue;
    }

    const element = { tag, children: [] };

    layout.push(element);
    collectStructure(node.children, element.children, functionalElements);
  }

  return { layout, functionalElements };
}

function normalizeAttributes(node: Element): Record<string, string> {
  return Object.fromEntries(
    Object.entries(node.attribs)
      .map(([name, value]) => [name.toLowerCase(), value] as const)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function validateMarkupBalance(input: string): { ok: true } | { ok: false; message: string } {
  const stack: string[] = [];
  let match: RegExpExecArray | null;

  RAW_TAG_PATTERN.lastIndex = 0;

  while ((match = RAW_TAG_PATTERN.exec(input)) !== null) {
    const rawTag = match[0];
    const tag = (match[1] ?? "").toLowerCase();

    if (rawTag.startsWith("</")) {
      const openTag = stack.pop();

      if (openTag !== tag) {
        return {
          ok: false,
          message: openTag
            ? `Expected closing tag </${openTag}> before </${tag}>`
            : `Unexpected closing tag </${tag}>`,
        };
      }

      continue;
    }

    if (/\/\s*>$/.test(rawTag) || (VOID_TAGS.has(tag) && !hasClosingTagAhead(input, tag))) {
      continue;
    }

    stack.push(tag);
  }

  if (stack.length > 0) {
    return {
      ok: false,
      message: `Missing closing tag </${stack.at(-1)}>`,
    };
  }

  return { ok: true };
}

function hasClosingTagAhead(input: string, tag: string): boolean {
  const pattern = new RegExp(`</\\s*${escapeRegExp(tag)}\\s*>`, "i");
  return pattern.test(input.slice(RAW_TAG_PATTERN.lastIndex));
}

function specialCodePointsForEntity(name: string): string[] {
  const value = characterEntities[name] ?? characterEntities[name.toLowerCase()];

  if (!value) {
    return [];
  }

  return Array.from(value)
    .map((char) => char.codePointAt(0) ?? 0)
    .filter(isSpecialCodePoint)
    .map(formatCodePoint);
}

function parseSpecialNumericReference(reference: string): string | undefined {
  const body = reference.replace(/^&#/, "").replace(/;$/, "");
  const radix = body.toLowerCase().startsWith("x") ? 16 : 10;
  const numeric = radix === 16 ? body.slice(1) : body;
  const codePoint = Number.parseInt(numeric, radix);

  return Number.isFinite(codePoint) && isSpecialCodePoint(codePoint)
    ? formatCodePoint(codePoint)
    : undefined;
}

function isSpecialCodePoint(codePoint: number): boolean {
  return (
    codePoint === 0x00a0 ||
    codePoint === 0x00ad ||
    (codePoint >= 0x2000 && codePoint <= 0x200f) ||
    (codePoint >= 0x2028 && codePoint <= 0x202f) ||
    codePoint === 0x205f ||
    (codePoint >= 0x2060 && codePoint <= 0x206f) ||
    codePoint === 0x3000 ||
    codePoint === 0xfeff
  );
}

function formatCodePoint(codePoint: number): string {
  return `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sortFunctionalElements(elements: readonly FunctionalElement[]): FunctionalElement[] {
  return [...elements].sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right)),
  );
}

function multisetDifference(source: readonly string[], target: readonly string[]): string[] {
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

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
