import type { ImportKind } from "../lib/import-format";
import { MAX_IMPORT_BYTES, MAX_IMPORT_ITEMS } from "../lib/import-limits";

type ImportOptions = {
  format: "json" | "csv";
  kind: ImportKind;
  courseId: string;
  defaultUnitId: string;
};

export const CSV_HEADER =
  "external_id,unit_id,unit_name,prompt,option_a,option_b,option_c,option_d,answer,explanation,skills";
const csvFields = CSV_HEADER.split(",");
const problemFields = ["difficulty", "hint", "solution"];

export function isTooLarge(value: string) {
  return new TextEncoder().encode(value).byteLength > MAX_IMPORT_BYTES;
}

function csvRecords(source: string) {
  const records: { line: number; cells: string[] }[] = [];
  let line = 1;
  let start = 1;
  let cells: string[] = [];
  let field = "";
  let state: "start" | "plain" | "quoted" | "closed" = "start";
  let onlyWhitespace = true;
  function endField() {
    cells.push(field);
    field = "";
    state = "start";
  }
  function endRecord() {
    endField();
    if (!onlyWhitespace) records.push({ line: start, cells });
    if (records.length > MAX_IMPORT_ITEMS + 1)
      throw new Error(
        `CSV files can contain up to ${MAX_IMPORT_ITEMS} data rows.`,
      );
    cells = [];
    onlyWhitespace = true;
  }
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    const newline = char === "\r" || char === "\n";
    if (newline && char === "\r" && source[i + 1] === "\n") i++;
    if (state === "quoted") {
      if (char === '"' && source[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') state = "closed";
      else field += newline ? "\n" : char;
    } else if (newline) {
      endRecord();
      start = line + 1;
    } else if (char === ",") {
      onlyWhitespace = false;
      endField();
    } else {
      if (!/\s/.test(char)) onlyWhitespace = false;
      if (state === "closed")
        throw new Error(
          `CSV line ${line}: expected a comma or line break after the closing quote.`,
        );
      if (char === '"') {
        if (state !== "start")
          throw new Error(
            `CSV line ${line}: a quote inside an unquoted field must be escaped in a quoted field.`,
          );
        state = "quoted";
      } else {
        field += char;
        state = "plain";
      }
    }
    if (newline) line++;
  }
  if (state === "quoted")
    throw new Error(
      `CSV record starting on line ${start} has an unclosed quote.`,
    );
  endRecord();
  return records;
}

function parseCsv(source: string, kind: ImportKind) {
  const [header, ...records] = csvRecords(source);
  if (!header || !records.length)
    throw new Error("CSV needs a header and at least one data row.");
  const columns = header.cells.map((value) => value.trim().toLowerCase());
  if (new Set(columns).size !== columns.length)
    throw new Error(`CSV line ${header.line}: column names must be unique.`);
  const supported = new Set(
    kind === "problems" ? [...csvFields, ...problemFields] : csvFields,
  );
  for (const column of columns)
    if (!supported.has(column))
      throw new Error(`CSV line ${header.line}: unknown column “${column}”.`);
  for (const required of ["prompt", "option_a", "option_b", "answer"])
    if (!columns.includes(required))
      throw new Error(`CSV is missing the ${required} column.`);

  return records.map(({ line, cells }) => {
    if (cells.length !== columns.length)
      throw new Error(
        `CSV line ${line}: expected ${columns.length} fields, got ${cells.length}.`,
      );
    const row = Object.fromEntries(
      columns.map((column, index) => [column, cells[index].trim()]),
    );
    if (!row.prompt || !row.option_a || !row.option_b || !row.answer)
      throw new Error(
        `CSV line ${line}: prompt, option_a, option_b, and answer are required.`,
      );
    const options = ["a", "b", "c", "d"].flatMap((id) => {
      const text = row[`option_${id}`];
      return text ? [{ id, text }] : [];
    });
    const matches = options.filter(({ text }) => text === row.answer);
    if (matches.length !== 1)
      throw new Error(
        `CSV line ${line}: answer must match exactly one option’s text.`,
      );
    if (row.unit_id && row.unit_name)
      throw new Error(`CSV line ${line}: use either unit_id or unit_name.`);
    if (row.difficulty && !/^[1-5]$/.test(row.difficulty))
      throw new Error(
        `CSV line ${line}: difficulty must be an integer from 1 to 5.`,
      );
    return {
      externalId: row.external_id || undefined,
      unitId: row.unit_id || undefined,
      unitName: row.unit_name || undefined,
      skills: row.skills
        ?.split(";")
        .map((skill) => skill.trim())
        .filter(Boolean),
      content: {
        type: "multiple_choice",
        prompt: row.prompt,
        options,
        correctOptionIds: [matches[0].id],
        explanation: row.explanation || undefined,
      },
      ...(kind === "problems"
        ? {
            difficulty: row.difficulty ? Number(row.difficulty) : undefined,
            hint: row.hint || undefined,
            solution: row.solution || undefined,
          }
        : {}),
    };
  });
}

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

// JSON.parse checks syntax first. Scan property names so repeated keys cannot
// silently replace a destination, correct answer, or entire array.
function rejectDuplicateKeys(source: string) {
  const keys: Set<string>[] = [];
  for (const match of source.matchAll(/"(?:[^"\\]|\\.)*"(\s*:)?|[{}]/g)) {
    if (match[0] === "{") keys.push(new Set());
    else if (match[0] === "}") keys.pop();
    else if (match[1]) {
      const key = JSON.parse(match[0].slice(0, -match[1].length)) as string;
      const current = keys.at(-1)!;
      if (current.has(key)) {
        const line = source.slice(0, match.index).split(/\r\n|\r|\n/).length;
        throw new Error(`JSON line ${line}: duplicate field “${key}”.`);
      }
      current.add(key);
    }
  }
}

function jsonFile(source: string, kind: ImportKind) {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch (error) {
    throw new Error(
      error instanceof SyntaxError
        ? `Invalid JSON. ${error.message}`
        : "Invalid JSON.",
    );
  }
  rejectDuplicateKeys(source);
  if (Array.isArray(value)) return { [kind]: value };
  if (!object(value))
    throw new Error(
      "Use a JSON object with cards or problems, or a plain array of entries.",
    );
  if (Object.hasOwn(value, "action")) {
    const actionKind =
      value.action === "cards.import"
        ? "cards"
        : value.action === "problems.import"
          ? "problems"
          : null;
    if (
      !actionKind ||
      !object(value.input) ||
      Object.keys(value).length !== 2 ||
      !Array.isArray(value.input[actionKind]) ||
      Object.hasOwn(value.input, actionKind === "cards" ? "problems" : "cards")
    )
      throw new Error(
        "This API envelope must contain cards.import or problems.import and its matching input.",
      );
    value = value.input;
  }
  if (!object(value)) throw new Error("Invalid JSON import object.");
  const keys = [
    "version",
    "batchId",
    "courseId",
    "unitId",
    "unitName",
    "cards",
    "problems",
  ];
  for (const key of Object.keys(value))
    if (!keys.includes(key))
      throw new Error(`Unknown JSON file field “${key}”.`);
  if (Object.hasOwn(value, "version")) {
    if (value.version !== 1)
      throw new Error("Unsupported import version. Use version 1.");
    if (!Object.hasOwn(value, "batchId"))
      throw new Error("Version 1 files require a batchId.");
  }
  return value;
}

export function buildImportInput(source: string, options: ImportOptions) {
  if (isTooLarge(source))
    throw new Error("Choose a file under 8 MiB or split this batch.");
  const text = source.replace(/^\uFEFF/, "");
  const file =
    options.format === "csv"
      ? { [options.kind]: parseCsv(text, options.kind) }
      : jsonFile(text, options.kind);
  const { version: _version, courseId, ...input } = file;
  if (Object.hasOwn(file, "courseId") && courseId !== options.courseId)
    throw new Error("This file’s courseId does not match the open course.");
  const useSelectedUnit =
    options.defaultUnitId &&
    !Object.hasOwn(file, "unitId") &&
    !Object.hasOwn(file, "unitName");
  const output = {
    ...input,
    courseId: options.courseId,
    ...(useSelectedUnit ? { unitId: options.defaultUnitId } : {}),
  };
  if (
    isTooLarge(
      JSON.stringify({
        action: "library.import",
        input: { ...output, previewKey: "0".repeat(64) },
      }),
    )
  )
    throw new Error(
      "This file expands past the 8 MiB upload limit. Split it into smaller batches.",
    );
  return output;
}
