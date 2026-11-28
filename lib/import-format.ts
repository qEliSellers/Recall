import { z } from "zod";
import { questionSchema } from "./types";
import { MAX_IMPORT_ITEMS } from "./import-limits";

const importId = z
  .string()
  .min(1)
  .max(100)
  .refine(
    (value) => value === value.trim(),
    "IDs cannot have surrounding whitespace",
  );
const unitTarget = {
  unitId: importId.optional(),
  unitName: z.string().trim().min(1).max(200).optional(),
};
export const skillTags = z.array(z.string().trim().min(1).max(100)).max(30);

const importQuestion = questionSchema.superRefine((question, ctx) => {
  const issue = (path: (string | number)[], message: string) =>
    ctx.addIssue({ code: "custom", path, message });
  const nonblank = (value: string, path: (string | number)[]) => {
    if (!value.trim()) issue(path, "Enter nonblank text");
  };
  const choices = (
    part: { options: { text: string }[]; optionCount?: number },
    path: (string | number)[],
  ) => {
    part.options.forEach((option, n) =>
      nonblank(option.text, [...path, "options", n, "text"]),
    );
    if (
      part.optionCount !== undefined &&
      part.optionCount > part.options.length
    )
      issue(
        [...path, "optionCount"],
        "Cannot show more options than are provided",
      );
  };

  nonblank(question.prompt, ["prompt"]);
  if ("options" in question) choices(question, []);
  if (question.type === "typed") nonblank(question.answer, ["answer"]);
  if (question.type === "cloze")
    question.components.forEach((part, n) => {
      nonblank(part.prompt, ["components", n, "prompt"]);
      choices(part, ["components", n]);
    });
  if (question.type === "matching")
    question.pairs.forEach((pair, n) => {
      nonblank(pair.left, ["pairs", n, "left"]);
      nonblank(pair.right, ["pairs", n, "right"]);
    });
  if (question.type === "sequencing")
    question.items.forEach((item, n) =>
      nonblank(item.text, ["items", n, "text"]),
    );

  const promptIds =
    question.type === "cloze"
      ? question.components.map((part) => part.id)
      : question.type === "matching"
        ? question.pairs.map((pair) => pair.id)
        : "options" in question
          ? ["main"]
          : [];
  question.variants?.forEach((variant, n) => {
    nonblank(variant.prompt, ["variants", n, "prompt"]);
    for (const [key, prompt] of Object.entries(
      variant.componentPrompts ?? {},
    )) {
      const path = ["variants", n, "componentPrompts", key];
      if (!promptIds.includes(key))
        issue(path, "This component ID does not exist for this question");
      nonblank(prompt, path);
    }
  });
  if (question.imageUrl?.startsWith("https://")) {
    try {
      new URL(question.imageUrl);
    } catch {
      issue(["imageUrl"], "Enter a valid HTTPS URL");
    }
  }
});

const importCard = z
  .object({
    externalId: importId.optional(),
    ...unitTarget,
    content: importQuestion,
    skills: skillTags
      .refine(
        (values) => new Set(values).size === values.length,
        "Skill tags must be unique",
      )
      .default([]),
  })
  .strict();

export const problemFields = {
  difficulty: z.number().int().min(1).max(5).default(2),
  hint: z.string().max(10000).optional(),
  solution: z.string().max(20000).optional(),
  template: z.record(z.string(), z.unknown()).optional(),
};
const importProblem = importCard
  .extend(problemFields)
  .superRefine(({ template }, ctx) => {
    if (!template) return;
    const nodes: { value: unknown; depth: number }[] = [
      { value: template, depth: 1 },
    ];
    while (nodes.length) {
      const { value, depth } = nodes.pop()!;
      if (value === null || typeof value !== "object") continue;
      if (depth > 20) {
        ctx.addIssue({
          code: "custom",
          path: ["template"],
          message: "Keep template nesting at 20 levels or fewer",
        });
        return;
      }
      for (const child of Object.values(value))
        nodes.push({ value: child, depth: depth + 1 });
    }
  });

const targetCourse = { courseId: importId, ...unitTarget };
const cards = z.array(importCard).max(MAX_IMPORT_ITEMS);
const problems = z.array(importProblem).max(MAX_IMPORT_ITEMS);
export const cardsImportSchema = z
  .object({
    ...targetCourse,
    batchId: importId,
    cards: cards.min(1),
  })
  .strict();
export const problemsImportSchema = z
  .object({
    ...targetCourse,
    batchId: importId,
    problems: problems.min(1),
  })
  .strict();
export const libraryImportSchema = z
  .object({
    ...targetCourse,
    batchId: importId.optional(),
    previewKey: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    cards: cards.optional(),
    problems: problems.optional(),
  })
  .strict()
  .superRefine((batch, ctx) => {
    const count = (batch.cards?.length ?? 0) + (batch.problems?.length ?? 0);
    if (count < 1 || count > MAX_IMPORT_ITEMS)
      ctx.addIssue({
        code: "custom",
        message: `Include 1–${MAX_IMPORT_ITEMS} items total across cards and problems`,
      });
  });

export type LibraryImport = z.infer<typeof libraryImportSchema>;
export type ImportKind = "cards" | "problems";
export type ImportCounts = { imported: number; skipped: number };
export type ImportUnit = {
  unitId: string;
  unitName: string;
  cards: ImportCounts;
  problems: ImportCounts;
};
export type ImportResult = ImportCounts & {
  batchId: string;
  ids: string[];
  units?: ImportUnit[];
  replayed?: boolean;
  previewKey?: string;
};

export function importError(issues: z.ZodIssue[]) {
  const messages = issues.slice(0, 10).map(({ path, message }) => {
    const [kind, index, ...field] = path;
    if (
      (kind === "cards" || kind === "problems") &&
      typeof index === "number"
    ) {
      const label = kind === "cards" ? "Card" : "Problem";
      return `${label} ${index + 1}${field.length ? ` (${field.join(".")})` : ""}: ${message}`;
    }
    return path.length ? `${path.join(".")}: ${message}` : message;
  });
  if (issues.length > messages.length)
    messages.push(`+${issues.length - messages.length} more issues`);
  return messages.join("\n");
}
