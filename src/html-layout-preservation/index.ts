import { parseDocument } from "htmlparser2";
import { isTag, type ChildNode } from "domhandler";
import htmlTags, { voidHtmlTags } from "html-tags";
import { characterEntities } from "character-entities";

const setOf = (values: string): Set<string> => new Set(values.split(" "));

// html-tags doesn't have a list for non-layout tags
const NON_LAYOUT_TAGS = setOf(
  "a abbr area audio b base bdi bdo button canvas caption cite code col colgroup data datalist del dfn em embed head i iframe img input ins kbd label link map mark math meta meter object optgroup option output picture progress q rp rt ruby s samp script select selectedcontent slot small source span strong style sub sup svg table tbody td template textarea tfoot th thead time title tr track u var video wbr",
);
const LAYOUT_TAGS: Set<string> = new Set(htmlTags.filter((tag) => !NON_LAYOUT_TAGS.has(tag)));
const VOID_TAGS: Set<string> = new Set(voidHtmlTags);

const RAW_TAG_PATTERN = /<\/?\s*([A-Za-z][\w:.-]*)(?:\s+(?:"[^"]*"|'[^']*'|[^'"<>])*)?\s*\/?>/g;

const NAMED_REFERENCE_PATTERN = /&([A-Za-z][A-Za-z0-9]+);?/g;
const NUMERIC_REFERENCE_PATTERN = /&#(?:x[0-9a-fA-F]+|\d+);?/g;
// Literal special characters are matched here; entity forms like &nbsp; and &#160; are decoded first.
const LITERAL_SPECIAL_CHARACTER_PATTERN =
  /[\u00a0\u00ad\u2000-\u200f\u2028-\u202f\u205f\u2060-\u206f\u3000\ufeff]/g;

type LayoutElement = {
  tag: string;
  children: LayoutElement[];
};

/**
 * Issue examples:
 *
 * - `markup_parse_error`:
 *   `validateHtmlLayoutPreservation("<p>Hello <strong>world</strong></p>", "<p>Bonjour <strong>monde</p>")`
 * - `layout_structure_changed`:
 *   `validateHtmlLayoutPreservation("<section><p>Intro</p><ul><li>One</li></ul></section>", "<section><p>Intro</p><p>One</p></section>")`
 * - `special_character_added`:
 *   `validateHtmlLayoutPreservation("<p>Hello world</p>", "<p>Bonjour&nbsp;le monde</p>")`
 */
type HtmlLayoutPreservationIssue =
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
      code: "special_character_added";
      sourceSpecialCharacters: string[];
      targetSpecialCharacters: string[];
      addedSpecialCharacters: string[];
    };

type HtmlLayoutPreservationResult = {
  isValid: boolean;
  sourceLayout: LayoutElement[];
  targetLayout: LayoutElement[];
  issues: HtmlLayoutPreservationIssue[];
};

export function validateHtmlLayoutPreservation(
  source: string,
  target: string,
): HtmlLayoutPreservationResult {
  const sourceAnalysis = {
    balance: validateMarkupBalance(source),
    layout: collectLayout(parseDocument(source, parserOptions).children),
    specialCharacters: collectSpecialCharacters(source),
  };
  const targetAnalysis = {
    balance: validateMarkupBalance(target),
    layout: collectLayout(parseDocument(target, parserOptions).children),
    specialCharacters: collectSpecialCharacters(target),
  };
  const remainingSourceSpecialCharacters = new Map<string, number>();
  const issues: HtmlLayoutPreservationIssue[] = [];

  for (const value of sourceAnalysis.specialCharacters) {
    remainingSourceSpecialCharacters.set(
      value,
      (remainingSourceSpecialCharacters.get(value) ?? 0) + 1,
    );
  }

  const addedSpecialCharacters = targetAnalysis.specialCharacters.filter((value) => {
    const count = remainingSourceSpecialCharacters.get(value) ?? 0;

    if (count === 0) {
      return true;
    }

    remainingSourceSpecialCharacters.set(value, count - 1);
    return false;
  });

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

  if (JSON.stringify(sourceAnalysis.layout) !== JSON.stringify(targetAnalysis.layout)) {
    issues.push({
      code: "layout_structure_changed",
      sourceLayout: sourceAnalysis.layout,
      targetLayout: targetAnalysis.layout,
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
    issues,
  };
}

function collectSpecialCharacters(input: string): string[] {
  const named = Array.from(input.matchAll(NAMED_REFERENCE_PATTERN), ([, name = ""]) => {
    const value = characterEntities[name] ?? characterEntities[name.toLowerCase()];

    return value
      ? Array.from(value).flatMap((char) => {
          const codePoint = char.codePointAt(0) ?? 0;
          return isSpecialCodePoint(codePoint) ? [formatCodePoint(codePoint)] : [];
        })
      : [];
  }).flat();
  const numeric = Array.from(input.matchAll(NUMERIC_REFERENCE_PATTERN), ([reference]) => {
    const body = reference.replace(/^&#/, "").replace(/;$/, "");
    const radix = body.toLowerCase().startsWith("x") ? 16 : 10;
    const codePoint = Number.parseInt(radix === 16 ? body.slice(1) : body, radix);

    return Number.isFinite(codePoint) && isSpecialCodePoint(codePoint)
      ? formatCodePoint(codePoint)
      : undefined;
  }).filter((value): value is string => value !== undefined);
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

function collectLayout(nodes: readonly ChildNode[], layout: LayoutElement[] = []): LayoutElement[] {
  for (const node of nodes) {
    if (!isTag(node)) {
      continue;
    }

    const tag = node.name.toLowerCase();

    if (!LAYOUT_TAGS.has(tag)) {
      collectLayout(node.children, layout);
      continue;
    }

    const element = { tag, children: [] };

    layout.push(element);
    collectLayout(node.children, element.children);
  }

  return layout;
}

// html-validate does the same thing as this but takes significantly longer (90s) - custom check takes 0.4s
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

    if (
      /\/\s*>$/.test(rawTag) ||
      (VOID_TAGS.has(tag) &&
        !new RegExp(`</\\s*${tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*>`, "i").test(
          input.slice(RAW_TAG_PATTERN.lastIndex),
        ))
    ) {
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
