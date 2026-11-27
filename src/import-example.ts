import type { QuestionContent } from "../lib/types";

const examples: QuestionContent[] = [
  {
    type: "multiple_choice",
    prompt: "Synthetic example: which number is even?",
    options: [
      { id: "a", text: "2" },
      { id: "b", text: "3" },
      { id: "c", text: "5" },
    ],
    correctOptionIds: ["a"],
    optionCount: 2,
    variants: [
      {
        id: "alternate",
        prompt: "Synthetic example: which number is divisible by 2?",
      },
    ],
  },
  {
    type: "multiple_select",
    prompt: "Synthetic example: select the even numbers.",
    options: [
      { id: "a", text: "2" },
      { id: "b", text: "3" },
      { id: "c", text: "4" },
    ],
    correctOptionIds: ["a", "c"],
  },
  {
    type: "true_false",
    prompt: "Synthetic example: 7 is odd.",
    options: [
      { id: "true", text: "True" },
      { id: "false", text: "False" },
    ],
    correctOptionIds: ["true"],
  },
  {
    type: "cloze",
    prompt: "Synthetic example: complete both calculations.",
    components: [
      {
        id: "first",
        prompt: "2 + 2 = ____",
        options: [
          { id: "a", text: "4" },
          { id: "b", text: "5" },
        ],
        correctOptionIds: ["a"],
      },
      {
        id: "second",
        prompt: "3 + 3 = ____",
        options: [
          { id: "a", text: "6" },
          { id: "b", text: "7" },
        ],
        correctOptionIds: ["a"],
      },
    ],
  },
  {
    type: "matching",
    prompt: "Synthetic example: match each number to its name.",
    pairs: [
      { id: "one", left: "1", right: "One" },
      { id: "two", left: "2", right: "Two" },
    ],
  },
  {
    type: "sequencing",
    prompt: "Synthetic example: put these numbers in ascending order.",
    items: [
      { id: "one", text: "1" },
      { id: "three", text: "3" },
      { id: "five", text: "5" },
    ],
  },
  {
    type: "typed",
    prompt: "Synthetic example: write one half as a decimal.",
    answer: "1/2",
    grading: "numeric",
  },
];

export function importExample({
  courseId,
  unitId,
  otherUnitId,
  batchId,
  isMath,
}: {
  courseId: string;
  unitId: string;
  otherUnitId?: string;
  batchId: string;
  isMath: boolean;
}) {
  return {
    version: 1,
    batchId,
    courseId,
    unitId,
    cards: examples.map((content, i) => ({
      externalId: `synthetic-example-${content.type}`,
      ...(otherUnitId && i % 2 ? { unitId: otherUnitId } : {}),
      skills: ["example"],
      content,
    })),
    ...(isMath
      ? {
          problems: [
            {
              externalId: "synthetic-example-fractions",
              skills: ["fractions"],
              content: {
                type: "typed",
                prompt: "Synthetic example: calculate $1/2 + 1/4$.",
                answer: "3/4",
                grading: "numeric",
              },
              difficulty: 1,
              hint: "Use a common denominator.",
              solution: "$2/4 + 1/4 = 3/4$.",
              template: {
                name: "fraction-addition",
                values: { a: "1/2", b: "1/4" },
              },
            },
            {
              externalId: "synthetic-example-equivalence",
              ...(otherUnitId ? { unitId: otherUnitId } : {}),
              skills: ["expressions"],
              content: {
                type: "typed",
                prompt: "Synthetic example: expand $2(x+1)$.",
                answer: "2*x+2",
                grading: "expression",
                variables: ["x"],
              },
              difficulty: 2,
              solution: "Distribute 2 over both terms to get $2x+2$.",
            },
          ],
        }
      : {}),
  };
}
