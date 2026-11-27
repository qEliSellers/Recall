import { z } from "zod";

const identifier = z.string().min(1).max(100);
const text = z.string().min(1).max(20000);
const option = z.object({ id: identifier, text: text.max(2000) }).strict();
const common = {
  prompt: text,
  explanation: z.string().max(20000).optional(),
  imageUrl: z
    .string()
    .max(2000)
    .refine(
      (value) =>
        /^https:\/\/[^\s]+$/.test(value) ||
        /^\/api\/media\/[A-Za-z0-9_.-]+$/.test(value),
      "Use an HTTPS image URL or an uploaded media path",
    )
    .optional(),
  imageAlt: z.string().max(500).optional(),
  variants: z
    .array(
      z
        .object({
          id: identifier,
          prompt: text,
          componentPrompts: z.record(z.string(), text).optional(),
        })
        .strict(),
    )
    .max(30)
    .optional(),
};
const choices = {
  options: z.array(option).min(2).max(60),
  correctOptionIds: z.array(identifier).min(1).max(30),
  optionCount: z.number().int().min(2).max(60).optional(),
};
const component = z
  .object({
    id: identifier,
    prompt: text,
    ...choices,
    explanation: z.string().max(10000).optional(),
  })
  .strict();

const questionUnion = z.discriminatedUnion("type", [
  z
    .object({ type: z.literal("multiple_choice"), ...common, ...choices })
    .strict(),
  z.object({ type: z.literal("true_false"), ...common, ...choices }).strict(),
  z
    .object({ type: z.literal("multiple_select"), ...common, ...choices })
    .strict(),
  z
    .object({
      type: z.literal("cloze"),
      ...common,
      components: z.array(component).min(1).max(20),
    })
    .strict(),
  z
    .object({
      type: z.literal("matching"),
      ...common,
      pairs: z
        .array(
          z
            .object({
              id: identifier,
              left: text.max(2000),
              right: text.max(2000),
            })
            .strict(),
        )
        .min(2)
        .max(30),
    })
    .strict(),
  z
    .object({
      type: z.literal("sequencing"),
      ...common,
      items: z.array(option).min(2).max(30),
    })
    .strict(),
  z
    .object({
      type: z.literal("typed"),
      ...common,
      answer: z.string().min(1).max(400),
      grading: z.enum(["numeric", "expression", "manual"]).default("numeric"),
      tolerance: z.number().min(0).max(1e9).optional(),
      variables: z
        .array(z.string().regex(/^[A-Za-z]$/))
        .max(10)
        .optional(),
    })
    .strict(),
]);

const normalized = (value: string) =>
  value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
const unique = (values: string[]) => new Set(values).size === values.length;

export const questionSchema = questionUnion.superRefine((value, context) => {
  const issue = (message: string, path: (string | number)[] = []) =>
    context.addIssue({ code: "custom", message, path });
  const checkChoices = (
    data:
      | z.infer<typeof component>
      | Extract<z.infer<typeof questionUnion>, { options: unknown }>,
    path: (string | number)[] = [],
  ) => {
    if (!unique(data.options.map((x) => x.id)))
      issue("Option IDs must be unique", [...path, "options"]);
    if (!unique(data.options.map((x) => normalized(x.text))))
      issue("Answer choices must have distinct text", [...path, "options"]);
    if (!unique(data.correctOptionIds))
      issue("Correct option IDs must be unique", [...path, "correctOptionIds"]);
    if (
      data.correctOptionIds.some((id) => !data.options.some((x) => x.id === id))
    )
      issue("Every correct option must exist", [...path, "correctOptionIds"]);
    if (
      data.optionCount !== undefined &&
      data.optionCount <= data.correctOptionIds.length
    )
      issue("Option count must include every correct option and a distractor", [
        ...path,
        "optionCount",
      ]);
    if (data.correctOptionIds.length === data.options.length)
      issue("Include at least one incorrect option", [...path, "options"]);
  };
  if ("options" in value) {
    checkChoices(value);
    if (value.type !== "multiple_select" && value.correctOptionIds.length !== 1)
      issue("Single-choice questions require exactly one correct option", [
        "correctOptionIds",
      ]);
    if (value.type === "true_false" && value.options.length !== 2)
      issue("True/false requires exactly two options", ["options"]);
  }
  if (value.type === "cloze") {
    if (!unique(value.components.map((x) => x.id)))
      issue("Component IDs must be unique", ["components"]);
    value.components.forEach((part, index) => {
      checkChoices(part, ["components", index]);
      if (part.correctOptionIds.length !== 1)
        issue("Each cloze blank requires exactly one correct option", [
          "components",
          index,
          "correctOptionIds",
        ]);
    });
  }
  if (value.type === "matching") {
    if (!unique(value.pairs.map((x) => x.id)))
      issue("Pair IDs must be unique", ["pairs"]);
    if (
      !unique(value.pairs.map((x) => normalized(x.left))) ||
      !unique(value.pairs.map((x) => normalized(x.right)))
    )
      issue("Matching labels must be distinct on both sides", ["pairs"]);
  }
  if (
    value.type === "sequencing" &&
    (!unique(value.items.map((x) => x.id)) ||
      !unique(value.items.map((x) => normalized(x.text))))
  )
    issue("Sequence items must have distinct IDs and text", ["items"]);
  if (value.variants && !unique(value.variants.map((x) => x.id)))
    issue("Variant IDs must be unique", ["variants"]);
  if (value.imageUrl && !value.imageAlt?.trim())
    issue("Provide alternative text for the image", ["imageAlt"]);
});

export type QuestionContent = z.infer<typeof questionSchema>;
export type QuestionType = QuestionContent["type"];
export type PresentedOption = { id: string; text: string };
export type PresentedComponent = {
  id: string;
  kind: "single" | "multiple" | "sequence" | "typed";
  prompt: string;
  options?: PresentedOption[];
  gradingMode?: "numeric" | "expression" | "manual";
};
export type QuestionPresentation = {
  type: QuestionType;
  prompt: string;
  variantId: string | null;
  imageUrl?: string;
  imageAlt?: string;
  components: PresentedComponent[];
};
export type ComponentAnswerKey = {
  id: string;
  sourceId: string;
  kind: PresentedComponent["kind"];
  correct: string[] | string;
  expectedText: string[];
  explanation?: string;
  gradingMode?: "numeric" | "expression" | "manual";
  tolerance?: number;
  variables?: string[];
};
export type AnswerKey = {
  type: QuestionType;
  variantId: string | null;
  components: ComponentAnswerKey[];
  explanation?: string;
};
export type PreparedQuestion = {
  presentation: QuestionPresentation;
  answerKey: AnswerKey;
};
export const questionResponseSchema = z
  .object({
    answers: z.record(
      z.string().max(100),
      z.union([z.string().max(1000), z.array(z.string().max(1000)).max(60)]),
    ),
    manualCorrect: z.boolean().optional(),
  })
  .strict();
export type QuestionResponse = z.infer<typeof questionResponseSchema>;
export type ComponentResult = {
  id: string;
  sourceId: string;
  correct: boolean | null;
  submitted: string | string[];
  expected: string[];
  explanation?: string;
  reason?: string;
};
export type GradeResult = {
  correct: boolean | null;
  requiresManual: boolean;
  components: ComponentResult[];
  explanation?: string;
};
