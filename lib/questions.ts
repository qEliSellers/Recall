import { gradeMathAnswer } from "./math";
import { questionResponseSchema, questionSchema } from "./types";
import type {
  AnswerKey,
  ComponentAnswerKey,
  GradeResult,
  PreparedQuestion,
  PresentedComponent,
  QuestionContent,
  QuestionResponse,
} from "./types";

export type PrepareOptions = {
  random?: () => number;
  variantId?: string | null;
};

export function shuffled<T>(
  items: readonly T[],
  random: () => number = Math.random,
): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const sample = random();
    if (!Number.isFinite(sample) || sample < 0 || sample >= 1)
      throw new Error("Random source must return a number in [0, 1)");
    const destination = Math.floor(sample * (index + 1));
    [result[index], result[destination]] = [result[destination], result[index]];
  }
  return result;
}

/** The answerKey is a private server snapshot. Never include it in a study response. */
export function prepareQuestion(
  input: unknown,
  settings: PrepareOptions = {},
): PreparedQuestion {
  const content = questionSchema.parse(input);
  const random = settings.random ?? Math.random;
  const variants = content.variants ?? [];
  const variant =
    settings.variantId === undefined
      ? shuffled([null, ...variants], random)[0]
      : settings.variantId === null
        ? null
        : variants.find((item) => item.id === settings.variantId);
  if (settings.variantId && !variant)
    throw new Error(`Unknown question variant: ${settings.variantId}`);
  const publicComponents: PresentedComponent[] = [];
  const privateComponents: ComponentAnswerKey[] = [];
  const componentPrompt = (sourceId: string, fallback: string) =>
    variant?.componentPrompts?.[sourceId] ?? fallback;

  const addChoices = (
    sourceId: string,
    prompt: string,
    options: { id: string; text: string }[],
    correctOptionIds: string[],
    multiple: boolean,
    optionCount?: number,
    explanation?: string,
  ) => {
    const id = `c${publicComponents.length + 1}`;
    const correct = options.filter((item) =>
      correctOptionIds.includes(item.id),
    );
    const distractors = shuffled(
      options.filter((item) => !correctOptionIds.includes(item.id)),
      random,
    );
    const count = Math.min(
      options.length,
      optionCount ?? (multiple ? options.length : 4),
    );
    const selected = shuffled(
      [
        ...correct,
        ...distractors.slice(0, Math.max(1, count - correct.length)),
      ],
      random,
    );
    const mapped = selected.map((item, index) => ({
      id: `${id}-o${index + 1}`,
      text: item.text,
      sourceId: item.id,
    }));
    publicComponents.push({
      id,
      kind: multiple ? "multiple" : "single",
      prompt: componentPrompt(sourceId, prompt),
      options: mapped.map(({ id, text }) => ({ id, text })),
    });
    privateComponents.push({
      id,
      sourceId,
      kind: multiple ? "multiple" : "single",
      correct: mapped
        .filter((item) => correctOptionIds.includes(item.sourceId))
        .map((item) => item.id),
      expectedText: correct.map((item) => item.text),
      ...(explanation ? { explanation } : {}),
    });
  };

  switch (content.type) {
    case "multiple_choice":
    case "multiple_select":
    case "true_false":
      addChoices(
        "main",
        "",
        content.options,
        content.correctOptionIds,
        content.type === "multiple_select",
        content.optionCount,
      );
      break;
    case "cloze":
      content.components.forEach((part) =>
        addChoices(
          part.id,
          part.prompt,
          part.options,
          part.correctOptionIds,
          false,
          part.optionCount,
          part.explanation,
        ),
      );
      break;
    case "matching": {
      const right = shuffled(content.pairs, random).map((pair, index) => ({
        id: `match-${index + 1}`,
        text: pair.right,
        sourceId: pair.id,
      }));
      content.pairs.forEach((pair, index) => {
        const id = `c${index + 1}`;
        publicComponents.push({
          id,
          kind: "single",
          prompt: componentPrompt(pair.id, pair.left),
          options: right.map(({ id, text }) => ({ id, text })),
        });
        privateComponents.push({
          id,
          sourceId: pair.id,
          kind: "single",
          correct: [right.find((option) => option.sourceId === pair.id)!.id],
          expectedText: [pair.right],
        });
      });
      break;
    }
    case "sequencing": {
      const items = shuffled(content.items, random).map((item, index) => ({
        id: `sequence-${index + 1}`,
        text: item.text,
        sourceId: item.id,
      }));
      publicComponents.push({
        id: "c1",
        kind: "sequence",
        prompt: "",
        options: items.map(({ id, text }) => ({ id, text })),
      });
      privateComponents.push({
        id: "c1",
        sourceId: "main",
        kind: "sequence",
        correct: content.items.map(
          (item) => items.find((option) => option.sourceId === item.id)!.id,
        ),
        expectedText: content.items.map((item) => item.text),
      });
      break;
    }
    case "typed":
      publicComponents.push({
        id: "c1",
        kind: "typed",
        prompt: "",
        gradingMode: content.grading,
      });
      privateComponents.push({
        id: "c1",
        sourceId: "main",
        kind: "typed",
        correct: content.answer,
        expectedText: [content.answer],
        gradingMode: content.grading,
        ...(content.tolerance !== undefined
          ? { tolerance: content.tolerance }
          : {}),
        ...(content.variables ? { variables: content.variables } : {}),
      });
      break;
  }
  return {
    presentation: {
      type: content.type,
      prompt: variant?.prompt ?? content.prompt,
      variantId: variant?.id ?? null,
      ...(content.imageUrl
        ? { imageUrl: content.imageUrl, imageAlt: content.imageAlt }
        : {}),
      components: publicComponents,
    },
    answerKey: {
      type: content.type,
      variantId: variant?.id ?? null,
      components: privateComponents,
      ...(content.explanation ? { explanation: content.explanation } : {}),
    },
  };
}

function sameSet(actual: string[], expected: string[]) {
  return (
    actual.length === expected.length &&
    new Set(actual).size === actual.length &&
    expected.every((item) => actual.includes(item))
  );
}

/** Call only after submission. This response intentionally includes answers. */
export function gradeQuestion(
  answerKey: AnswerKey,
  input: unknown,
): GradeResult {
  const response: QuestionResponse = questionResponseSchema.parse(input);
  const knownIds = new Set(
    answerKey.components.map((component) => component.id),
  );
  if (Object.keys(response.answers).some((id) => !knownIds.has(id)))
    throw new Error("Response contains an unknown component");
  const components = answerKey.components.map((component) => {
    const submitted = response.answers[component.id] ?? "";
    let correct: boolean | null = false;
    let reason: string | undefined;
    if (component.kind === "typed") {
      if (typeof submitted === "string" && submitted.trim()) {
        const result = gradeMathAnswer(submitted, String(component.correct), {
          mode: component.gradingMode,
          tolerance: component.tolerance,
          variables: component.variables,
        });
        correct = result.correct;
        reason = result.reason;
        if (result.requiresManual && response.manualCorrect !== undefined)
          correct = response.manualCorrect;
      }
    } else if (Array.isArray(component.correct)) {
      const actual = typeof submitted === "string" ? [submitted] : submitted;
      correct =
        component.kind === "sequence"
          ? actual.length === component.correct.length &&
            component.correct.every((item, index) => actual[index] === item)
          : sameSet(actual, component.correct);
    }
    return {
      id: component.id,
      sourceId: component.sourceId,
      correct,
      submitted,
      expected: component.expectedText,
      ...(component.explanation ? { explanation: component.explanation } : {}),
      ...(reason ? { reason } : {}),
    };
  });
  const requiresManual = components.some(
    (component) => component.correct === null,
  );
  const correct = components.some((component) => component.correct === false)
    ? false
    : requiresManual
      ? null
      : true;
  return {
    correct,
    requiresManual,
    components,
    ...(answerKey.explanation ? { explanation: answerKey.explanation } : {}),
  };
}

/** Reveal one submitted cloze phase without revealing later phases or the overall explanation.
 * The service layer must enforce sequential phase access and keep the first submitted answer. */
export function gradePhase(
  answerKey: AnswerKey,
  componentId: string,
  answer: string,
): GradeResult {
  if (answerKey.type !== "cloze")
    throw new Error("Phase feedback is only supported for cloze questions");
  const component = answerKey.components.find(
    (item) => item.id === componentId,
  );
  if (!component) throw new Error("Unknown cloze component");
  return gradeQuestion(
    { type: "cloze", variantId: answerKey.variantId, components: [component] },
    { answers: { [componentId]: answer } },
  );
}

/** Each returned content object must be imported as a separate card to receive its own schedule.
 * The author should review surrounding text for inadvertent hints before importing. */
export function splitCloze(input: unknown): QuestionContent[] {
  const content = questionSchema.parse(input);
  if (content.type !== "cloze")
    throw new Error("Only cloze questions can be split");
  return content.components.map((component) => ({
    ...content,
    components: [component],
  }));
}

export { questionSchema, questionResponseSchema } from "./types";
export type {
  AnswerKey,
  GradeResult,
  PreparedQuestion,
  QuestionContent,
  QuestionPresentation,
  QuestionResponse,
} from "./types";
