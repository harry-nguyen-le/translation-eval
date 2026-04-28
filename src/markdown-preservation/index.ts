import { fromMarkdown } from "mdast-util-from-markdown";
import type { Blockquote, Content, List, ListItem, PhrasingContent, Root } from "mdast";

export type MarkdownInputFormat = "auto" | "json-string" | "runtime";

export type MarkdownEscapeKind =
  | "backspace"
  | "backslash"
  | "carriage-return"
  | "form-feed"
  | "newline"
  | "quote"
  | "slash"
  | "tab"
  | "unicode";

export type MarkdownEscapeSequence = {
  raw: string;
  kind: MarkdownEscapeKind;
  index: number;
};

export type MarkdownProtectedNode =
  | {
      type: "codeBlock";
      value: string;
      lang?: string;
      meta?: string;
    }
  | {
      type: "definition";
      identifier: string;
      url: string;
      title?: string;
    }
  | {
      type: "emphasis";
      ancestors: string[];
    }
  | {
      type: "hardBreak";
      ancestors: string[];
    }
  | {
      type: "html";
      value: string;
      ancestors: string[];
    }
  | {
      type: "image";
      url: string;
      title?: string;
      ancestors: string[];
    }
  | {
      type: "imageReference";
      identifier: string;
      ancestors: string[];
    }
  | {
      type: "inlineCode";
      value: string;
      ancestors: string[];
    }
  | {
      type: "link";
      url: string;
      title?: string;
      ancestors: string[];
    }
  | {
      type: "linkReference";
      identifier: string;
      ancestors: string[];
    }
  | {
      type: "strong";
      ancestors: string[];
    };

export type MarkdownBlockContract = {
  path: string;
  signature: string;
  protectedNodes: MarkdownProtectedNode[];
};

export type MarkdownPreservationContract = {
  blocks: MarkdownBlockContract[];
  escapeSequences: MarkdownEscapeSequence[];
};

export type MarkdownParseResult = {
  input: string;
  inputFormat: Exclude<MarkdownInputFormat, "auto">;
  markdown: string;
  ast: Root;
  contract: MarkdownPreservationContract;
};

export type MarkdownPreservationIssue =
  | {
      code: "input_parse_error";
      side: "source" | "target";
      message: string;
    }
  | {
      code: "block_structure_changed";
      sourceSignatures: string[];
      targetSignatures: string[];
    }
  | {
      code: "escape_sequences_changed";
      sourceEscapes: string[];
      targetEscapes: string[];
    }
  | {
      code: "protected_nodes_changed";
      path: string;
      sourceNodes: string[];
      targetNodes: string[];
      missingNodes: string[];
      extraNodes: string[];
    };

export type MarkdownPreservationResult = {
  isValid: boolean;
  issues: MarkdownPreservationIssue[];
  source?: MarkdownParseResult;
  target?: MarkdownParseResult;
};

export function parseMarkdownForPreservation(
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
    contract: extractMarkdownPreservationContract(ast, normalized.escapeSequences),
  };
}

export function validateMarkdownPreservation(
  sourceInput: string,
  targetInput: string,
  options: { inputFormat?: MarkdownInputFormat } = {},
): MarkdownPreservationResult {
  const source = safeParseMarkdownForPreservation(sourceInput, "source", options);
  const target = safeParseMarkdownForPreservation(targetInput, "target", options);
  const issues: MarkdownPreservationIssue[] = [];

  if (!source.ok) {
    issues.push(source.issue);
  }

  if (!target.ok) {
    issues.push(target.issue);
  }

  if (!source.ok || !target.ok) {
    return {
      isValid: false,
      issues,
      source: source.ok ? source.result : undefined,
      target: target.ok ? target.result : undefined,
    };
  }

  issues.push(...compareMarkdownContracts(source.result.contract, target.result.contract));

  return {
    isValid: issues.length === 0,
    issues,
    source: source.result,
    target: target.result,
  };
}

function safeParseMarkdownForPreservation(
  input: string,
  side: "source" | "target",
  options: { inputFormat?: MarkdownInputFormat },
): { ok: true; result: MarkdownParseResult } | { ok: false; issue: MarkdownPreservationIssue } {
  try {
    return {
      ok: true,
      result: parseMarkdownForPreservation(input, options),
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
  escapeSequences: MarkdownEscapeSequence[];
} {
  const resolvedFormat = inputFormat === "auto" ? detectMarkdownInputFormat(input) : inputFormat;

  if (resolvedFormat === "runtime") {
    return {
      inputFormat: "runtime",
      markdown: input,
      escapeSequences: [],
    };
  }

  const parsed = JSON.parse(input) as unknown;

  if (typeof parsed !== "string") {
    throw new TypeError("JSON Markdown input must decode to a string");
  }

  return {
    inputFormat: "json-string",
    markdown: parsed,
    escapeSequences: collectJsonStringEscapes(input),
  };
}

function detectMarkdownInputFormat(input: string): Exclude<MarkdownInputFormat, "auto"> {
  const trimmed = input.trim();
  return trimmed.startsWith('"') && trimmed.endsWith('"') ? "json-string" : "runtime";
}

function collectJsonStringEscapes(input: string): MarkdownEscapeSequence[] {
  const escapePattern = /\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4})/g;
  const sequences: MarkdownEscapeSequence[] = [];

  for (const match of input.matchAll(escapePattern)) {
    sequences.push({
      raw: match[0],
      kind: classifyJsonEscape(match[0]),
      index: match.index,
    });
  }

  return sequences;
}

function classifyJsonEscape(raw: string): MarkdownEscapeKind {
  switch (raw[1]) {
    case '"':
      return "quote";
    case "\\":
      return "backslash";
    case "/":
      return "slash";
    case "b":
      return "backspace";
    case "f":
      return "form-feed";
    case "n":
      return "newline";
    case "r":
      return "carriage-return";
    case "t":
      return "tab";
    case "u":
      return "unicode";
    default:
      throw new Error(`Unsupported JSON escape sequence: ${raw}`);
  }
}

function extractMarkdownPreservationContract(
  ast: Root,
  escapeSequences: MarkdownEscapeSequence[],
): MarkdownPreservationContract {
  const blocks: MarkdownBlockContract[] = [];

  for (const [index, child] of ast.children.entries()) {
    collectBlockContract(child, `$/${blockPathSegment(child, index)}`, blocks);
  }

  return {
    blocks,
    escapeSequences,
  };
}

function collectBlockContract(node: Content, path: string, blocks: MarkdownBlockContract[]): void {
  switch (node.type) {
    case "blockquote":
      collectBlockquoteContract(node, path, blocks);
      return;
    case "break":
    case "delete":
    case "emphasis":
    case "footnoteReference":
    case "image":
    case "imageReference":
    case "inlineCode":
    case "link":
    case "linkReference":
    case "strong":
    case "text":
      return;
    case "code":
      blocks.push({
        path,
        signature: blockSignature(node),
        protectedNodes: [
          {
            type: "codeBlock",
            value: node.value,
            lang: node.lang ?? undefined,
            meta: node.meta ?? undefined,
          },
        ],
      });
      return;
    case "definition":
      blocks.push({
        path,
        signature: blockSignature(node),
        protectedNodes: [
          {
            type: "definition",
            identifier: node.identifier,
            url: node.url,
            title: node.title ?? undefined,
          },
        ],
      });
      return;
    case "heading":
      blocks.push({
        path,
        signature: blockSignature(node),
        protectedNodes: collectInlineProtectedNodes(node.children),
      });
      return;
    case "html":
      blocks.push({
        path,
        signature: blockSignature(node),
        protectedNodes: [
          {
            type: "html",
            value: node.value,
            ancestors: [],
          },
        ],
      });
      return;
    case "list":
      collectListContract(node, path, blocks);
      return;
    case "listItem":
      collectListItemContract(node, path, blocks);
      return;
    case "paragraph":
      blocks.push({
        path,
        signature: blockSignature(node),
        protectedNodes: collectInlineProtectedNodes(node.children),
      });
      return;
    case "thematicBreak":
      blocks.push({
        path,
        signature: blockSignature(node),
        protectedNodes: [],
      });
      return;
    case "yaml":
      blocks.push({
        path,
        signature: blockSignature(node),
        protectedNodes: [
          {
            type: "html",
            value: node.value,
            ancestors: [],
          },
        ],
      });
      return;
  }
}

function collectBlockquoteContract(
  node: Blockquote,
  path: string,
  blocks: MarkdownBlockContract[],
): void {
  blocks.push({
    path,
    signature: blockSignature(node),
    protectedNodes: [],
  });

  for (const [index, child] of node.children.entries()) {
    collectBlockContract(child, `${path}/${blockPathSegment(child, index)}`, blocks);
  }
}

function collectListContract(node: List, path: string, blocks: MarkdownBlockContract[]): void {
  blocks.push({
    path,
    signature: blockSignature(node),
    protectedNodes: [],
  });

  for (const [index, child] of node.children.entries()) {
    collectBlockContract(child, `${path}/${blockPathSegment(child, index)}`, blocks);
  }
}

function collectListItemContract(
  node: ListItem,
  path: string,
  blocks: MarkdownBlockContract[],
): void {
  blocks.push({
    path,
    signature: blockSignature(node),
    protectedNodes: [],
  });

  for (const [index, child] of node.children.entries()) {
    collectBlockContract(child, `${path}/${blockPathSegment(child, index)}`, blocks);
  }
}

function collectInlineProtectedNodes(
  children: PhrasingContent[],
  ancestors: string[] = [],
): MarkdownProtectedNode[] {
  const protectedNodes: MarkdownProtectedNode[] = [];

  for (const child of children) {
    switch (child.type) {
      case "break":
        protectedNodes.push({
          type: "hardBreak",
          ancestors,
        });
        break;
      case "emphasis":
        protectedNodes.push({
          type: "emphasis",
          ancestors,
        });
        protectedNodes.push(
          ...collectInlineProtectedNodes(child.children, [...ancestors, "emphasis"]),
        );
        break;
      case "html":
        protectedNodes.push({
          type: "html",
          value: child.value,
          ancestors,
        });
        break;
      case "image":
        protectedNodes.push({
          type: "image",
          url: child.url,
          title: child.title ?? undefined,
          ancestors,
        });
        break;
      case "imageReference":
        protectedNodes.push({
          type: "imageReference",
          identifier: child.identifier,
          ancestors,
        });
        break;
      case "inlineCode":
        protectedNodes.push({
          type: "inlineCode",
          value: child.value,
          ancestors,
        });
        break;
      case "link":
        protectedNodes.push({
          type: "link",
          url: child.url,
          title: child.title ?? undefined,
          ancestors,
        });
        protectedNodes.push(
          ...collectInlineProtectedNodes(child.children, [...ancestors, `link:${child.url}`]),
        );
        break;
      case "linkReference":
        protectedNodes.push({
          type: "linkReference",
          identifier: child.identifier,
          ancestors,
        });
        protectedNodes.push(
          ...collectInlineProtectedNodes(child.children, [
            ...ancestors,
            `linkReference:${child.identifier}`,
          ]),
        );
        break;
      case "strong":
        protectedNodes.push({
          type: "strong",
          ancestors,
        });
        protectedNodes.push(
          ...collectInlineProtectedNodes(child.children, [...ancestors, "strong"]),
        );
        break;
    }
  }

  return protectedNodes;
}

function compareMarkdownContracts(
  source: MarkdownPreservationContract,
  target: MarkdownPreservationContract,
): MarkdownPreservationIssue[] {
  const issues: MarkdownPreservationIssue[] = [];
  const sourceSignatures = source.blocks.map((block) => block.signature);
  const targetSignatures = target.blocks.map((block) => block.signature);

  if (!sameArray(sourceSignatures, targetSignatures)) {
    issues.push({
      code: "block_structure_changed",
      sourceSignatures,
      targetSignatures,
    });
  }

  const sourceEscapes = source.escapeSequences.map((escape) => escape.raw);
  const targetEscapes = target.escapeSequences.map((escape) => escape.raw);

  if (
    (sourceEscapes.length > 0 || targetEscapes.length > 0) &&
    !sameMultiset(sourceEscapes, targetEscapes)
  ) {
    issues.push({
      code: "escape_sequences_changed",
      sourceEscapes: sortStrings(sourceEscapes),
      targetEscapes: sortStrings(targetEscapes),
    });
  }

  for (let index = 0; index < Math.min(source.blocks.length, target.blocks.length); index += 1) {
    const sourceBlock = source.blocks[index];
    const targetBlock = target.blocks[index];

    if (!sourceBlock || !targetBlock) {
      continue;
    }

    const sourceNodes = sourceBlock.protectedNodes.map(formatProtectedNode);
    const targetNodes = targetBlock.protectedNodes.map(formatProtectedNode);

    if (!sameMultiset(sourceNodes, targetNodes)) {
      const missingNodes = subtractMultiset(sourceNodes, targetNodes);
      const extraNodes = subtractMultiset(targetNodes, sourceNodes);

      issues.push({
        code: "protected_nodes_changed",
        path: sourceBlock.path,
        sourceNodes: sortStrings(sourceNodes),
        targetNodes: sortStrings(targetNodes),
        missingNodes: sortStrings(missingNodes),
        extraNodes: sortStrings(extraNodes),
      });
    }
  }

  return issues;
}

function blockPathSegment(node: Content, index: number): string {
  return `${node.type}[${index}]`;
}

function blockSignature(node: Content): string {
  switch (node.type) {
    case "blockquote":
      return "blockquote";
    case "code":
      return `codeBlock(lang=${node.lang ?? ""},meta=${node.meta ?? ""})`;
    case "definition":
      return `definition(${node.identifier})`;
    case "heading":
      return `heading(depth=${node.depth})`;
    case "html":
      return "html";
    case "list":
      return `list(ordered=${String(node.ordered)},start=${node.start ?? ""},spread=${String(node.spread)})`;
    case "listItem":
      return `listItem(checked=${node.checked ?? ""},spread=${String(node.spread)})`;
    case "paragraph":
      return "paragraph";
    case "thematicBreak":
      return "thematicBreak";
    case "yaml":
      return "yaml";
    default:
      return node.type;
  }
}

function formatProtectedNode(node: MarkdownProtectedNode): string {
  switch (node.type) {
    case "codeBlock":
      return `codeBlock|lang=${node.lang ?? ""}|meta=${node.meta ?? ""}|value=${node.value}`;
    case "definition":
      return `definition|identifier=${node.identifier}|url=${node.url}|title=${node.title ?? ""}`;
    case "emphasis":
      return `emphasis|ancestors=${node.ancestors.join(">")}`;
    case "hardBreak":
      return `hardBreak|ancestors=${node.ancestors.join(">")}`;
    case "html":
      return `html|value=${node.value}|ancestors=${node.ancestors.join(">")}`;
    case "image":
      return `image|url=${node.url}|title=${node.title ?? ""}|ancestors=${node.ancestors.join(">")}`;
    case "imageReference":
      return `imageReference|identifier=${node.identifier}|ancestors=${node.ancestors.join(">")}`;
    case "inlineCode":
      return `inlineCode|value=${node.value}|ancestors=${node.ancestors.join(">")}`;
    case "link":
      return `link|url=${node.url}|title=${node.title ?? ""}|ancestors=${node.ancestors.join(">")}`;
    case "linkReference":
      return `linkReference|identifier=${node.identifier}|ancestors=${node.ancestors.join(">")}`;
    case "strong":
      return `strong|ancestors=${node.ancestors.join(">")}`;
  }
}

function sameArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameMultiset(left: readonly string[], right: readonly string[]): boolean {
  return sameArray(sortStrings(left), sortStrings(right));
}

function subtractMultiset(left: readonly string[], right: readonly string[]): string[] {
  const remaining = [...right];
  const difference: string[] = [];

  for (const value of left) {
    const index = remaining.indexOf(value);

    if (index === -1) {
      difference.push(value);
      continue;
    }

    remaining.splice(index, 1);
  }

  return difference;
}

function sortStrings(values: readonly string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}
