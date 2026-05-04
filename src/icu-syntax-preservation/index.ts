import {
  isPluralElement,
  isSelectElement,
  isStructurallySame,
  isTagElement,
  parse,
  type Location,
  type MessageFormatElement,
} from "@formatjs/icu-messageformat-parser";

const VALID_PLURAL_SELECTOR_PATTERN = /^(?:zero|one|two|few|many|other|=-?(?:0|[1-9]\d*))$/;

const VALID_PLURAL_SELECTOR_DESCRIPTION =
  "zero, one, two, few, many, other, or a canonical exact numeric selector like =0, =1, or =-1";

type Side = "source" | "target";

type SelectShape = {
  path: string;
  argumentName: string;
  selectors: string[];
  location?: Location;
};

export type IcuSyntaxPreservationIssue =
  | {
      code: "parse_error";
      side: Side;
      message: string;
    }
  | {
      code: "structural_mismatch";
      message: string;
    }
  | {
      code: "invalid_plural_selector";
      side: Side;
      path: string;
      argumentName: string;
      selector: string;
      allowedSelectors: string;
      location?: Location;
    }
  | {
      code: "select_count_changed";
      sourceCount: number;
      targetCount: number;
    }
  | {
      code: "select_argument_changed";
      path: string;
      sourceArgumentName: string;
      targetArgumentName: string;
      sourceLocation?: Location;
      targetLocation?: Location;
    }
  | {
      code: "select_selectors_changed";
      path: string;
      argumentName: string;
      sourceSelectors: string[];
      targetSelectors: string[];
      missingSelectors: string[];
      extraSelectors: string[];
      sourceLocation?: Location;
      targetLocation?: Location;
    };

export type IcuSyntaxPreservationResult = {
  isValid: boolean;
  issues: IcuSyntaxPreservationIssue[];
};

export function validateIcuSyntaxPreservation(
  source: string,
  target: string,
): IcuSyntaxPreservationResult {
  const sourceAst = parseMessage(source, "source");
  const targetAst = parseMessage(target, "target");
  const issues: IcuSyntaxPreservationIssue[] = [];

  if (!sourceAst.ok) {
    issues.push(sourceAst.issue);
  }

  if (!targetAst.ok) {
    issues.push(targetAst.issue);
  }

  if (!sourceAst.ok || !targetAst.ok) {
    return {
      isValid: false,
      issues,
    };
  }

  const structuralResult = isStructurallySame(sourceAst.ast, targetAst.ast);

  if (!structuralResult.success) {
    issues.push({
      code: "structural_mismatch",
      message: structuralResult.error?.message ?? "Source and target ICU structure differ",
    });
  }

  issues.push(...validatePluralSelectors(sourceAst.ast, "source"));
  issues.push(...validatePluralSelectors(targetAst.ast, "target"));
  issues.push(...validateSelectSelectors(sourceAst.ast, targetAst.ast));

  return {
    isValid: issues.length === 0,
    issues,
  };
}

export function assertIcuSyntaxPreservation(source: string, target: string): void {
  const result = validateIcuSyntaxPreservation(source, target);

  if (!result.isValid) {
    throw new Error(formatIcuSyntaxPreservationIssues(result.issues));
  }
}

export function formatIcuSyntaxPreservationIssues(
  issues: readonly IcuSyntaxPreservationIssue[],
): string {
  return issues.map(formatIssue).join("\n");
}

function parseMessage(
  message: string,
  side: Side,
): { ok: true; ast: MessageFormatElement[] } | { ok: false; issue: IcuSyntaxPreservationIssue } {
  try {
    return {
      ok: true,
      ast: parse(message, {
        captureLocation: true,
        requiresOtherClause: true,
      }),
    };
  } catch (error) {
    return {
      ok: false,
      issue: {
        code: "parse_error",
        side,
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

function validatePluralSelectors(
  ast: MessageFormatElement[],
  side: Side,
  path = "$",
): IcuSyntaxPreservationIssue[] {
  const issues: IcuSyntaxPreservationIssue[] = [];

  for (const [index, element] of ast.entries()) {
    const elementPath = `${path}/${index}`;

    if (isPluralElement(element) || isSelectElement(element)) {
      for (const [selector, option] of Object.entries(element.options)) {
        if (isPluralElement(element) && !VALID_PLURAL_SELECTOR_PATTERN.test(selector)) {
          issues.push({
            code: "invalid_plural_selector",
            side,
            path: elementPath,
            argumentName: element.value,
            selector,
            allowedSelectors: VALID_PLURAL_SELECTOR_DESCRIPTION,
            location: option.location ?? element.location,
          });
        }

        issues.push(...validatePluralSelectors(option.value, side, `${elementPath}[${selector}]`));
      }

      continue;
    }

    if (isTagElement(element)) {
      issues.push(
        ...validatePluralSelectors(element.children, side, `${elementPath}<${element.value}>`),
      );
    }
  }

  return issues;
}

function validateSelectSelectors(
  sourceAst: MessageFormatElement[],
  targetAst: MessageFormatElement[],
): IcuSyntaxPreservationIssue[] {
  const sourceShapes = collectSelectShapes(sourceAst);
  const targetShapes = collectSelectShapes(targetAst);
  const issues: IcuSyntaxPreservationIssue[] = [];

  if (sourceShapes.length !== targetShapes.length) {
    issues.push({
      code: "select_count_changed",
      sourceCount: sourceShapes.length,
      targetCount: targetShapes.length,
    });
  }

  for (let index = 0; index < Math.min(sourceShapes.length, targetShapes.length); index += 1) {
    const source = sourceShapes[index];
    const target = targetShapes[index];

    if (!source || !target) {
      continue;
    }

    if (source.argumentName !== target.argumentName) {
      issues.push({
        code: "select_argument_changed",
        path: source.path,
        sourceArgumentName: source.argumentName,
        targetArgumentName: target.argumentName,
        sourceLocation: source.location,
        targetLocation: target.location,
      });
    }

    const missingSelectors = difference(source.selectors, target.selectors);
    const extraSelectors = difference(target.selectors, source.selectors);

    if (missingSelectors.length > 0 || extraSelectors.length > 0) {
      issues.push({
        code: "select_selectors_changed",
        path: source.path,
        argumentName: source.argumentName,
        sourceSelectors: source.selectors,
        targetSelectors: target.selectors,
        missingSelectors,
        extraSelectors,
        sourceLocation: source.location,
        targetLocation: target.location,
      });
    }
  }

  return issues;
}

function collectSelectShapes(
  ast: MessageFormatElement[],
  path = "$",
  shapes: SelectShape[] = [],
): SelectShape[] {
  for (const [index, element] of ast.entries()) {
    const elementPath = `${path}/${index}`;

    if (isPluralElement(element) || isSelectElement(element)) {
      const selectors = Object.keys(element.options).sort(compareStrings);

      if (isSelectElement(element)) {
        shapes.push({
          path: elementPath,
          argumentName: element.value,
          selectors,
          location: element.location,
        });
      }

      for (const selector of selectors) {
        collectSelectShapes(
          element.options[selector]?.value ?? [],
          `${elementPath}[${selector}]`,
          shapes,
        );
      }

      continue;
    }

    if (isTagElement(element)) {
      collectSelectShapes(element.children, `${elementPath}<${element.value}>`, shapes);
    }
  }

  return shapes;
}

function compareStrings(left: string, right: string): number {
  return left.localeCompare(right);
}

function difference(source: readonly string[], target: readonly string[]): string[] {
  return source.filter((value) => !target.includes(value));
}

function formatIssue(issue: IcuSyntaxPreservationIssue): string {
  switch (issue.code) {
    case "parse_error":
      return `${issue.side} ICU parse error: ${issue.message}`;
    case "structural_mismatch":
      return `ICU structure changed: ${issue.message}`;
    case "invalid_plural_selector":
      return (
        `${issue.side} invalid plural selector "${issue.selector}" for "${issue.argumentName}" at ${issue.path}. ` +
        `Expected ${issue.allowedSelectors}.`
      );
    case "select_count_changed":
      return `ICU select count changed: source=${issue.sourceCount}, target=${issue.targetCount}`;
    case "select_argument_changed":
      return (
        `ICU select argument changed at ${issue.path}: ` +
        `${issue.sourceArgumentName} -> ${issue.targetArgumentName}`
      );
    case "select_selectors_changed":
      return (
        `ICU select selectors changed for "${issue.argumentName}" at ${issue.path}: ` +
        `${issue.sourceSelectors.join("|")} -> ${issue.targetSelectors.join("|")}`
      );
  }
}
