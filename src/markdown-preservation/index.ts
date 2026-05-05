import { fromMarkdown } from "mdast-util-from-markdown";
import type { Heading, List, Root, RootContent } from "mdast";

export type MarkdownParseResult = {
  input: string;
  markdown: string;
  ast: Root;
};

type MarkdownStructure = {
  headingDepths: number[];
  lists: ListShape[];
};

type ListShape = {
  depth: number;
  ordered: boolean;
  itemCount: number;
};

export type MarkdownValidationIssue =
  | {
      code: "input_parse_error";
      side?: "source" | "target" | "input";
      message: string;
    }
  | {
      code: "heading_structure_changed";
      message: string;
      sourceHeadingDepths: number[];
      targetHeadingDepths: number[];
    }
  | {
      code: "list_structure_changed";
      message: string;
      sourceLists: ListShape[];
      targetLists: ListShape[];
    };

export type MarkdownValidationResult = {
  isValid: boolean;
  issues: MarkdownValidationIssue[];
  parsed?: MarkdownParseResult;
};

export type MarkdownPreservationIssue = MarkdownValidationIssue;

export type MarkdownPreservationResult = {
  isValid: boolean;
  issues: MarkdownPreservationIssue[];
  source?: MarkdownParseResult;
  target?: MarkdownParseResult;
};

export function parseMarkdownForValidation(input: string): MarkdownParseResult {
  const ast = fromMarkdown(input);

  return {
    input,
    markdown: input,
    ast,
  };
}

export function validateMarkdown(input: string): MarkdownValidationResult {
  const parsed = safeParseMarkdown(input, "input");

  if (!parsed.ok) {
    return {
      isValid: false,
      issues: [parsed.issue],
    };
  }

  return {
    isValid: true,
    issues: [],
    parsed: parsed.result,
  };
}

export function validateMarkdownPreservation(
  sourceInput: string,
  targetInput: string,
): MarkdownPreservationResult {
  const source = safeParseMarkdown(sourceInput, "source");
  const target = safeParseMarkdown(targetInput, "target");
  const issues: MarkdownPreservationIssue[] = [];

  if (!source.ok) {
    issues.push(source.issue);
  }

  if (!target.ok) {
    issues.push(target.issue);
  }

  if (source.ok && target.ok) {
    issues.push(...compareMarkdownStructure(source.result, target.result));
  }

  return {
    isValid: issues.length === 0,
    issues,
    source: source.ok ? source.result : undefined,
    target: target.ok ? target.result : undefined,
  };
}

function compareMarkdownStructure(
  source: MarkdownParseResult,
  target: MarkdownParseResult,
): MarkdownPreservationIssue[] {
  const sourceStructure = extractMarkdownStructure(source);
  const targetStructure = extractMarkdownStructure(target);
  const issues: MarkdownPreservationIssue[] = [];

  if (!sameArray(sourceStructure.headingDepths, targetStructure.headingDepths)) {
    issues.push({
      code: "heading_structure_changed",
      message: "Heading hierarchy changed",
      sourceHeadingDepths: sourceStructure.headingDepths,
      targetHeadingDepths: targetStructure.headingDepths,
    });
  }

  if (sourceStructure.lists.length > 0 && !sameJson(sourceStructure.lists, targetStructure.lists)) {
    issues.push({
      code: "list_structure_changed",
      message: "List count, nesting, type, or item count changed",
      sourceLists: sourceStructure.lists,
      targetLists: targetStructure.lists,
    });
  }

  return issues;
}

function extractMarkdownStructure(parsed: MarkdownParseResult): MarkdownStructure {
  return {
    headingDepths: collectHeadingDepths(parsed.ast),
    lists: hasLikelyStructuredList(parsed.markdown) ? collectListShapes(parsed.ast) : [],
  };
}

function collectHeadingDepths(ast: Root): number[] {
  const depths: number[] = [];

  visitRootContent(ast.children, (node) => {
    if (node.type === "heading") {
      depths.push((node as Heading).depth);
    }
  });

  return depths;
}

function collectListShapes(ast: Root): ListShape[] {
  const lists: ListShape[] = [];

  visitRootContent(ast.children, (node, depth) => {
    if (node.type !== "list") {
      return;
    }

    const list = node as List;

    lists.push({
      depth,
      ordered: list.ordered ?? false,
      itemCount: list.children.length,
    });
  });

  return lists;
}

function hasLikelyStructuredList(markdown: string): boolean {
  return (markdown.match(/^ {0,3}(?:[-+*]|\d+[.)])\s+\S/gmu)?.length ?? 0) > 1;
}

function visitRootContent(
  nodes: RootContent[],
  visit: (node: RootContent, depth: number) => void,
  depth = 0,
): void {
  for (const node of nodes) {
    visit(node, depth);

    if ("children" in node && Array.isArray(node.children)) {
      visitRootContent(node.children as RootContent[], visit, depth + 1);
    }
  }
}

function sameArray(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function safeParseMarkdown(
  input: string,
  side: "source" | "target" | "input",
): { ok: true; result: MarkdownParseResult } | { ok: false; issue: MarkdownPreservationIssue } {
  try {
    return {
      ok: true,
      result: parseMarkdownForValidation(input),
    };
  } catch (error) {
    return {
      ok: false,
      issue: {
        code: "input_parse_error",
        side,
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}
