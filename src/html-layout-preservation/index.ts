import { parseDocument } from "htmlparser2";
import { isTag, type ChildNode } from "domhandler";

const setOf = (values: string): Set<string> => new Set(values.split(" "));

const LAYOUT_TAGS = setOf(
  "article aside blockquote body br dd details dialog div dl dt fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hgroup hr html li main menu nav ol p pre section summary ul",
);
const VOID_TAGS = setOf("area base br col embed hr img input link meta source track wbr");

const RAW_TAG_PATTERN = /<\/?\s*([A-Za-z][\w:.-]*)(?:\s+(?:"[^"]*"|'[^']*'|[^'"<>])*)?\s*\/?>/g;

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
  };
  const targetAnalysis = {
    balance: validateMarkupBalance(target),
    layout: collectLayout(parseDocument(target, parserOptions).children),
  };
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

  if (JSON.stringify(sourceAnalysis.layout) !== JSON.stringify(targetAnalysis.layout)) {
    issues.push({
      code: "layout_structure_changed",
      sourceLayout: sourceAnalysis.layout,
      targetLayout: targetAnalysis.layout,
    });
  }

  return {
    isValid: issues.length === 0,
    sourceLayout: sourceAnalysis.layout,
    targetLayout: targetAnalysis.layout,
    issues,
  };
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
