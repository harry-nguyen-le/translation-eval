import { readFileSync } from "node:fs";

import {
  validateIcuPluralSelectors,
  validateIcuSyntaxPreservation,
} from "../src/icu-syntax-preservation/index";
import type { IcuSyntaxPreservationIssue } from "../src/icu-syntax-preservation/index";

type TargetField = "french" | "german";

type MasterTranslationEntry = {
  description?: unknown;
  english?: string | null;
} & Partial<Record<TargetField, string | null>>;

type MasterTranslations = Record<string, MasterTranslationEntry>;

type ExtractedTranslationEntry = {
  sk?: string | null;
  translatedContent?: string | null;
};

type InvalidEntry = {
  id: string;
  field: string;
  locale: string | null;
  description: unknown;
  source?: string;
  value: string;
  issues: IcuSyntaxPreservationIssue[];
};

const TARGET_FIELDS = ["french", "german"] as const satisfies readonly TargetField[];
const DEFAULT_FILE = "translation-data/cp-static-translations.json";
const DEFAULT_MAX_REPORTS = 50;

const args = parseArgs(process.argv.slice(2));
const filePath = args.filePath ?? DEFAULT_FILE;
const maxReports = args.maxReports ?? DEFAULT_MAX_REPORTS;

const rawTranslations = readJsonFile(filePath);
const result = evaluateIcuSyntaxFile(rawTranslations, filePath);

printSummary(filePath, result, maxReports);

if (result.invalidEntries.length > 0) {
  process.exitCode = 1;
}

function evaluateIcuSyntaxFile(value: unknown, path: string) {
  if (Array.isArray(value)) {
    return evaluateExtractedTranslations(value, path);
  }

  return evaluateStaticTranslations(assertMasterTranslations(value, path));
}

function evaluateStaticTranslations(translations: MasterTranslations) {
  const invalidEntries: InvalidEntry[] = [];
  let checkedTranslations = 0;
  let skippedTranslations = 0;

  for (const [id, entry] of Object.entries(translations)) {
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

      const validation = validateIcuSyntaxPreservation(source, target);

      if (!validation.isValid) {
        invalidEntries.push({
          id,
          field,
          locale: field,
          description: entry.description ?? null,
          source,
          value: target,
          issues: validation.issues,
        });
      }
    }
  }

  return {
    mode: "source-preservation",
    entries: Object.keys(translations).length,
    checkedTranslations,
    skippedTranslations,
    invalidEntries,
  };
}

function evaluateExtractedTranslations(value: unknown[], path: string) {
  const invalidEntries: InvalidEntry[] = [];
  let checkedTranslations = 0;
  let skippedTranslations = 0;
  let parseErrors = 0;

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

    const validation = validateIcuPluralSelectors(translation.translatedContent);
    const pluralSelectorIssues = validation.issues.filter(
      (issue) => issue.code === "invalid_plural_selector",
    );

    if (validation.issues.some((issue) => issue.code === "parse_error")) {
      parseErrors += 1;
    }

    if (pluralSelectorIssues.length > 0) {
      invalidEntries.push({
        id: String(index),
        field: "translatedContent",
        locale: typeof translation.sk === "string" ? translation.sk : null,
        value: translation.translatedContent,
        description: null,
        issues: pluralSelectorIssues,
      });
    }
  }

  return {
    mode: "plural-selector-parse-only",
    entries: value.length,
    checkedTranslations,
    skippedTranslations,
    parseErrors,
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

function assertMasterTranslations(value: unknown, path: string): MasterTranslations {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} must contain a JSON object keyed by translation id`);
  }

  return value as MasterTranslations;
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
  result: ReturnType<typeof evaluateIcuSyntaxFile>,
  maxReports: number,
): void {
  console.log("ICU syntax preservation");
  console.log(`File: ${filePath}`);
  console.log(`Mode: ${result.mode}`);
  console.log(`Entries: ${result.entries}`);
  console.log(`Checked translations: ${result.checkedTranslations}`);
  console.log(`Skipped translations: ${result.skippedTranslations}`);
  if ("parseErrors" in result) {
    console.log(`Parse errors skipped: ${result.parseErrors}`);
  }
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
