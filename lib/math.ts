import { parse, type MathNode } from "mathjs";

/** Deliberately bounded grader: rational arithmetic and small polynomial identities. */
export interface MathGradingOptions {
  mode?: "numeric" | "expression" | "manual";
  /** Absolute tolerance, used only for numeric answers. Omit for exact comparison. */
  tolerance?: number;
  /** Allowed single-letter variables. When omitted, up to three are accepted. */
  variables?: string[];
}

export interface MathGrade {
  correct: boolean | null;
  requiresManual: boolean;
  reason?: string;
}

type Rational = { n: bigint; d: bigint };
type Polynomial = Map<string, Rational>;
type ParsedNode = MathNode & {
  value?: unknown;
  name?: string;
  fn?: string;
  args?: MathNode[];
  content?: MathNode;
};

const LIMITS = {
  length: 300,
  nodes: 100,
  depth: 20,
  degree: 8,
  terms: 128,
  variables: 3,
};
const ZERO: Rational = { n: 0n, d: 1n };
const ONE: Rational = { n: 1n, d: 1n };

class UnsupportedMath extends Error {}

function gcd(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

function rational(n: bigint, d = 1n): Rational {
  if (d === 0n) throw new UnsupportedMath("Division by zero is not supported.");
  if (n === 0n) return ZERO;
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const divisor = gcd(n, d);
  n /= divisor;
  d /= divisor;
  if (n.toString(2).length > 256 || d.toString(2).length > 256) {
    throw new UnsupportedMath(
      "The values exceed the automatic grader’s limits.",
    );
  }
  return { n, d };
}

function addR(a: Rational, b: Rational): Rational {
  return rational(a.n * b.d + b.n * a.d, a.d * b.d);
}
function mulR(a: Rational, b: Rational): Rational {
  return rational(a.n * b.n, a.d * b.d);
}
function divR(a: Rational, b: Rational): Rational {
  return rational(a.n * b.d, a.d * b.n);
}

function decimal(value: unknown): Rational {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new UnsupportedMath("Only finite real numbers are supported.");
  const text = value.toString();
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/.exec(text);
  if (!match)
    throw new UnsupportedMath("This number format requires manual grading.");
  const [, sign, integer, fraction = "", exponent = "0"] = match;
  const power = Number(exponent) - fraction.length;
  if (Math.abs(power) > 60)
    throw new UnsupportedMath(
      "The values exceed the automatic grader’s limits.",
    );
  const numerator = BigInt(integer + fraction) * (sign ? -1n : 1n);
  return power >= 0
    ? rational(numerator * 10n ** BigInt(power))
    : rational(numerator, 10n ** BigInt(-power));
}

function constant(value: Rational): Polynomial {
  return value.n === 0n ? new Map() : new Map([["", value]]);
}
function constantValue(poly: Polynomial): Rational | null {
  if (poly.size === 0) return ZERO;
  return poly.size === 1 && poly.has("") ? poly.get("")! : null;
}

function combine(a: Polynomial, b: Polynomial, sign = 1n): Polynomial {
  const result = new Map(a);
  for (const [key, value] of b) {
    const sum = addR(
      result.get(key) ?? ZERO,
      rational(sign * value.n, value.d),
    );
    if (sum.n === 0n) result.delete(key);
    else result.set(key, sum);
  }
  if (result.size > LIMITS.terms)
    throw new UnsupportedMath("The expanded expression is too large.");
  return result;
}

function multiplyMonomials(a: string, b: string): string {
  const powers = new Map<string, number>();
  for (const key of [a, b]) {
    for (const term of key ? key.split("*") : []) {
      const [name, power] = term.split("^");
      powers.set(name, (powers.get(name) ?? 0) + Number(power));
    }
  }
  if (
    [...powers.values()].reduce((sum, value) => sum + value, 0) > LIMITS.degree
  ) {
    throw new UnsupportedMath(
      "Only polynomials of degree eight or lower are supported.",
    );
  }
  return [...powers]
    .sort(([x], [y]) => x.localeCompare(y))
    .map(([name, power]) => `${name}^${power}`)
    .join("*");
}

function multiply(a: Polynomial, b: Polynomial): Polynomial {
  let result: Polynomial = new Map();
  for (const [aKey, aValue] of a) {
    for (const [bKey, bValue] of b) {
      result = combine(
        result,
        new Map([[multiplyMonomials(aKey, bKey), mulR(aValue, bValue)]]),
      );
    }
  }
  return result;
}

function power(base: Polynomial, exponent: number): Polynomial {
  if (!Number.isInteger(exponent) || Math.abs(exponent) > LIMITS.degree) {
    throw new UnsupportedMath(
      "Only integer exponents from −8 through 8 are supported.",
    );
  }
  if (exponent < 0) {
    const numericBase = constantValue(base);
    if (numericBase === null)
      throw new UnsupportedMath(
        "Variable denominators require manual grading.",
      );
    const inverted = divR(ONE, numericBase);
    return constant(
      rational(
        inverted.n ** BigInt(-exponent),
        inverted.d ** BigInt(-exponent),
      ),
    );
  }
  let result = constant(ONE);
  for (let i = 0; i < exponent; i++) result = multiply(result, base);
  return result;
}

function toPolynomial(
  source: string,
  mode: MathGradingOptions["mode"],
  variables?: string[],
): Polynomial {
  const normalized = source
    .trim()
    .replace(/−/g, "-")
    .replace(/×/g, "*")
    .replace(/÷/g, "/");
  if (!normalized || normalized.length > LIMITS.length)
    throw new UnsupportedMath(
      "Enter a mathematical expression of at most 300 characters.",
    );
  // mathjs parses numeric literals as JS numbers. Refuse precision it cannot retain.
  for (const literal of normalized.match(
    /(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g,
  ) ?? []) {
    const significand = literal
      .split(/[eE]/)[0]
      .replace(".", "")
      .replace(/^0+/, "");
    if (significand.length > 15)
      throw new UnsupportedMath(
        "Numbers with more than 15 significant digits require manual grading.",
      );
  }
  let count = 0;
  const seen = new Set<string>();
  function visit(node: MathNode, depth = 0): Polynomial {
    if (++count > LIMITS.nodes || depth > LIMITS.depth)
      throw new UnsupportedMath(
        "The expression is too complex for automatic grading.",
      );
    const current = node as ParsedNode;
    if (current.type === "ParenthesisNode" && current.content)
      return visit(current.content, depth + 1);
    if (current.type === "ConstantNode")
      return constant(decimal(current.value));
    if (current.type === "SymbolNode") {
      const name = current.name ?? "";
      if (
        mode === "numeric" ||
        !/^[A-Za-z]$/.test(name) ||
        ["i", "e"].includes(name)
      ) {
        throw new UnsupportedMath("This symbol requires manual grading.");
      }
      if (variables && !variables.includes(name))
        throw new UnsupportedMath(
          `Variable ${name} is not allowed for this problem.`,
        );
      seen.add(name);
      if (seen.size > LIMITS.variables)
        throw new UnsupportedMath("At most three variables are supported.");
      return new Map([[`${name}^1`, ONE]]);
    }
    if (current.type !== "OperatorNode" || !current.args)
      throw new UnsupportedMath(
        "Functions, assignments, arrays, and units require manual grading.",
      );
    const args = current.args;
    if (
      (current.fn === "unaryMinus" || current.fn === "unaryPlus") &&
      args.length === 1
    ) {
      const value = visit(args[0], depth + 1);
      return current.fn === "unaryMinus"
        ? multiply(constant(rational(-1n)), value)
        : value;
    }
    if (
      args.length !== 2 ||
      !["add", "subtract", "multiply", "divide", "pow"].includes(
        current.fn ?? "",
      )
    ) {
      throw new UnsupportedMath("This operator requires manual grading.");
    }
    const left = visit(args[0], depth + 1);
    const right = visit(args[1], depth + 1);
    switch (current.fn) {
      case "add":
        return combine(left, right);
      case "subtract":
        return combine(left, right, -1n);
      case "multiply":
        return multiply(left, right);
      case "divide": {
        const divisor = constantValue(right);
        if (divisor === null)
          throw new UnsupportedMath(
            "Variable denominators require manual grading.",
          );
        return multiply(left, constant(divR(ONE, divisor)));
      }
      case "pow": {
        const exponent = constantValue(right);
        if (!exponent || exponent.d !== 1n)
          throw new UnsupportedMath(
            "Noninteger or variable exponents require manual grading.",
          );
        return power(left, Number(exponent.n));
      }
      default:
        throw new UnsupportedMath("This expression requires manual grading.");
    }
  }
  return visit(parse(normalized));
}

export function gradeMathAnswer(
  input: string,
  expected: string,
  options: MathGradingOptions = {},
): MathGrade {
  if (options.mode === "manual")
    return {
      correct: null,
      requiresManual: true,
      reason: "This problem uses self-grading.",
    };
  if (typeof input !== "string" || typeof expected !== "string")
    return {
      correct: null,
      requiresManual: true,
      reason: "A mathematical answer must be text.",
    };
  if (input.trim() === "") return { correct: false, requiresManual: false };
  try {
    const mode = options.mode ?? "numeric";
    if (
      options.tolerance !== undefined &&
      (!Number.isFinite(options.tolerance) || options.tolerance < 0)
    ) {
      throw new UnsupportedMath("The problem’s tolerance is invalid.");
    }
    const actual = toPolynomial(input, mode, options.variables);
    const target = toPolynomial(expected, mode, options.variables);
    const difference = combine(actual, target, -1n);
    if (difference.size === 0) return { correct: true, requiresManual: false };
    if (mode === "numeric" && options.tolerance !== undefined) {
      const delta = constantValue(difference);
      if (delta === null)
        throw new UnsupportedMath("The answer is not a numeric value.");
      // Compare as rationals to avoid widening the declared tolerance through floating-point rounding.
      const tolerance = decimal(options.tolerance);
      const absoluteNumerator = delta.n < 0n ? -delta.n : delta.n;
      return {
        correct: absoluteNumerator * tolerance.d <= tolerance.n * delta.d,
        requiresManual: false,
      };
    }
    return { correct: false, requiresManual: false };
  } catch (error) {
    return {
      correct: null,
      requiresManual: true,
      reason:
        error instanceof UnsupportedMath
          ? error.message
          : "The answer could not be parsed; use self-grading.",
    };
  }
}
