import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useState,
} from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import katex from "katex";
import type {
  QuestionPresentation,
  QuestionResponse,
  PresentedComponent,
} from "../lib/types";

const inlineBody = (formula: string) =>
  formula.length > 0 && formula.trim() === formula && !/[\r\n]/.test(formula);
const priceBeforeProse =
  /^[+−-]?\p{Nd}+(?:[.,\u00a0\u202f]\p{Nd}+)*[\s,.!?;:—–)"'’”\]]+\p{L}{2}/u;

function splitMath(text: string) {
  const dollars = Array.from(text.matchAll(/(\\*)(\$+)/g)).flatMap((match) => {
    const escaped = match[1].length % 2;
    const width = match[2].length - escaped;
    return width === 1 || width === 2
      ? [{ start: match.index + match[1].length + escaped, width }]
      : [];
  });
  const pieces: { text: string; kind: "plain" | "inline" | "display" }[] = [];
  const plain = (start: number, end: number) => {
    if (end > start) {
      pieces.push({
        text: text
          .slice(start, end)
          .replace(/(\\+)\$/g, (literal, slashes: string) =>
            slashes.length % 2 ? slashes.slice(1) + "$" : literal,
          ),
        kind: "plain",
      });
    }
  };
  let read = 0;
  for (let i = 0; i < dollars.length - 1; i++) {
    const open = dollars[i],
      close = dollars[i + 1],
      following = dollars[i + 2];
    if (open.width !== close.width) continue;
    const display = open.width === 2;
    const end = close.start + close.width;
    const formula = text.slice(open.start + open.width, close.start);
    // A price in prose must not consume the opener of an adjacent formula.
    const adjacentFormula =
      following?.width === 1 && inlineBody(text.slice(end, following.start));
    if (
      display
        ? !formula.trim()
        : !inlineBody(formula) ||
          /^\p{Nd}/u.test(text.slice(end)) ||
          (priceBeforeProse.test(formula) && adjacentFormula)
    )
      continue;
    plain(read, open.start);
    pieces.push({ text: formula, kind: display ? "display" : "inline" });
    read = end;
    i++;
  }
  plain(read, text.length);
  return pieces;
}

export function MathText({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  return (
    <span className={className}>
      {splitMath(text).map(({ text: chunk, kind }, index) => {
        if (kind === "plain") return <span key={index}>{chunk}</span>;
        const display = kind === "display";
        try {
          return (
            <span
              className={display ? "math-block" : "math-inline"}
              key={index}
              dangerouslySetInnerHTML={{
                __html: katex.renderToString(chunk, {
                  displayMode: display,
                  throwOnError: true,
                  trust: false,
                  strict: "warn",
                  maxExpand: 200,
                  maxSize: 20,
                }),
              }}
            />
          );
        } catch {
          const delimiter = display ? "$$" : "$";
          return <span key={index}>{delimiter + chunk + delimiter}</span>;
        }
      })}
    </span>
  );
}

const initialAnswers = (
  question: QuestionPresentation,
): QuestionResponse["answers"] =>
  Object.fromEntries(
    question.components
      .filter((part) => part.kind === "sequence")
      .map((part) => [
        part.id,
        (part.options ?? []).map((option) => option.id),
      ]),
  );
const isComplete = (
  part: PresentedComponent,
  answer: string | string[] | undefined,
) =>
  part.kind === "sequence"
    ? Array.isArray(answer) && answer.length === part.options?.length
    : Array.isArray(answer)
      ? answer.length > 0
      : typeof answer === "string" && answer.trim().length > 0;

export function QuestionView({
  question,
  onSubmit,
  busy = false,
}: {
  question: QuestionPresentation;
  onSubmit: (response: QuestionResponse) => void;
  busy?: boolean;
}) {
  const [answers, setAnswers] = useState<QuestionResponse["answers"]>(() =>
    initialAnswers(question),
  );
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    setAnswers(initialAnswers(question));
    setPhase(0);
  }, [question]);
  const phased = question.type === "cloze" && question.components.length > 1;
  const visible = phased ? [question.components[phase]] : question.components;
  const canSubmit = question.components.every((part) =>
    isComplete(part, answers[part.id]),
  );
  const select = (part: PresentedComponent, optionId: string) => {
    if (busy) return;
    setAnswers((previous) => {
      if (part.kind !== "multiple") return { ...previous, [part.id]: optionId };
      const selected = Array.isArray(previous[part.id])
        ? (previous[part.id] as string[])
        : [];
      return {
        ...previous,
        [part.id]: selected.includes(optionId)
          ? selected.filter((id) => id !== optionId)
          : [...selected, optionId],
      };
    });
  };
  const moveRadio = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    part: PresentedComponent,
    index: number,
  ) => {
    if (part.kind !== "single" || !part.options || busy) return;
    const direction =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (!direction) return;
    event.preventDefault();
    const next =
      (index + direction + part.options.length) % part.options.length;
    select(part, part.options[next].id);
    event.currentTarget.parentElement
      ?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
      [next]?.focus();
  };
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (
        busy ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.repeat
      )
        return;
      const target = event.target as HTMLElement;
      if (
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
        target.isContentEditable
      )
        return;
      const part = visible.length === 1 ? visible[0] : undefined;
      if (
        part &&
        (part.kind === "single" || part.kind === "multiple") &&
        /^[1-9]$/.test(event.key)
      ) {
        const option = part.options?.[Number(event.key) - 1];
        if (option) {
          event.preventDefault();
          select(part, option.id);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [question, phase, busy, answers]);
  const move = (part: PresentedComponent, index: number, delta: number) =>
    setAnswers((previous) => {
      const ids = [...((previous[part.id] as string[]) ?? [])];
      const target = index + delta;
      if (target < 0 || target >= ids.length) return previous;
      [ids[index], ids[target]] = [ids[target], ids[index]];
      return { ...previous, [part.id]: ids };
    });
  return (
    <form
      className="question-view"
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy && canSubmit) onSubmit({ answers });
      }}
    >
      <h2 className="question-prompt">
        <MathText text={question.prompt} />
      </h2>
      {question.imageUrl && (
        <figure className="question-image">
          <img
            src={question.imageUrl}
            alt={question.imageAlt ?? "Question illustration"}
            loading="eager"
          />
        </figure>
      )}
      {phased && (
        <div className="cloze-progress" aria-label="Question blanks">
          {question.components.map((part, index) => (
            <button
              type="button"
              key={part.id}
              className={`phase-dot ${index === phase ? "current" : ""} ${isComplete(part, answers[part.id]) ? "complete" : ""}`}
              onClick={() => setPhase(index)}
              aria-label={`Go to blank ${index + 1}`}
              aria-current={index === phase ? "step" : undefined}
            >
              {isComplete(part, answers[part.id]) ? (
                <Check size={13} />
              ) : (
                index + 1
              )}
            </button>
          ))}
          <span className="muted">
            Blank {phase + 1} of {question.components.length}
          </span>
        </div>
      )}
      <div className="question-components">
        {visible.map((part) => (
          <fieldset
            className="question-component"
            key={part.id}
            disabled={busy}
          >
            {part.prompt && part.prompt !== question.prompt && (
              <legend>
                <MathText text={part.prompt} />
              </legend>
            )}
            {part.kind === "multiple" && (
              <p className="muted small">Select every correct answer.</p>
            )}
            {(part.kind === "single" || part.kind === "multiple") && (
              <div
                className="answer-options"
                role={part.kind === "single" ? "radiogroup" : "group"}
                aria-label={part.prompt || "Answer options"}
              >
                {part.options?.map((option, index) => {
                  const selected = Array.isArray(answers[part.id])
                    ? (answers[part.id] as string[]).includes(option.id)
                    : answers[part.id] === option.id;
                  return (
                    <button
                      type="button"
                      role={part.kind === "single" ? "radio" : "checkbox"}
                      aria-checked={selected}
                      tabIndex={
                        part.kind === "single" &&
                        !(selected || (!answers[part.id] && index === 0))
                          ? -1
                          : undefined
                      }
                      className={`answer-option ${selected ? "selected" : ""}`}
                      key={option.id}
                      onClick={() => select(part, option.id)}
                      onKeyDown={(event) => moveRadio(event, part, index)}
                    >
                      <span className="option-key">
                        {index < 9
                          ? index + 1
                          : String.fromCharCode(65 + index)}
                      </span>
                      <MathText text={option.text} />
                      <span
                        className={`option-marker ${part.kind === "multiple" ? "square" : ""}`}
                      >
                        {selected && <Check size={13} />}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            {part.kind === "sequence" && (
              <>
                <p className="muted small">
                  Arrange the items in the correct order.
                </p>
                <ol className="sequence-list">
                  {((answers[part.id] as string[]) ?? []).map(
                    (id, index, ids) => (
                      <li key={id}>
                        <span className="option-key">{index + 1}</span>
                        <MathText
                          text={
                            part.options?.find((option) => option.id === id)
                              ?.text ?? id
                          }
                        />
                        <span className="sequence-controls">
                          <button
                            type="button"
                            className="icon-button"
                            aria-label={`Move item ${index + 1} up`}
                            disabled={index === 0 || busy}
                            onClick={() => move(part, index, -1)}
                          >
                            <ArrowUp size={15} />
                          </button>
                          <button
                            type="button"
                            className="icon-button"
                            aria-label={`Move item ${index + 1} down`}
                            disabled={index === ids.length - 1 || busy}
                            onClick={() => move(part, index, 1)}
                          >
                            <ArrowDown size={15} />
                          </button>
                        </span>
                      </li>
                    ),
                  )}
                </ol>
              </>
            )}
            {part.kind === "typed" && (
              <div className="typed-answer">
                <label htmlFor={`answer-${part.id}`}>Your answer</label>
                <input
                  id={`answer-${part.id}`}
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={1000}
                  value={
                    typeof answers[part.id] === "string"
                      ? (answers[part.id] as string)
                      : ""
                  }
                  placeholder={
                    part.gradingMode === "numeric"
                      ? "For example, 3/4 or 0.75"
                      : "Enter your answer"
                  }
                  onChange={(event) =>
                    setAnswers((previous) => ({
                      ...previous,
                      [part.id]: event.target.value,
                    }))
                  }
                />
                <p className="muted small">
                  {part.gradingMode === "manual"
                    ? "Compare your answer with the solution, then mark your result."
                    : part.gradingMode === "expression"
                      ? "Use standard notation: x^2, 2*x, or (x+1)/2."
                      : "Integers, decimals, and fractions are supported."}
                </p>
              </div>
            )}
          </fieldset>
        ))}
      </div>
      <div className="question-actions">
        {phased && phase > 0 && (
          <button
            type="button"
            className="button secondary"
            onClick={() => setPhase((value) => value - 1)}
            disabled={busy}
          >
            <ChevronLeft size={16} /> Previous blank
          </button>
        )}
        {phased && phase < question.components.length - 1 ? (
          <button
            type="button"
            className="button primary"
            onClick={() => setPhase((value) => value + 1)}
            disabled={
              busy ||
              !isComplete(
                question.components[phase],
                answers[question.components[phase].id],
              )
            }
          >
            Next blank <ChevronRight size={16} />
          </button>
        ) : (
          <button
            type="submit"
            className="button primary"
            disabled={busy || !canSubmit}
          >
            {busy ? "Checking…" : "Check answer"} <ChevronRight size={16} />
          </button>
        )}
        <span className="keyboard-tip muted">
          {visible.length === 1 &&
          ["single", "multiple"].includes(visible[0].kind)
            ? "Use 1–9 to select an answer"
            : "Take your time. Accuracy comes first."}
        </span>
      </div>
    </form>
  );
}
