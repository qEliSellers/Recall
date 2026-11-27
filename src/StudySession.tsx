import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  Lightbulb,
  RotateCcw,
  Sparkles,
  X,
  XCircle,
} from "lucide-react";
import type {
  GradeResult,
  QuestionPresentation,
  QuestionResponse,
} from "../lib/types";
import { api } from "./api";
import { MathText, QuestionView } from "./QuestionView";

type SessionItem = {
  id: string;
  cardId?: string;
  problemId?: string;
  unitId: string;
  skills: string[];
  question: QuestionPresentation;
  submitted: boolean;
  response?: QuestionResponse;
  grade?: GradeResult;
  recommendedRating?: 1 | 3;
  hint?: string;
  solution?: string;
  phaseIndex?: number;
  phaseAnswers?: Record<string, string>;
  phaseGrades?: GradeResult[];
};
type ResultItem = {
  id: string;
  question: QuestionPresentation;
  grade: GradeResult;
  response: QuestionResponse;
  skills: string[];
  unitId: string;
  unitName?: string;
  rating?: number;
  solution?: string;
};
type AnswerFeedback = {
  question: QuestionPresentation;
  grade: GradeResult;
  solution?: string;
  itemId: string;
};
type SessionView = {
  id: string;
  mode: "review" | "quiz" | "problem";
  status: "active" | "completed";
  courseId: string;
  total: number;
  answered: number;
  index: number;
  current?: SessionItem;
  lastAnswer?: AnswerFeedback;
  createdAt?: string;
  completedAt?: string;
  results?: {
    accuracy: number;
    correct: number;
    total: number;
    responseMs: number;
    items: ResultItem[];
  };
};
const modeTitle = {
  review: "Scheduled review",
  quiz: "Practice quiz",
  problem: "Problem practice",
};
const formatTime = (milliseconds: number) =>
  milliseconds < 60000
    ? `${Math.max(1, Math.round(milliseconds / 1000))}s`
    : `${Math.floor(milliseconds / 60000)}m ${Math.round(milliseconds / 1000) % 60}s`;
const kindLabel = (type: string) => type.replaceAll("_", " ");

function Feedback({
  question,
  grade,
  solution,
}: {
  question: QuestionPresentation;
  grade: GradeResult;
  solution?: string;
}) {
  const icon =
    grade.correct === true ? (
      <CheckCircle2 size={20} />
    ) : grade.correct === false ? (
      <XCircle size={20} />
    ) : (
      <Lightbulb size={20} />
    );
  const submittedText = (componentId: string, submitted: string | string[]) => {
    const options = question.components.find(
      (component) => component.id === componentId,
    )?.options;
    const ids = Array.isArray(submitted) ? submitted : [submitted];
    return (
      ids
        .map(
          (value) =>
            options?.find((option) => option.id === value)?.text ?? value,
        )
        .join(" · ") || "No answer"
    );
  };
  return (
    <section
      className={`answer-feedback ${grade.correct === true ? "correct" : grade.correct === false ? "incorrect" : "manual"}`}
      aria-live="polite"
    >
      <div className="feedback-heading">
        {icon}
        <strong>
          {grade.correct === true
            ? "Correct. Nicely recalled."
            : grade.correct === false
              ? "Keep this one in mind."
              : "Check your work against the answer."}
        </strong>
      </div>
      <div className="feedback-components">
        {grade.components.map((component, index) => (
          <div className="feedback-component" key={component.id}>
            <div className="feedback-component-title">
              {grade.components.length > 1 && (
                <span className="badge">Part {index + 1}</span>
              )}
              {component.correct === true ? (
                <Check size={15} />
              ) : component.correct === false ? (
                <X size={15} />
              ) : null}
            </div>
            {question.components.find((part) => part.id === component.id)
              ?.prompt !== question.prompt && (
              <p className="small muted">
                <MathText
                  text={
                    question.components.find((part) => part.id === component.id)
                      ?.prompt ?? ""
                  }
                />
              </p>
            )}
            {component.correct !== true && (
              <p className="your-answer">
                <span className="muted">Your answer </span>
                <MathText
                  text={submittedText(component.id, component.submitted)}
                />
              </p>
            )}
            <p className="expected-answer">
              <span className="muted">
                {question.type === "sequencing" ? "Correct order " : "Answer "}
              </span>
              <MathText
                text={component.expected.join(
                  question.type === "sequencing" ? " → " : " · ",
                )}
              />
            </p>
            {component.explanation && (
              <p>
                <MathText text={component.explanation} />
              </p>
            )}
            {component.reason && (
              <p className="muted small">{component.reason}</p>
            )}
          </div>
        ))}
      </div>
      {grade.explanation && (
        <div className="feedback-explanation">
          <MathText text={grade.explanation} />
        </div>
      )}
      {solution && (
        <div className="worked-solution">
          <span className="eyebrow">Worked solution</span>
          <p>
            <MathText text={solution} />
          </p>
        </div>
      )}
    </section>
  );
}

function PhasedQuestion({
  item,
  busy,
  onPhase,
}: {
  item: SessionItem;
  busy: boolean;
  onPhase: (componentId: string, answer: string) => void;
}) {
  const index = item.phaseIndex ?? 0;
  const allSubmitted = index >= item.question.components.length;
  const part =
    item.question.components[
      Math.min(index, item.question.components.length - 1)
    ];
  const question = useMemo(
    () => ({ ...item.question, components: [part] }),
    [item.question, part],
  );
  return (
    <div className="phased-question">
      <div className="cloze-progress" aria-label="Question blanks">
        {item.question.components.map((component, number) => (
          <span
            key={component.id}
            className={`phase-dot ${number === index ? "current" : ""} ${number < index ? "complete" : ""}`}
            aria-label={`Blank ${number + 1}: ${number < index ? "submitted" : "unanswered"}`}
          >
            {number < index ? <Check size={13} /> : number + 1}
          </span>
        ))}
        <span className="muted">
          {allSubmitted
            ? "All blanks submitted"
            : `Blank ${index + 1} of ${item.question.components.length}`}
        </span>
      </div>
      {(item.phaseGrades ?? []).map((grade, number) => (
        <div key={number} className="saved-phase">
          <span className="eyebrow">Blank {number + 1} · saved</span>
          <Feedback question={item.question} grade={grade} />
        </div>
      ))}
      {index > 0 && !item.phaseGrades?.length && (
        <p className="muted small">
          Previous blanks are saved. Feedback will appear at the end of your
          quiz.
        </p>
      )}
      {allSubmitted ? (
        <button
          className="button primary"
          disabled={busy}
          onClick={() => onPhase(part.id, item.phaseAnswers?.[part.id] ?? "")}
        >
          Finish this card <ArrowRight size={16} />
        </button>
      ) : (
        <QuestionView
          key={part.id}
          question={question}
          busy={busy}
          onSubmit={(response) =>
            onPhase(part.id, String(response.answers[part.id]))
          }
        />
      )}
    </div>
  );
}

function SessionResults({
  view,
  busy,
  onRetry,
  onClose,
}: {
  view: SessionView;
  busy: boolean;
  onRetry: () => void;
  onClose: () => void;
}) {
  const [onlyMissed, setOnlyMissed] = useState(false);
  const [openResult, setOpenResult] = useState<string | null>(null);
  const results = view.results;
  if (!results)
    return (
      <div className="panel study-empty">
        <CheckCircle2 size={32} />
        <h2>Session complete</h2>
        <p className="muted">Your progress has been saved.</p>
        <button className="button primary" onClick={onClose}>
          Back to your course
        </button>
      </div>
    );
  const missed = results.items.filter((item) => item.grade.correct === false);
  const percent = Math.round(results.accuracy * 100);
  const skillStats = new Map<string, { total: number; correct: number }>();
  results.items.forEach((item) =>
    item.skills.forEach((skill) => {
      const current = skillStats.get(skill) ?? { total: 0, correct: 0 };
      current.total++;
      current.correct += item.grade.correct ? 1 : 0;
      skillStats.set(skill, current);
    }),
  );
  const unitStats = new Map<
    string,
    { name: string; total: number; correct: number }
  >();
  results.items.forEach((item) => {
    const current = unitStats.get(item.unitId) ?? {
      name: item.unitName ?? "Unit",
      total: 0,
      correct: 0,
    };
    current.total++;
    current.correct += item.grade.correct ? 1 : 0;
    unitStats.set(item.unitId, current);
  });
  return (
    <div className="session-results">
      <section className="panel results-hero">
        <div
          className="result-score"
          style={{ "--score": `${percent}%` } as React.CSSProperties}
        >
          <span>
            {percent}
            <small>%</small>
          </span>
        </div>
        <div>
          <span className="eyebrow">Session complete</span>
          <h2>
            {percent >= 90
              ? "A little stronger than before."
              : percent >= 60
                ? "Progress, one question at a time."
                : "Every attempt tells you what to revisit."}
          </h2>
          <p className="muted">
            {results.correct} of {results.total} answered correctly ·{" "}
            {formatTime(results.responseMs)} of focused study
          </p>
          <div className="button-row">
            {missed.length > 0 && (
              <button
                className="button primary"
                disabled={busy}
                onClick={onRetry}
              >
                <RotateCcw size={16} />
                {busy ? "Preparing…" : `Retry ${missed.length} missed`}
              </button>
            )}
            <button className="button secondary" onClick={onClose}>
              Back to your course <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </section>
      <div className="study-note">
        <Sparkles size={16} />
        <p>
          {view.mode === "review"
            ? "Your ratings updated each card’s FSRS schedule. The score above describes this session, not estimated memory retention."
            : "Practice saved. Your FSRS schedules were not changed."}
        </p>
      </div>
      {unitStats.size > 0 && (
        <section className="panel results-skills">
          <div className="section-heading">
            <h3>By unit</h3>
            <span className="muted small">Accuracy in this session</span>
          </div>
          <div className="skill-result-grid">
            {Array.from(unitStats).map(([id, data]) => (
              <div key={id}>
                <div className="skill-result-label">
                  <span>{data.name}</span>
                  <strong>
                    {data.correct}/{data.total}
                  </strong>
                </div>
                <div className="mini-progress">
                  <span
                    style={{ width: `${(data.correct / data.total) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      {skillStats.size > 0 && (
        <section className="panel results-skills">
          <div className="section-heading">
            <h3>By skill</h3>
            <span className="muted small">Accuracy in this session</span>
          </div>
          <div className="skill-result-grid">
            {Array.from(skillStats).map(([skill, data]) => (
              <div key={skill}>
                <div className="skill-result-label">
                  <span>{skill}</span>
                  <strong>
                    {data.correct}/{data.total}
                  </strong>
                </div>
                <div className="mini-progress">
                  <span
                    style={{ width: `${(data.correct / data.total) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      <section className="panel detailed-results">
        <div className="section-heading">
          <h3>Question breakdown</h3>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={onlyMissed}
              onChange={(event) => setOnlyMissed(event.target.checked)}
            />
            Missed only
          </label>
        </div>
        <div className="result-list">
          {results.items
            .filter((item) => !onlyMissed || item.grade.correct === false)
            .map((item, index) => (
              <article className="result-item" key={item.id}>
                <button
                  className="result-toggle"
                  onClick={() =>
                    setOpenResult(openResult === item.id ? null : item.id)
                  }
                  aria-expanded={openResult === item.id}
                >
                  <span
                    className={`result-icon ${item.grade.correct ? "correct" : "incorrect"}`}
                  >
                    {item.grade.correct ? <Check size={16} /> : <X size={16} />}
                  </span>
                  <span className="result-prompt">
                    <span className="muted small">
                      {kindLabel(item.question.type)}
                    </span>
                    <MathText text={item.question.prompt} />
                  </span>
                  {openResult === item.id ? (
                    <ChevronUp size={16} />
                  ) : (
                    <ChevronDown size={16} />
                  )}
                </button>
                {openResult === item.id && (
                  <Feedback
                    question={item.question}
                    grade={item.grade}
                    solution={item.solution}
                  />
                )}
              </article>
            ))}
          {onlyMissed && missed.length === 0 && (
            <p className="muted">No missed questions in this session.</p>
          )}
        </div>
      </section>
    </div>
  );
}

export function StudySession({
  sessionId,
  onClose,
  onChanged,
}: {
  sessionId: string;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [activeId, setActiveId] = useState(sessionId);
  const [view, setView] = useState<SessionView | null>(null);
  const [feedback, setFeedback] = useState<AnswerFeedback | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const startedAt = useRef(Date.now());
  const lastResponse = useRef<QuestionResponse | null>(null);
  useEffect(() => {
    setActiveId(sessionId);
  }, [sessionId]);
  useEffect(() => {
    let cancelled = false;
    setView(null);
    setFeedback(null);
    setError("");
    setBusy(true);
    api<SessionView>("sessions.get", { id: activeId })
      .then((data) => {
        if (!cancelled) setView(data);
      })
      .catch((reason) => {
        if (!cancelled)
          setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeId]);
  useEffect(() => {
    startedAt.current = Date.now();
    setShowHint(false);
    lastResponse.current = null;
  }, [view?.current?.id]);
  const submit = async (response: QuestionResponse) => {
    if (!view?.current || busy) return;
    setBusy(true);
    setError("");
    const item = view.current;
    lastResponse.current = response;
    try {
      const updated = await api<SessionView>("sessions.answer", {
        id: activeId,
        itemId: item.id,
        response,
        responseMs: Math.min(
          3600000,
          Math.max(0, Date.now() - startedAt.current),
        ),
      });
      setView(updated);
      if (
        updated.mode !== "review" &&
        updated.lastAnswer &&
        !updated.lastAnswer.grade.requiresManual
      )
        setFeedback(updated.lastAnswer);
      onChanged?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };
  const submitPhase = async (componentId: string, answer: string) => {
    if (!view?.current || busy) return;
    setBusy(true);
    setError("");
    try {
      const updated = await api<SessionView>("sessions.phase", {
        id: activeId,
        itemId: view.current.id,
        componentId,
        answer,
        responseMs: Math.min(
          3600000,
          Math.max(0, Date.now() - startedAt.current),
        ),
      });
      setView(updated);
      startedAt.current = Date.now();
      if (updated.mode !== "review" && updated.lastAnswer)
        setFeedback(updated.lastAnswer);
      onChanged?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };
  const rate = async (rating: 1 | 2 | 3 | 4) => {
    if (!view?.current || busy) return;
    setBusy(true);
    setError("");
    try {
      setView(
        await api<SessionView>("sessions.rate", {
          id: activeId,
          itemId: view.current.id,
          rating,
        }),
      );
      onChanged?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };
  const retry = async () => {
    if (!view || busy) return;
    setBusy(true);
    setError("");
    try {
      const next = await api<SessionView>("sessions.create", {
        courseId: view.courseId,
        mode: view.mode === "review" ? "quiz" : view.mode,
        retrySessionId: view.id,
        count: Math.max(
          1,
          view.results?.items.filter((item) => item.grade.correct === false)
            .length ?? 1,
        ),
        feedback: "immediate",
        includeUnintroduced: true,
      });
      setActiveId(next.id);
      setFeedback(null);
      setView(next);
      onChanged?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        event.key !== "Enter" ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        busy ||
        (event.target as HTMLElement).tagName === "BUTTON" ||
        (event.target as HTMLElement).tagName === "INPUT" ||
        (event.target as HTMLElement).tagName === "TEXTAREA"
      )
        return;
      if (feedback) {
        event.preventDefault();
        setFeedback(null);
      } else if (
        view?.mode === "review" &&
        view.current?.grade &&
        !view.current.grade.requiresManual
      ) {
        event.preventDefault();
        void rate(
          view.current.recommendedRating ??
            (view.current.grade.correct ? 3 : 1),
        );
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [view, feedback, busy]);
  const current = view?.current;
  return (
    <div className="study-session">
      <div className="study-topbar">
        <button className="button ghost" onClick={onClose}>
          <ArrowLeft size={17} />
          Leave session
        </button>
        <div className="study-mode">
          <span className="status-dot" />
          {view ? modeTitle[view.mode] : "Study session"}
        </div>
        {view && (
          <span className="muted small">
            {Math.min(view.answered, view.total)} / {view.total} complete
          </span>
        )}
      </div>
      {view && (
        <div
          className="session-progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={view.total}
          aria-valuenow={Math.min(view.answered, view.total)}
          aria-label="Session progress"
        >
          <span
            style={{
              width: `${view.total ? (view.answered / view.total) * 100 : 0}%`,
            }}
          />
        </div>
      )}
      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button
            className="icon-button"
            onClick={() => setError("")}
            aria-label="Dismiss error"
          >
            <X size={16} />
          </button>
        </div>
      )}
      {!view && (
        <div className="panel study-empty">
          {busy ? (
            <>
              <span className="loading-spinner" />
              <p className="muted">Preparing your session…</p>
            </>
          ) : (
            <>
              <p className="muted">Your session could not be loaded.</p>
              <button className="button secondary" onClick={onClose}>
                Return to your course
              </button>
            </>
          )}
        </div>
      )}
      {view && feedback && (
        <section className="panel study-card">
          <div className="question-meta">
            <span className="badge">{kindLabel(feedback.question.type)}</span>
            <span className="muted small">Practice feedback</span>
          </div>
          <h2 className="question-prompt">
            <MathText text={feedback.question.prompt} />
          </h2>
          <Feedback
            question={feedback.question}
            grade={feedback.grade}
            solution={feedback.solution}
          />
          <div className="question-actions">
            <button
              className="button primary"
              onClick={() => {
                startedAt.current = Date.now();
                setFeedback(null);
              }}
            >
              {view.status === "completed" ? "See results" : "Continue"}
              <ArrowRight size={16} />
            </button>
            <span className="keyboard-tip muted">Press Enter to continue</span>
          </div>
        </section>
      )}
      {view && !feedback && view.status === "completed" && (
        <SessionResults
          view={view}
          busy={busy}
          onRetry={retry}
          onClose={onClose}
        />
      )}
      {view && !feedback && view.status !== "completed" && current && (
        <section className="panel study-card">
          <div className="question-meta">
            <span className="badge">{kindLabel(current.question.type)}</span>
            <span className="muted small">
              Question {Math.min(view.index + 1, view.total)} of {view.total}
            </span>
            {current.skills.length > 0 && (
              <span className="question-skill">
                {current.skills.slice(0, 2).join(" · ")}
              </span>
            )}
          </div>
          {!current.submitted ? (
            <>
              {current.question.type === "cloze" &&
              current.question.components.length > 1 ? (
                <PhasedQuestion
                  item={current}
                  busy={busy}
                  onPhase={submitPhase}
                />
              ) : (
                <QuestionView
                  key={current.id}
                  question={current.question}
                  onSubmit={submit}
                  busy={busy}
                />
              )}
              {current.hint && (
                <div className="hint-area">
                  <button
                    className="button ghost small"
                    onClick={() => setShowHint(!showHint)}
                  >
                    <Lightbulb size={15} />
                    {showHint ? "Hide hint" : "Show a hint"}
                  </button>
                  {showHint && (
                    <p className="hint-content">
                      <MathText text={current.hint} />
                    </p>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <h2 className="question-prompt">
                <MathText text={current.question.prompt} />
              </h2>
              {current.grade && (
                <Feedback
                  question={current.question}
                  grade={current.grade}
                  solution={current.solution}
                />
              )}
              {current.grade?.requiresManual ? (
                <div className="manual-grade">
                  <p className="muted">Does your answer match the solution?</p>
                  <div className="button-row">
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() =>
                        submit({
                          answers:
                            lastResponse.current?.answers ??
                            current.response?.answers ??
                            {},
                          manualCorrect: false,
                        })
                      }
                    >
                      <X size={16} />
                      Not yet
                    </button>
                    <button
                      className="button primary"
                      disabled={busy}
                      onClick={() =>
                        submit({
                          answers:
                            lastResponse.current?.answers ??
                            current.response?.answers ??
                            {},
                          manualCorrect: true,
                        })
                      }
                    >
                      <Check size={16} />I got it right
                    </button>
                  </div>
                </div>
              ) : (
                view.mode === "review" && (
                  <div className="review-rating">
                    <div className="section-heading">
                      <div>
                        <h3>How well did you remember?</h3>
                        <p className="muted small">
                          The highlighted rating follows your answer. Adjust it
                          if you guessed or struggled.
                        </p>
                      </div>
                    </div>
                    <div className="rating-grid">
                      {(
                        [
                          {
                            value: 1,
                            label: "Again",
                            detail: "Could not recall",
                          },
                          {
                            value: 2,
                            label: "Hard",
                            detail: "Recalled with effort",
                          },
                          {
                            value: 3,
                            label: "Good",
                            detail: "Recalled correctly",
                          },
                          {
                            value: 4,
                            label: "Easy",
                            detail: "Recalled effortlessly",
                          },
                        ] as const
                      ).map((rating) => (
                        <button
                          key={rating.value}
                          disabled={busy}
                          className={`rating-button rating-${rating.value} ${rating.value === (current.recommendedRating ?? (current.grade?.correct ? 3 : 1)) ? "recommended" : ""}`}
                          onClick={() => rate(rating.value)}
                        >
                          <strong>{rating.label}</strong>
                          <span>{rating.detail}</span>
                          {rating.value ===
                            (current.recommendedRating ??
                              (current.grade?.correct ? 3 : 1)) && (
                            <span className="rating-default">Enter ↵</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              )}
            </>
          )}
        </section>
      )}
      {view && !feedback && view.status !== "completed" && !current && (
        <div className="panel study-empty">
          <CheckCircle2 size={32} />
          <h2>You’re all caught up.</h2>
          <p className="muted">
            There are no eligible questions in this session.
          </p>
          <button className="button primary" onClick={onClose}>
            Back to your course
          </button>
        </div>
      )}
      {view?.mode !== "review" && view?.status !== "completed" && (
        <div className="study-note">
          <Clock3 size={15} />
          <p>
            Practice builds understanding. This session does not change your
            review schedule.
          </p>
        </div>
      )}
    </div>
  );
}
