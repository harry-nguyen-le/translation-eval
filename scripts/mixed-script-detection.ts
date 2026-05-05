import { readFileSync } from "node:fs";

import {
  checkIcuTranslationForMixedScripts,
  checkTextForMixedScripts,
  type ScriptIssue,
} from "../src/mixed-script-detection/index";

type TranslationField = keyof typeof TRANSLATION_LOCALES;

type MasterTranslationEntry = {
  description?: unknown;
} & Partial<Record<TranslationField, string | null>>;

type MasterTranslations = Record<string, MasterTranslationEntry>;

type ExtractedTranslationEntry = {
  sk?: string | null;
  translatedContent?: string | null;
};

type EvaluationIssue = ScriptIssue & {
  id: string;
  field: string;
  locale: string;
};

type EvaluationError = {
  id: string;
  field: string;
  locale: string;
  error: string;
};

type InvalidEntry = {
  id: string;
  field: string;
  locale: string;
  value: string;
  description: unknown;
  issueCount: number;
  unexpectedScripts: string[];
  unexpectedChars: string[];
};

const TRANSLATION_LOCALES = {
  english: "en",
  french: "fr",
  german: "de",
} as const;

const DEFAULT_FILE = "translation-data/cp-static-translations.json";
const DEFAULT_MAX_REPORTS = 50;

const args = parseArgs(process.argv.slice(2));
const filePath = args.filePath ?? DEFAULT_FILE;
const maxReports = args.maxReports ?? DEFAULT_MAX_REPORTS;

const rawTranslations = readJsonFile(filePath);
const result = evaluateMixedScriptFile(rawTranslations, filePath);

printSummary(filePath, result, maxReports);

if (result.issues.length > 0 || result.errors.length > 0) {
  process.exitCode = 1;
}

function evaluateMixedScriptFile(value: unknown, path: string) {
  if (Array.isArray(value)) {
    return evaluateExtractedTranslations(value, path);
  }

  return evaluateStaticTranslations(assertMasterTranslations(value, path));
}

function evaluateStaticTranslations(translations: MasterTranslations) {
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

      checkedTranslations += evaluateMessage({
        id,
        field,
        locale,
        message,
        description: entry.description ?? null,
        invalidEntries,
        issues,
        errors,
      });
    }
  }

  return {
    mode: "static-translations",
    entries: Object.keys(translations).length,
    checkedTranslations,
    skippedNullTranslations,
    invalidEntries,
    issues,
    errors,
  };
}

function evaluateExtractedTranslations(value: unknown[], path: string) {
  const issues: EvaluationIssue[] = [];
  const invalidEntries: InvalidEntry[] = [];
  const errors: EvaluationError[] = [];
  let checkedTranslations = 0;
  let skippedNullTranslations = 0;

  for (const [index, entry] of value.entries()) {
    if (!entry || typeof entry !== "object") {
      errors.push({
        id: String(index),
        field: "translatedContent",
        locale: "unknown",
        error: `${path}[${index}] must be an object`,
      });
      continue;
    }

    const translation = entry as ExtractedTranslationEntry;
    const locale = typeof translation.sk === "string" ? translation.sk : "unknown";

    if (translation.translatedContent === null || translation.translatedContent === undefined) {
      skippedNullTranslations += 1;
      continue;
    }

    if (typeof translation.translatedContent !== "string") {
      errors.push({
        id: String(index),
        field: "translatedContent",
        locale,
        error: "Expected translatedContent to be a string or null",
      });
      continue;
    }

    checkedTranslations += evaluateMessage({
      id: String(index),
      field: "translatedContent",
      locale,
      message: translation.translatedContent,
      description: null,
      invalidEntries,
      issues,
      errors,
    });
  }

  return {
    mode: "extracted-translations",
    entries: value.length,
    checkedTranslations,
    skippedNullTranslations,
    invalidEntries,
    issues,
    errors,
  };
}

function evaluateMessage({
  id,
  field,
  locale,
  message,
  description,
  invalidEntries,
  issues,
  errors,
}: {
  id: string;
  field: string;
  locale: string;
  message: string;
  description: unknown;
  invalidEntries: InvalidEntry[];
  issues: EvaluationIssue[];
  errors: EvaluationError[];
}): 1 {
  const check = checkMessageForMixedScripts(message, locale);

  if (!check.ok) {
    errors.push({
      id,
      field,
      locale,
      error: check.error,
    });
    return 1;
  }

  if (check.issues.length > 0) {
    invalidEntries.push({
      id,
      field,
      locale,
      value: message,
      description,
      issueCount: check.issues.length,
      unexpectedScripts: uniqueSorted(check.issues.map((issue) => String(issue.script))),
      unexpectedChars: uniqueSorted(check.issues.map((issue) => issue.char)),
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

  return 1;
}

function checkMessageForMixedScripts(
  message: string,
  locale: string,
): { ok: true; issues: ScriptIssue[] } | { ok: false; error: string } {
  try {
    return {
      ok: true,
      issues: checkIcuTranslationForMixedScripts(message, locale).issues,
    };
  } catch (error) {
    const jsonStrings = collectJsonStringValues(message);

    if (jsonStrings.length > 0) {
      return {
        ok: true,
        issues: checkTextForMixedScripts(jsonStrings.join("\n"), locale).issues,
      };
    }

    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function collectJsonStringValues(input: string): string[] {
  try {
    return collectStringValues(JSON.parse(input));
  } catch {
    return [];
  }
}

function collectStringValues(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap(collectStringValues);
  }

  if (value && typeof value === "object") {
    return Object.values(value).flatMap(collectStringValues);
  }

  return [];
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
  result: ReturnType<typeof evaluateMixedScriptFile>,
  maxReports: number,
): void {
  console.log("Mixed script detection");
  console.log(`File: ${filePath}`);
  console.log(`Mode: ${result.mode}`);
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
    },
    null,
    2,
  );
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}
