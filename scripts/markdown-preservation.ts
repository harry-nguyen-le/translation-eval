import { readFileSync } from "node:fs";

import { validateMarkdownPreservation } from "../src/markdown-preservation/index";
import type { MarkdownPreservationIssue } from "../src/markdown-preservation/index";

type TargetField = "french" | "german";

type MarkdownEntry = {
  description?: unknown;
  english?: string | null;
} & Partial<Record<TargetField, string | null>>;

type MarkdownEntries = Record<string, MarkdownEntry>;

type InvalidEntry = {
  id: string;
  field: TargetField;
  description: unknown;
  source: string;
  target: string;
  issues: MarkdownPreservationIssue[];
};

const TARGET_FIELDS = ["french", "german"] as const satisfies readonly TargetField[];
const DEFAULT_FILE = "dummy-markdown.json";
const DEFAULT_MAX_REPORTS = 50;

const args = parseArgs(process.argv.slice(2));
const filePath = args.filePath ?? DEFAULT_FILE;
const maxReports = args.maxReports ?? DEFAULT_MAX_REPORTS;

const rawEntries = readJsonFile(filePath);
const entries = assertMarkdownEntries(rawEntries, filePath);
const result = evaluateMarkdownEntries(entries);

printSummary(filePath, result, maxReports);

if (result.invalidEntries.length > 0) {
  process.exitCode = 1;
}

function evaluateMarkdownEntries(entries: MarkdownEntries) {
  const invalidEntries: InvalidEntry[] = [];
  let checkedTranslations = 0;
  let skippedTranslations = 0;

  for (const [id, entry] of Object.entries(entries)) {
    const source = entry.english;

    if (typeof source !== "string") {
      skippedTranslations += TARGET_FIELDS.length;
      continue;
    }

    for (const field of TARGET_FIELDS) {
      const target = entry[field];

      if (typeof target !== "string") {
        skippedTranslations += 1;
        continue;
      }

      checkedTranslations += 1;

      const validation = validateMarkdownPreservation(source, target);

      if (!validation.isValid) {
        invalidEntries.push({
          id,
          field,
          description: entry.description ?? null,
          source,
          target,
          issues: validation.issues,
        });
      }
    }
  }

  return {
    entries: Object.keys(entries).length,
    checkedTranslations,
    skippedTranslations,
    invalidEntries,
  };
}

function readJsonFile(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read ${path}: ${message}`);
  }
}

function assertMarkdownEntries(value: unknown, path: string): MarkdownEntries {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} must contain a JSON object keyed by Markdown sample id`);
  }

  return value as MarkdownEntries;
}

function parseArgs(args: string[]): {
  filePath?: string;
  maxReports?: number;
} {
  const parsed: {
    filePath?: string;
    maxReports?: number;
  } = {};

  for (const arg of args) {
    if (arg.startsWith("--max-reports=")) {
      const value = Number(arg.slice("--max-reports=".length));

      if (!Number.isInteger(value) || value < 0) {
        throw new Error("--max-reports must be a non-negative integer");
      }

      parsed.maxReports = value;
      continue;
    }

    if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    if (parsed.filePath) {
      throw new Error(`Unexpected extra argument: ${arg}`);
    }

    parsed.filePath = arg;
  }

  return parsed;
}

function printSummary(
  filePath: string,
  result: ReturnType<typeof evaluateMarkdownEntries>,
  maxReports: number,
): void {
  console.log("Markdown preservation");
  console.log(`File: ${filePath}`);
  console.log(`Entries: ${result.entries}`);
  console.log(`Checked translations: ${result.checkedTranslations}`);
  console.log(`Skipped translations: ${result.skippedTranslations}`);
  console.log(`Invalid entries: ${result.invalidEntries.length}`);

  if (result.invalidEntries.length === 0) {
    return;
  }

  console.log("");
  console.log(`First ${Math.min(maxReports, result.invalidEntries.length)} invalid entries:`);

  for (const entry of result.invalidEntries.slice(0, maxReports)) {
    console.log(JSON.stringify(entry, null, 2));
  }
}
