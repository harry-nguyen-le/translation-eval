import { readFileSync } from "node:fs";

import {
  extractRawJsonStringFieldsByObjectKey,
  validateEscapeCharacterPreservation,
} from "../src/escape-character-preservation/index";
import type { EscapeCharacterPreservationIssue } from "../src/escape-character-preservation/index";

type TargetField = "french" | "german";
type TranslationField = "english" | TargetField;

type MasterTranslationEntry = {
  description?: unknown;
  english?: string | null;
} & Partial<Record<TargetField, string | null>>;

type MasterTranslations = Record<string, MasterTranslationEntry>;
type RawTranslationFields = Partial<Record<TranslationField, string>>;

type InvalidEntry = {
  id: string;
  field: TargetField;
  description: unknown;
  source: string;
  target: string;
  sourceRaw: string;
  targetRaw: string;
  issues: EscapeCharacterPreservationIssue[];
};

const TARGET_FIELDS = ["french", "german"] as const satisfies readonly TargetField[];
const TRANSLATION_FIELDS = [
  "english",
  "french",
  "german",
] as const satisfies readonly TranslationField[];
const DEFAULT_FILE = "master-translations.json";
const DEFAULT_MAX_REPORTS = 50;

const args = parseArgs(process.argv.slice(2));
const filePath = args.filePath ?? DEFAULT_FILE;
const maxReports = args.maxReports ?? DEFAULT_MAX_REPORTS;

const rawJson = readFileSync(filePath, "utf8");
const rawTranslations = readJson(rawJson, filePath);
const translations = assertMasterTranslations(rawTranslations, filePath);
const rawFieldsById = extractRawJsonStringFieldsByObjectKey(rawJson, TRANSLATION_FIELDS);
const result = evaluateTranslations(translations, rawFieldsById);

printSummary(filePath, result, maxReports);

if (result.invalidEntries.length > 0) {
  process.exitCode = 1;
}

function evaluateTranslations(
  translations: MasterTranslations,
  rawFieldsById: Map<string, RawTranslationFields>,
) {
  const invalidEntries: InvalidEntry[] = [];
  let checkedTranslations = 0;
  let skippedTranslations = 0;

  for (const [id, entry] of Object.entries(translations)) {
    const source = entry.english;
    const sourceRaw = rawFieldsById.get(id)?.english;

    if (typeof source !== "string" || typeof sourceRaw !== "string") {
      skippedTranslations += TARGET_FIELDS.length;
      continue;
    }

    for (const field of TARGET_FIELDS) {
      const target = entry[field];
      const targetRaw = rawFieldsById.get(id)?.[field];

      if (typeof target !== "string" || typeof targetRaw !== "string") {
        skippedTranslations += 1;
        continue;
      }

      checkedTranslations += 1;

      const issues = validateEscapeCharacterPreservation(sourceRaw, targetRaw);

      if (issues.length > 0) {
        invalidEntries.push({
          id,
          field,
          description: entry.description ?? null,
          source,
          target,
          sourceRaw,
          targetRaw,
          issues,
        });
      }
    }
  }

  return {
    entries: Object.keys(translations).length,
    checkedTranslations,
    skippedTranslations,
    invalidEntries,
  };
}

function readJson(rawJson: string, path: string): unknown {
  try {
    return JSON.parse(rawJson);
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
  console.log("Escape character preservation");
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
