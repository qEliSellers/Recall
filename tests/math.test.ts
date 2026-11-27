import { describe, expect, it } from "vitest";
import { gradeMathAnswer } from "../lib/math";

const exact = (answer: string, expected: string) =>
  gradeMathAnswer(answer, expected);
const symbolic = (answer: string, expected: string, variables?: string[]) =>
  gradeMathAnswer(answer, expected, { mode: "expression", variables });

describe("bounded mathematical grading", () => {
  it("recognizes integers, decimals, fractions, and arithmetic exactly", () => {
    for (const [answer, expected] of [
      ["2/4", "0.5"],
      ["0.1+0.2", "0.3"],
      ["-6/3", "-2"],
      ["2^3 + 4", "12"],
      ["2^-3", "1/8"],
      ["−4 × 2", "-8"],
    ]) {
      expect(exact(answer, expected)).toEqual({
        correct: true,
        requiresManual: false,
      });
    }
    expect(exact("2/3", "1/3").correct).toBe(false);
    expect(exact("0.333333", "1/3").correct).toBe(false);
  });

  it("uses the declared absolute rounding tolerance without hidden extra tolerance", () => {
    expect(gradeMathAnswer("3.14", "22/7", { tolerance: 0.003 }).correct).toBe(
      true,
    );
    expect(gradeMathAnswer("3.14", "22/7", { tolerance: 0.001 }).correct).toBe(
      false,
    );
    expect(gradeMathAnswer("0.31", "0.3", { tolerance: 0.01 }).correct).toBe(
      true,
    );
    expect(
      gradeMathAnswer("0.310000000001", "0.3", { tolerance: 0.01 }).correct,
    ).toBe(false);
    expect(gradeMathAnswer("1", "1", { tolerance: -1 }).requiresManual).toBe(
      true,
    );
  });

  it("compares expanded and factored polynomial forms symbolically", () => {
    expect(symbolic("(x+1)^2", "x^2 + 2x + 1").correct).toBe(true);
    expect(symbolic("2(x+y)/4", "(x+y)/2").correct).toBe(true);
    expect(symbolic("x*y+y*x", "2xy", ["x", "y"]).requiresManual).toBe(true); // xy is a distinct symbol.
    expect(symbolic("x*y+y*x", "2*x*y", ["x", "y"]).correct).toBe(true);
    expect(symbolic("(x+1)^2", "x^2 + 1").correct).toBe(false);
    expect(symbolic("x-x", "0").correct).toBe(true);
  });

  it("enforces declared variables and numeric mode", () => {
    expect(symbolic("z+1", "x+1", ["x"]).requiresManual).toBe(true);
    expect(exact("x", "x").requiresManual).toBe(true);
    expect(symbolic("pi", "3.14").requiresManual).toBe(true);
  });

  it("declines unsupported algebra instead of guessing from sample points", () => {
    for (const answer of [
      "1/x",
      "x^-1",
      "sqrt(4)",
      "sin(x)",
      "x^(1/2)",
      "x^9",
      "1/0",
      "[1,2]",
      "a=2",
      "2;3",
      "2 cm",
    ]) {
      expect(symbolic(answer, answer), answer).toMatchObject({
        correct: null,
        requiresManual: true,
      });
    }
  });

  it("limits numeric precision and computational complexity", () => {
    expect(exact("9007199254740993", "9007199254740992").requiresManual).toBe(
      true,
    );
    expect(exact("1e10000", "1e10000").requiresManual).toBe(true);
    expect(symbolic("a+b+c+d", "a+b+c+d").requiresManual).toBe(true);
    expect(exact("1+".repeat(150) + "1", "1").requiresManual).toBe(true);
  });

  it("returns explicit manual and empty-answer outcomes", () => {
    expect(
      gradeMathAnswer("anything", "anything", { mode: "manual" }),
    ).toMatchObject({ correct: null, requiresManual: true });
    expect(exact("", "1")).toEqual({ correct: false, requiresManual: false });
    expect(exact("not valid math!", "1")).toMatchObject({
      correct: null,
      requiresManual: true,
    });
  });
});
