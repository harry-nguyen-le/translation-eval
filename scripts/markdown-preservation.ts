import { readFileSync } from "node:fs";

import { validateMarkdown, validateMarkdownPreservation } from "../src/markdown-preservation/index";
import type { MarkdownValidationIssue } from "../src/markdown-preservation/index";

type TargetField = "french" | "german";

type StaticTranslationEntry = {
  description?: unknown;
  english?: string | null;
} & Partial<Record<TargetField, string | null>>;

type ExtractedTranslationEntry = {
  sk?: string | null;
  translatedContent?: string | null;
};

type InvalidEntry = {
  id: string;
  field: string;
  locale: string | null;
  value: string;
  description: unknown;
  source?: string;
  issues: MarkdownValidationIssue[];
};

const TARGET_LOCALES = {
  french: "fr",
  german: "de",
} as const;

const DEFAULT_FILE = "dummy-markdown.json";
const DEFAULT_MAX_REPORTS = 50;

const args = parseArgs(process.argv.slice(2));
const filePath = args.filePath ?? DEFAULT_FILE;
const maxReports = args.maxReports ?? DEFAULT_MAX_REPORTS;

const rawEntries = readJsonFile(filePath);
const result = evaluateMarkdownFile(rawEntries, filePath);

printSummary(filePath, result, maxReports);

if (result.invalidEntries.length > 0) {
  process.exitCode = 1;
}

function evaluateMarkdownFile(value: unknown, path: string) {
  if (Array.isArray(value)) {
    return evaluateExtractedTranslations(value, path);
  }

  if (!value || typeof value !== "object") {
    throw new Error(
      `${path} must contain either a JSON object keyed by translation id or an extracted translation array`,
    );
  }

  return evaluateStaticTranslations(value as Record<string, StaticTranslationEntry>);
}

function evaluateStaticTranslations(entries: Record<string, StaticTranslationEntry>) {
  const invalidEntries: InvalidEntry[] = [];
  let checkedTranslations = 0;
  let skippedTranslations = 0;

  for (const [id, entry] of Object.entries(entries)) {
    const source = entry.english;

    if (typeof source !== "string") {
      skippedTranslations += Object.keys(TARGET_LOCALES).length;
      continue;
    }

    for (const [field, locale] of Object.entries(TARGET_LOCALES) as Array<[TargetField, string]>) {
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
          locale,
          value: target,
          source,
          description: entry.description ?? null,
          issues: validation.issues,
        });
      }
    }
  }

  return {
    mode: "source-preservation",
    entries: Object.keys(entries).length,
    checkedTranslations,
    skippedTranslations,
    invalidEntries,
  };
}

function evaluateExtractedTranslations(value: unknown[], path: string) {
  const invalidEntries: InvalidEntry[] = [];
  let checkedTranslations = 0;
  let skippedTranslations = 0;

  for (const [index, entry] of value.entries()) {
    if (!entry || typeof entry !== "object") {
      throw new Error(`${path}[${index}] must be an object`);
    }

    const translation = entry as ExtractedTranslationEntry;

    if (typeof translation.translatedContent !== "string") {
      skippedTranslations += 1;
      continue;
    }

    checkedTranslations += 1;

    const validation = validateMarkdown(translation.translatedContent);

    if (!validation.isValid) {
      invalidEntries.push({
        id: String(index),
        field: "translatedContent",
        locale: typeof translation.sk === "string" ? translation.sk : null,
        value: translation.translatedContent,
        description: null,
        issues: validation.issues,
      });
    }
  }

  return {
    mode: "parse-only",
    entries: value.length,
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
  result: ReturnType<typeof evaluateMarkdownFile>,
  maxReports: number,
): void {
  console.log("Markdown validation");
  console.log(`File: ${filePath}`);
  console.log(`Mode: ${result.mode}`);
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
