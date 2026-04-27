import { readFileSync } from "node:fs";

import {
  checkIcuTranslationForMixedScripts,
  type ScriptIssue,
} from "../src/mixed-script-detection/index";

type TranslationField = keyof typeof TRANSLATION_LOCALES;

type MasterTranslationEntry = {
  description?: unknown;
} & Partial<Record<TranslationField, string | null>>;

type MasterTranslations = Record<string, MasterTranslationEntry>;

type EvaluationIssue = ScriptIssue & {
  id: string;
  field: TranslationField;
  locale: string;
};

type EvaluationError = {
  id: string;
  field: TranslationField;
  locale: string;
  error: string;
};

type InvalidEntry = {
  id: string;
  field: TranslationField;
  locale: string;
  value: string;
  description: unknown;
  issueCount: number;
  unexpectedScripts: string[];
  unexpectedChars: string[];
  issues: Array<{
    char: string;
    script: ScriptIssue["script"];
    indexInSegment: number;
    path: string;
  }>;
};

const TRANSLATION_LOCALES = {
  english: "en",
  french: "fr",
  german: "de",
} as const;

const DEFAULT_FILE = "master-translations.json";
const DEFAULT_MAX_REPORTS = 50;

const args = parseArgs(process.argv.slice(2));
const filePath = args.filePath ?? DEFAULT_FILE;
const maxReports = args.maxReports ?? DEFAULT_MAX_REPORTS;

const rawTranslations = readJsonFile(filePath);
const translations = assertMasterTranslations(rawTranslations, filePath);
const result = evaluateTranslations(translations);

printSummary(filePath, result, maxReports);

if (result.issues.length > 0 || result.errors.length > 0) {
  process.exitCode = 1;
}

function evaluateTranslations(translations: MasterTranslations) {
  const issues: EvaluationIssue[] = [];
  const invalidEntries: InvalidEntry[] = [];
  const errors: EvaluationError[] = [];
  let checkedTranslations = 0;
  let skippedNullTranslations = 0;

  for (const [id, entry] of Object.entries(translations)) {
    for (const [field, locale] of Object.entries(TRANSLATION_LOCALES) as Array<
      [TranslationField, string]
    >) {
      const message = entry[field];

      if (message === null || message === undefined) {
        skippedNullTranslations += 1;
        continue;
      }

      if (typeof message !== "string") {
        errors.push({
          id,
          field,
          locale,
          error: `Expected ${field} to be a string or null`,
        });
        continue;
      }

      checkedTranslations += 1;

      try {
        const check = checkIcuTranslationForMixedScripts(message, locale);

        if (check.issues.length > 0) {
          invalidEntries.push({
            id,
            field,
            locale,
            value: message,
            description: entry.description ?? null,
            issueCount: check.issues.length,
            unexpectedScripts: uniqueSorted(check.issues.map((issue) => String(issue.script))),
            unexpectedChars: uniqueSorted(check.issues.map((issue) => issue.char)),
            issues: check.issues.map((issue) => ({
              char: issue.char,
              script: issue.script,
              indexInSegment: issue.indexInSegment,
              path: issue.path,
            })),
          });
        }

        for (const issue of check.issues) {
          issues.push({
            ...issue,
            id,
            field,
            locale,
          });
        }
      } catch (error) {
        errors.push({
          id,
          field,
          locale,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return {
    entries: Object.keys(translations).length,
    checkedTranslations,
    skippedNullTranslations,
    invalidEntries,
    issues,
    errors,
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
  result: ReturnType<typeof evaluateTranslations>,
  maxReports: number,
): void {
  console.log("Mixed script detection");
  console.log(`File: ${filePath}`);
  console.log(`Entries: ${result.entries}`);
  console.log(`Checked translations: ${result.checkedTranslations}`);
  console.log(`Skipped null translations: ${result.skippedNullTranslations}`);
  console.log(`Invalid entries: ${result.invalidEntries.length}`);
  console.log(`Unexpected script issues: ${result.issues.length}`);
  console.log(`Evaluation errors: ${result.errors.length}`);

  if (result.invalidEntries.length > 0) {
    console.log("");
    console.log(`First ${Math.min(maxReports, result.invalidEntries.length)} invalid entries:`);

    for (const entry of result.invalidEntries.slice(0, maxReports)) {
      console.log(formatInvalidEntry(entry));
    }
  }

  if (result.errors.length > 0) {
    console.log("");
    console.log(`First ${Math.min(maxReports, result.errors.length)} errors:`);

    for (const error of result.errors.slice(0, maxReports)) {
      console.log(`- ${error.id} ${error.field}/${error.locale}: ${error.error}`);
    }
  }
}

function formatInvalidEntry(entry: InvalidEntry): string {
  return JSON.stringify(
    {
      id: entry.id,
      field: entry.field,
      locale: entry.locale,
      value: entry.value,
      description: entry.description,
      issueCount: entry.issueCount,
      unexpectedScripts: entry.unexpectedScripts,
      unexpectedChars: entry.unexpectedChars,
      issues: entry.issues,
    },
    null,
    2,
  );
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}
