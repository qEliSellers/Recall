import { describe, expect, it } from "vitest";
import {
  gradePhase,
  gradeQuestion,
  prepareQuestion,
  questionSchema,
  splitCloze,
} from "../lib/questions";
import type { PreparedQuestion, QuestionContent } from "../lib/types";

const options = [
  { id: "answer-secret", text: "A correct response" },
  { id: "wrong-one", text: "A distractor" },
  { id: "wrong-two", text: "Another distractor" },
];
const multipleChoice = {
  type: "multiple_choice",
  prompt: "Choose an option.",
  options,
  correctOptionIds: ["answer-secret"],
  explanation: "A private explanation.",
} satisfies QuestionContent;
const successfulResponse = (prepared: PreparedQuestion) => ({
  answers: Object.fromEntries(
    prepared.answerKey.components.map((component) => [
      component.id,
      component.kind === "single" ? component.correct[0] : component.correct,
    ]),
  ),
});

describe("question validation and presentation", () => {
  it("never includes private answer keys, option author IDs, or explanations in presentation", () => {
    const { presentation } = prepareQuestion(multipleChoice, {
      random: () => 0.5,
    });
    const payload = JSON.stringify(presentation);
    expect(payload).not.toContain("correctOptionIds");
    expect(payload).not.toContain("answer-secret");
    expect(payload).not.toContain("wrong-one");
    expect(payload).not.toContain("explanation");
    expect(payload).not.toContain("private explanation");
    expect(presentation.components[0].options).toHaveLength(3);
  });

  it("randomizes option order and selects a bounded distractor subset while keeping the answer", () => {
    const pool = {
      ...multipleChoice,
      options: [
        ...options,
        ...Array.from({ length: 15 }, (_, i) => ({
          id: `d${i}`,
          text: `Distractor ${i}`,
        })),
      ],
      optionCount: 4,
    };
    const first = prepareQuestion(pool, { random: () => 0 });
    const second = prepareQuestion(pool, { random: () => 0.99 });
    expect(first.presentation.components[0].options).toHaveLength(4);
    expect(
      first.presentation.components[0].options?.map((option) => option.text),
    ).not.toEqual(
      second.presentation.components[0].options?.map((option) => option.text),
    );
    expect(
      gradeQuestion(first.answerKey, successfulResponse(first)).correct,
    ).toBe(true);
    expect(
      first.presentation.components[0].options?.filter(
        (option) => option.text === "A correct response",
      ),
    ).toHaveLength(1);
  });

  it("rejects duplicate, invalid, and ambiguous structural choices", () => {
    expect(
      questionSchema.safeParse({
        ...multipleChoice,
        options: [options[0], options[0]],
      }).success,
    ).toBe(false);
    expect(
      questionSchema.safeParse({
        ...multipleChoice,
        options: [options[0], { id: "other", text: " a CORRECT response " }],
      }).success,
    ).toBe(false);
    expect(
      questionSchema.safeParse({
        ...multipleChoice,
        correctOptionIds: ["missing"],
      }).success,
    ).toBe(false);
    expect(
      questionSchema.safeParse({
        ...multipleChoice,
        correctOptionIds: ["answer-secret", "wrong-one"],
      }).success,
    ).toBe(false);
    expect(
      questionSchema.safeParse({
        ...multipleChoice,
        arbitraryField: "ignored?",
      }).success,
    ).toBe(false);
  });

  it("supports durable uploaded images and HTTPS images with descriptive alternative text", () => {
    const prepared = prepareQuestion({
      ...multipleChoice,
      imageUrl: "/api/media/diagram-1.png",
      imageAlt: "An example diagram",
    });
    expect(prepared.presentation.imageUrl).toBe("/api/media/diagram-1.png");
    expect(
      questionSchema.safeParse({
        ...multipleChoice,
        imageUrl: "https://example.com/image.png",
      }).success,
    ).toBe(false);
    expect(
      questionSchema.safeParse({
        ...multipleChoice,
        imageUrl: "javascript:alert(1)",
        imageAlt: "Unsafe",
      }).success,
    ).toBe(false);
  });

  it("records alternate wording while sharing the same content answer key", () => {
    const content = {
      ...multipleChoice,
      variants: [{ id: "alternate", prompt: "An alternate question?" }],
    };
    const prepared = prepareQuestion(content, { variantId: "alternate" });
    expect(prepared.presentation.prompt).toBe("An alternate question?");
    expect(prepared.presentation.variantId).toBe("alternate");
    expect(prepared.answerKey.variantId).toBe("alternate");
    expect(
      gradeQuestion(prepared.answerKey, successfulResponse(prepared)).correct,
    ).toBe(true);
    expect(() => prepareQuestion(content, { variantId: "missing" })).toThrow(
      "Unknown question variant",
    );
  });
});

describe("question grading", () => {
  it("grades single choice and only returns answers and explanations after submission", () => {
    const prepared = prepareQuestion(multipleChoice);
    const correct = gradeQuestion(
      prepared.answerKey,
      successfulResponse(prepared),
    );
    expect(correct.correct).toBe(true);
    expect(correct.components[0].expected).toEqual(["A correct response"]);
    expect(correct.explanation).toBe("A private explanation.");
    expect(
      gradeQuestion(prepared.answerKey, { answers: { c1: "invented-option" } })
        .correct,
    ).toBe(false);
    expect(gradeQuestion(prepared.answerKey, { answers: {} }).correct).toBe(
      false,
    );
    expect(() =>
      gradeQuestion(prepared.answerKey, { answers: { nonexistent: "a" } }),
    ).toThrow("unknown component");
  });

  it("requires the complete exact set for multiple select, rejecting duplicates and extras", () => {
    const prepared = prepareQuestion({
      ...multipleChoice,
      type: "multiple_select",
      correctOptionIds: ["answer-secret", "wrong-two"],
    });
    const correct = prepared.answerKey.components[0].correct as string[];
    expect(
      gradeQuestion(prepared.answerKey, {
        answers: { c1: [...correct].reverse() },
      }).correct,
    ).toBe(true);
    expect(
      gradeQuestion(prepared.answerKey, {
        answers: { c1: correct.slice(0, 1) },
      }).correct,
    ).toBe(false);
    expect(
      gradeQuestion(prepared.answerKey, {
        answers: { c1: [...correct, correct[0]] },
      }).correct,
    ).toBe(false);
    expect(
      gradeQuestion(prepared.answerKey, {
        answers: {
          c1: prepared.presentation.components[0].options!.map(
            (option) => option.id,
          ),
        },
      }).correct,
    ).toBe(false);
  });

  it("grades a phased composite as one question and preserves individual component mistakes", () => {
    const content = {
      type: "cloze",
      prompt: "Two blanks remain hidden.",
      components: [
        {
          id: "first-blank",
          prompt: "First ___",
          options,
          correctOptionIds: ["answer-secret"],
          explanation: "First explanation",
        },
        {
          id: "second-blank",
          prompt: "Second ___",
          options,
          correctOptionIds: ["wrong-one"],
        },
      ],
      variants: [
        {
          id: "short",
          prompt: "Alternate blanks.",
          componentPrompts: { "first-blank": "Different first ___" },
        },
      ],
    };
    const prepared = prepareQuestion(content, { variantId: "short" });
    expect(prepared.presentation.components[0].prompt).toBe(
      "Different first ___",
    );
    expect(
      gradeQuestion(prepared.answerKey, successfulResponse(prepared)).correct,
    ).toBe(true);
    const mixed = successfulResponse(prepared);
    mixed.answers.c2 = "incorrect";
    const result = gradeQuestion(prepared.answerKey, mixed);
    expect(result.correct).toBe(false);
    expect(
      result.components.map((component) => [
        component.sourceId,
        component.correct,
      ]),
    ).toEqual([
      ["first-blank", true],
      ["second-blank", false],
    ]);
    expect(splitCloze(content)).toHaveLength(2);
    expect(
      (splitCloze(content)[0] as Extract<QuestionContent, { type: "cloze" }>)
        .components,
    ).toHaveLength(1);
  });

  it("records matching mistakes per pair without answer-dependent public IDs", () => {
    const prepared = prepareQuestion(
      {
        type: "matching",
        prompt: "Match the terms.",
        pairs: [
          { id: "one", left: "A", right: "Alpha" },
          { id: "two", left: "B", right: "Beta" },
        ],
      },
      { random: () => 0 },
    );
    expect(
      gradeQuestion(prepared.answerKey, successfulResponse(prepared)).correct,
    ).toBe(true);
    const response = successfulResponse(prepared);
    response.answers.c2 = response.answers.c1;
    const result = gradeQuestion(prepared.answerKey, response);
    expect(result.components.map((component) => component.correct)).toEqual([
      true,
      false,
    ]);
    expect(JSON.stringify(prepared.presentation)).not.toContain("sourceId");
  });

  it("reveals only the submitted cloze phase and never the whole-card explanation", () => {
    const prepared = prepareQuestion({
      type: "cloze",
      prompt: "Two blanks.",
      explanation: "Whole-card secret.",
      components: [
        {
          id: "first",
          prompt: "First ___",
          options,
          correctOptionIds: ["answer-secret"],
          explanation: "First phase only.",
        },
        {
          id: "second",
          prompt: "Second ___",
          options: [
            { id: "a", text: "Future answer" },
            { id: "b", text: "Future distractor" },
          ],
          correctOptionIds: ["a"],
          explanation: "Later secret.",
        },
      ],
    });
    const phase = gradePhase(
      prepared.answerKey,
      "c1",
      (prepared.answerKey.components[0].correct as string[])[0],
    );
    expect(phase.correct).toBe(true);
    expect(phase.components).toHaveLength(1);
    expect(phase.components[0].explanation).toBe("First phase only.");
    expect(JSON.stringify(phase)).not.toContain("Future answer");
    expect(JSON.stringify(phase)).not.toContain("Later secret");
    expect(JSON.stringify(phase)).not.toContain("Whole-card secret");
  });

  it("requires the full correct sequence, with no duplicate or omitted items", () => {
    const prepared = prepareQuestion({
      type: "sequencing",
      prompt: "Order the process.",
      items: [
        { id: "one", text: "First" },
        { id: "two", text: "Second" },
        { id: "three", text: "Third" },
      ],
    });
    const sequence = prepared.answerKey.components[0].correct as string[];
    expect(
      gradeQuestion(prepared.answerKey, { answers: { c1: sequence } }).correct,
    ).toBe(true);
    expect(
      gradeQuestion(prepared.answerKey, {
        answers: { c1: [...sequence].reverse() },
      }).correct,
    ).toBe(false);
    expect(
      gradeQuestion(prepared.answerKey, {
        answers: { c1: sequence.slice(0, 2) },
      }).correct,
    ).toBe(false);
  });

  it("grades true/false as single choice", () => {
    const prepared = prepareQuestion({
      type: "true_false",
      prompt: "An example proposition.",
      options: [
        { id: "true", text: "True" },
        { id: "false", text: "False" },
      ],
      correctOptionIds: ["true"],
    });
    expect(
      gradeQuestion(prepared.answerKey, successfulResponse(prepared)).correct,
    ).toBe(true);
  });

  it("supports typed math equivalence and explicit manual fallback without overriding supported wrong answers", () => {
    const automatic = prepareQuestion({
      type: "typed",
      prompt: "One half?",
      answer: "1/2",
      grading: "numeric",
    });
    expect(
      gradeQuestion(automatic.answerKey, { answers: { c1: "0.5" } }).correct,
    ).toBe(true);
    expect(
      gradeQuestion(automatic.answerKey, {
        answers: { c1: "0.7" },
        manualCorrect: true,
      }).correct,
    ).toBe(false);
    const manual = prepareQuestion({
      type: "typed",
      prompt: "Give a proof.",
      answer: "A proof outline.",
      grading: "manual",
    });
    expect(
      gradeQuestion(manual.answerKey, { answers: { c1: "My proof" } }),
    ).toMatchObject({ correct: null, requiresManual: true });
    expect(
      gradeQuestion(manual.answerKey, {
        answers: { c1: "My proof" },
        manualCorrect: true,
      }),
    ).toMatchObject({ correct: true, requiresManual: false });
  });
});
