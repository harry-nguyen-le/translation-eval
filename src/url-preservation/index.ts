const URL_PATTERN =
  /\b(?:(?:https?|ftp):\/\/|mailto:|tel:|www\.)(?:[^\s<>"'`[\]{}\\^~().,;:!?]|\([^\s<>"'`[\]{}\\^~()]*\)|[.,;:!?](?=[^\s<>"'`[\]{}\\^~().,;:!?]))+/gi;

export type UrlPreservationIssue =
  | {
      code: "urls_missing";
      sourceUrls: string[];
      targetUrls: string[];
      missingUrls: string[];
    }
  | {
      code: "urls_added";
      sourceUrls: string[];
      targetUrls: string[];
      extraUrls: string[];
    };

export type UrlPreservationResult = {
  isValid: boolean;
  sourceUrls: string[];
  targetUrls: string[];
  issues: UrlPreservationIssue[];
};

export function extractUrls(content: string): string[] {
  return Array.from(content.matchAll(URL_PATTERN), (match) => match[0]);
}

export function validateUrlPreservation(source: string, target: string): UrlPreservationResult {
  const sourceUrls = extractUrls(source);
  const targetUrls = extractUrls(target);
  const missingUrls = difference(sourceUrls, targetUrls);
  const extraUrls = difference(targetUrls, sourceUrls);
  const issues: UrlPreservationIssue[] = [];

  if (missingUrls.length > 0) {
    issues.push({
      code: "urls_missing",
      sourceUrls,
      targetUrls,
      missingUrls,
    });
  }

  if (extraUrls.length > 0) {
    issues.push({
      code: "urls_added",
      sourceUrls,
      targetUrls,
      extraUrls,
    });
  }

  return {
    isValid: issues.length === 0,
    sourceUrls,
    targetUrls,
    issues,
  };
}

export function assertUrlPreservation(source: string, target: string): void {
  const result = validateUrlPreservation(source, target);

  if (!result.isValid) {
    throw new Error(result.issues.map(formatIssue).join("\n"));
  }
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

function formatIssue(issue: UrlPreservationIssue): string {
  switch (issue.code) {
    case "urls_missing":
      return `URL preservation failed: missing ${formatList(issue.missingUrls)}`;
    case "urls_added":
      return `URL preservation failed: added ${formatList(issue.extraUrls)}`;
  }
}

function formatList(values: readonly string[]): string {
  return values.map((value) => JSON.stringify(value)).join(", ");
}
