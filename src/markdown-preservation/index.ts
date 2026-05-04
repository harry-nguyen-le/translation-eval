import { fromMarkdown } from "mdast-util-from-markdown";
import type { Heading, List, Root, RootContent } from "mdast";

export type MarkdownInputFormat = "auto" | "json-string" | "runtime";

export type MarkdownParseResult = {
  input: string;
  inputFormat: Exclude<MarkdownInputFormat, "auto">;
  markdown: string;
  ast: Root;
};

type MarkdownStructure = {
  headingDepths: number[];
  lists: ListShape[];
  tables: TableShape[];
};

type ListShape = {
  depth: number;
  ordered: boolean;
  itemCount: number;
};

type TableShape = {
  columns: number;
  rows: number;
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
    }
  | {
      code: "table_structure_changed";
      message: string;
      sourceTables: TableShape[];
      targetTables: TableShape[];
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

export function parseMarkdownForValidation(
  input: string,
  options: { inputFormat?: MarkdownInputFormat } = {},
): MarkdownParseResult {
  const normalized = normalizeMarkdownInput(input, options.inputFormat ?? "auto");
  const ast = fromMarkdown(normalized.markdown);

  return {
    input,
    inputFormat: normalized.inputFormat,
    markdown: normalized.markdown,
    ast,
  };
}

export const parseMarkdownForPreservation = parseMarkdownForValidation;

export function validateMarkdown(
  input: string,
  options: { inputFormat?: MarkdownInputFormat } = {},
): MarkdownValidationResult {
  const parsed = safeParseMarkdown(input, "input", options);

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
  options: { inputFormat?: MarkdownInputFormat } = {},
): MarkdownPreservationResult {
  const source = safeParseMarkdown(sourceInput, "source", options);
  const target = safeParseMarkdown(targetInput, "target", options);
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

  if (
    sourceStructure.tables.length > 0 &&
    !sameJson(sourceStructure.tables, targetStructure.tables)
  ) {
    issues.push({
      code: "table_structure_changed",
      message: "Pipe table count, row count, or column count changed",
      sourceTables: sourceStructure.tables,
      targetTables: targetStructure.tables,
    });
  }

  return issues;
}

function extractMarkdownStructure(parsed: MarkdownParseResult): MarkdownStructure {
  return {
    headingDepths: collectHeadingDepths(parsed.ast),
    lists: hasLikelyStructuredList(parsed.markdown) ? collectListShapes(parsed.ast) : [],
    tables: collectPipeTableShapes(parsed.markdown),
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

function collectPipeTableShapes(markdown: string): TableShape[] {
  const lines = markdown.split(/\r?\n/);
  const tables: TableShape[] = [];

  for (let index = 1; index < lines.length; index += 1) {
    const separator = lines[index];

    if (!separator || !isPipeTableSeparator(separator)) {
      continue;
    }

    const header = lines[index - 1] ?? "";
    const columns = countPipeTableColumns(header);

    if (columns < 2) {
      continue;
    }

    let rows = 1;

    for (let rowIndex = index + 1; rowIndex < lines.length; rowIndex += 1) {
      const row = lines[rowIndex] ?? "";

      if (!row.includes("|") || row.trim().length === 0) {
        break;
      }

      rows += 1;
    }

    tables.push({
      columns,
      rows,
    });
  }

  return tables;
}

function hasLikelyStructuredList(markdown: string): boolean {
  return (markdown.match(/^ {0,3}(?:[-+*]|\d+[.)])\s+\S/gmu)?.length ?? 0) > 1;
}

function isPipeTableSeparator(line: string): boolean {
  const cells = splitPipeTableCells(line);

  return cells.length >= 2 && cells.every((cell) => /^:?-{3,}:?$/u.test(cell.trim()));
}

function countPipeTableColumns(line: string): number {
  return splitPipeTableCells(line).length;
}

function splitPipeTableCells(line: string): string[] {
  const trimmed = line.trim();
  const withoutOuterPipes = trimmed.replace(/^\|/u, "").replace(/\|$/u, "");
  const cells: string[] = [];
  let current = "";
  let escaped = false;

  for (const char of withoutOuterPipes) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      current += char;
      escaped = true;
      continue;
    }

    if (char === "|") {
      cells.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current);

  return cells;
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
  options: { inputFormat?: MarkdownInputFormat },
): { ok: true; result: MarkdownParseResult } | { ok: false; issue: MarkdownPreservationIssue } {
  try {
    return {
      ok: true,
      result: parseMarkdownForValidation(input, options),
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

function normalizeMarkdownInput(
  input: string,
  inputFormat: MarkdownInputFormat,
): {
  inputFormat: Exclude<MarkdownInputFormat, "auto">;
  markdown: string;
} {
  const resolvedFormat = inputFormat === "auto" ? detectMarkdownInputFormat(input) : inputFormat;

  if (resolvedFormat === "runtime") {
    return {
      inputFormat: "runtime",
      markdown: input,
    };
  }

  const parsed = JSON.parse(input) as unknown;

  if (typeof parsed !== "string") {
    throw new TypeError("JSON Markdown input must decode to a string");
  }

  return {
    inputFormat: "json-string",
    markdown: parsed,
  };
}

function detectMarkdownInputFormat(input: string): Exclude<MarkdownInputFormat, "auto"> {
  const trimmed = input.trim();
  return trimmed.startsWith('"') && trimmed.endsWith('"') ? "json-string" : "runtime";
}
