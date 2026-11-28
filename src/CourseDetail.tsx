import React, { useState, useEffect } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Archive,
  BookOpen,
  Layers3,
  Plus,
  Settings2,
  Target,
  Calculator,
  ChevronUp,
  ChevronDown,
  Check,
  Play,
  ExternalLink,
  Flag,
  PenLine,
} from "lucide-react";
import {
  api,
  number,
  percent,
  resumeLabel,
  type Course,
  type SessionSummary,
  type Unit,
} from "./api";
import { Modal, Empty, Loading, ErrorNotice, Stat } from "./ui";
import { SessionSetup } from "./dialogs";
import CardLibrary from "./CardLibrary";
import Statistics from "./Statistics";
import {
  reviewNotice,
  useReviewsDue,
  type ReviewAction,
} from "./review-availability";
export default function CourseDetail({
  id,
  initialTab = "study",
  revision,
  refresh,
  onSession,
}: {
  id: string;
  initialTab?: "study" | "units" | "cards";
  revision: number;
  refresh: () => void;
  onSession: (id: string) => void;
}) {
  const [course, setCourse] = useState<Course | null>(null),
    [units, setUnits] = useState<Unit[]>([]),
    [tab, setTab] = useState<string>(initialTab),
    [resume, setResume] = useState<SessionSummary | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [settings, setSettings] = useState(false),
    [newUnit, setNewUnit] = useState(false),
    [study, setStudy] = useState<"review" | "quiz" | "problem" | null>(null),
    [introduce, setIntroduce] = useState<Unit | null>(null);
  useEffect(() => setTab(initialTab), [initialTab]);
  useEffect(() => {
    let live = true;
    api<{
      course: Course;
      units: Unit[];
      resumeSession: SessionSummary | null;
    }>("courses.get", { id })
      .then((d) => {
        if (!live) return;
        setCourse(d.course);
        setUnits(d.units);
        setResume(d.resumeSession);
        setError("");
      })
      .catch((e) => live && setError(e.message))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [id, revision]);
  const changed = refresh;
  const reviewsDue = useReviewsDue(course ?? undefined);
  function onReviewAction(action: ReviewAction, scopedUnits = units) {
    setStudy(null);
    if (action === "introduce") {
      const waiting = scopedUnits.filter((unit) => unit.unintroducedCards);
      if (waiting.length === 1) setIntroduce(waiting[0]);
      else setTab("units");
    } else if (action === "library") setTab("cards");
    else if (action === "add-unit") setNewUnit(true);
    else setSettings(true);
  }
  async function reorder(index: number, direction: number) {
    const next = [...units];
    [next[index], next[index + direction]] = [
      next[index + direction],
      next[index],
    ];
    try {
      await api("units.reorder", {
        courseId: id,
        unitIds: next.map((u) => u.id),
      });
      changed();
    } catch (e: any) {
      setError(e.message);
    }
  }
  if (loading) return <Loading />;
  if (!course) return <ErrorNotice message={error || "Course not found."} />;
  const reviewsPaused = course.archived && course.archiveMode === "paused";
  const emptyReview =
    reviewsPaused || !reviewsDue
      ? reviewNotice(course, units.length > 0, reviewsPaused)
      : null;
  return (
    <>
      <a
        href={course.archived ? "#/archived" : "#/courses"}
        className="back-link"
      >
        <ArrowLeft size={15} />
        {course.archived ? "Archived courses" : "All courses"}
      </a>
      <div className="page-heading course-heading">
        <div>
          <div className="eyebrow">
            {course.subject}
            {course.archived && (
              <span className="badge">
                Archived · {course.archiveMode || "relaxed"}
              </span>
            )}
          </div>
          <h1>{course.name}</h1>
          <p>
            {units.length} units <span className="divider-dot" />{" "}
            {number(course.totalCards)} cards in your library
            {course.sourceUrl && (
              <>
                {" "}
                <span className="divider-dot" />
                <a href={course.sourceUrl} target="_blank" rel="noreferrer">
                  Official course outline <ExternalLink size={12} />
                </a>
              </>
            )}
          </p>
        </div>
        <button className="button secondary" onClick={() => setSettings(true)}>
          <Settings2 size={16} />
          Course settings
        </button>
      </div>
      <div className="tabs">
        <button
          className={tab === "study" ? "active" : ""}
          onClick={() => setTab("study")}
        >
          {course.isMath ? "Concept Review" : "Study"}
        </button>
        <button
          className={tab === "units" ? "active" : ""}
          onClick={() => setTab("units")}
        >
          Units <span>{units.length}</span>
        </button>
        <button
          className={tab === "cards" ? "active" : ""}
          onClick={() => setTab("cards")}
        >
          Card library <span>{number(course.totalCards)}</span>
        </button>
        {course.isMath && (
          <button
            className={tab === "problems" ? "active" : ""}
            onClick={() => setTab("problems")}
          >
            Problem Practice
          </button>
        )}
        <button
          className={tab === "statistics" ? "active" : ""}
          onClick={() => setTab("statistics")}
        >
          Statistics
        </button>
      </div>
      <ErrorNotice message={error} />
      {resume && (
        <button
          className="button secondary course-resume"
          onClick={() => onSession(resume.id)}
        >
          <Play size={15} />
          {resumeLabel(resume.mode)} · {resume.answered} of {resume.total}{" "}
          complete
        </button>
      )}
      {tab === "study" ? (
        <>
          <div className="stats-grid">
            <Stat
              label="Ready to review"
              value={number(course.dueCards)}
              detail={
                course.archived
                  ? "Separate from active courses"
                  : "Due now, including learning cards"
              }
              accent
            />
            <Stat
              label="Introduced"
              value={number(course.introducedCards ?? course.activeCards)}
              detail="A growing foundation"
            />
            <Stat
              label="In your library"
              value={number(course.unintroducedCards)}
              detail="Waiting until you’re ready"
            />
            <Stat
              label="Suspended"
              value={number(course.suspendedCards)}
              detail="Progress safely preserved"
            />
          </div>
          <div className="study-choices">
            <section className="panel study-choice">
              <span className="study-choice-icon sage">
                <Layers3 size={24} />
              </span>
              <span className="eyebrow">REMEMBER FOR LONGER</span>
              <h2>{course.isMath ? "Concept Review" : "Scheduled Review"}</h2>
              <p>
                {emptyReview?.message ??
                  "Review cards that are due. FSRS adapts to how well you remember."}
              </p>
              <div className="button-row">
                {emptyReview?.action && (
                  <button
                    className="button primary"
                    onClick={() => onReviewAction(emptyReview.action!)}
                  >
                    {emptyReview.label}
                  </button>
                )}
                {!reviewsPaused &&
                  (reviewsDue || Boolean(course.activeCards)) && (
                    <button
                      className={`button ${emptyReview?.action ? "secondary" : "primary"}`}
                      onClick={() => setStudy("review")}
                    >
                      <Play size={15} />
                      {reviewsDue ? "Start review" : "Review early"}
                    </button>
                  )}
              </div>
            </section>
            <section className="panel study-choice">
              <span className="study-choice-icon amber">
                <Target size={24} />
              </span>
              <span className="eyebrow">PUT IT INTO PRACTICE</span>
              <h2>Practice Quiz</h2>
              <p>
                Choose your scope, focus on weak areas, and prepare for exams.
                Your FSRS schedule stays unchanged.
              </p>
              <button
                className="button secondary"
                onClick={() => setStudy("quiz")}
              >
                Build a quiz
                <ArrowRight size={16} />
              </button>
            </section>
          </div>
          <div className="section-title">
            <div>
              <h2>Build your deck, gradually</h2>
              <p>Introduce just the cards you’re ready to learn.</p>
            </div>
            <button className="text-button" onClick={() => setTab("units")}>
              Manage units
              <ArrowRight size={15} />
            </button>
          </div>
          <section className="panel">
            {units.length ? (
              <div className="unit-preview">
                {units.slice(0, 5).map((u, i) => (
                  <div className="unit-row" key={u.id}>
                    <span className="unit-number">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div className="unit-name">
                      <strong>{u.name}</strong>
                      <span>
                        {number(u.introducedCards ?? u.activeCards)} introduced
                        · {number(u.unintroducedCards)} unintroduced
                      </span>
                    </div>
                    <div className="unit-mini-bar">
                      <span
                        style={{
                          width: `${u.totalCards ? ((u.introducedCards ?? u.activeCards ?? 0) / u.totalCards) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <button
                      className="button compact secondary"
                      disabled={!u.unintroducedCards}
                      onClick={() => setIntroduce(u)}
                    >
                      <Plus size={14} />
                      Introduce
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <Empty
                title="Give your course some structure"
                body="Add units to organize imported cards and introduce material at your own pace."
                action={
                  <button
                    className="button primary"
                    onClick={() => setNewUnit(true)}
                  >
                    <Plus size={16} />
                    Add your first unit
                  </button>
                }
              />
            )}
          </section>
        </>
      ) : tab === "units" ? (
        <>
          <div className="section-title">
            <div>
              <h2>Course units</h2>
              <p>
                The midterm includes your selected boundary unit and everything
                before it.
              </p>
            </div>
            <button className="button primary" onClick={() => setNewUnit(true)}>
              <Plus size={16} />
              Add unit
            </button>
          </div>
          <section className="panel">
            {units.length ? (
              <div className="units-table">
                {units.map((u, i) => (
                  <div
                    className={`unit-manage-row ${course.midtermUnitId === u.id ? "midterm-boundary" : ""}`}
                    key={u.id}
                  >
                    <span className="unit-number">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div className="unit-name">
                      <strong>{u.name}</strong>
                      <span>
                        {number(u.totalCards)} cards ·{" "}
                        {number(u.introducedCards ?? u.activeCards)} introduced
                        · {number(u.unintroducedCards)} new ·{" "}
                        {number(u.suspendedCards)} suspended ·{" "}
                        {number(u.dueCards)} due
                      </span>
                      {course.midtermUnitId === u.id && (
                        <span className="midterm-label">
                          <Flag size={11} />
                          Midterm ends here
                        </span>
                      )}
                    </div>
                    <div className="unit-reorder">
                      <button
                        className="icon-button"
                        aria-label={`Move ${u.name} up`}
                        disabled={i === 0}
                        onClick={() => reorder(i, -1)}
                      >
                        <ChevronUp size={15} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`Move ${u.name} down`}
                        disabled={i === units.length - 1}
                        onClick={() => reorder(i, 1)}
                      >
                        <ChevronDown size={15} />
                      </button>
                    </div>
                    <button
                      className="icon-button"
                      aria-label={`Rename ${u.name}`}
                      onClick={() => {
                        const name = window.prompt("Unit name", u.name);
                        if (name?.trim())
                          api("units.update", { id: u.id, name: name.trim() })
                            .then(changed)
                            .catch((e) => setError(e.message));
                      }}
                    >
                      <PenLine size={15} />
                    </button>
                    <button
                      className="button compact secondary"
                      onClick={() => setIntroduce(u)}
                      disabled={!u.unintroducedCards}
                    >
                      Introduce
                      <Plus size={14} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <Empty
                title="No units yet"
                body="Create a unit before importing your cards."
                action={
                  <button
                    className="button primary"
                    onClick={() => setNewUnit(true)}
                  >
                    Add unit
                  </button>
                }
              />
            )}
          </section>
        </>
      ) : tab === "cards" || tab === "problems" ? (
        <CardLibrary
          course={course}
          units={units}
          mode={tab === "problems" ? "problem" : "card"}
          refresh={changed}
          onPractice={() => setStudy("problem")}
        />
      ) : (
        <Statistics courses={[course]} fixedCourseId={id} units={units} />
      )}
      {newUnit && (
        <NewUnit
          courseId={id}
          onClose={() => setNewUnit(false)}
          onSaved={() => {
            setNewUnit(false);
            changed();
          }}
        />
      )}
      {settings && (
        <CourseSettings
          course={course}
          units={units}
          onClose={() => setSettings(false)}
          onSaved={() => {
            setSettings(false);
            changed();
          }}
        />
      )}
      {study && (
        <SessionSetup
          course={course}
          units={units}
          initialMode={study}
          initialEarly={study === "review" && !reviewsDue}
          onReviewAction={onReviewAction}
          onClose={() => setStudy(null)}
          onStarted={onSession}
        />
      )}{" "}
      {introduce && (
        <Introduce
          unit={introduce}
          onClose={() => setIntroduce(null)}
          onSaved={() => {
            setIntroduce(null);
            changed();
          }}
        />
      )}
    </>
  );
}
function NewUnit({
  courseId,
  onClose,
  onSaved,
}: {
  courseId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal title="Add a unit" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await api("units.create", { courseId, name });
            onSaved();
          } catch (e: any) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="form-field">
          Unit name
          <input
            required
            value={name}
            maxLength={200}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Core concepts"
          />
        </label>
        <ErrorNotice message={error} />
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? "Adding…" : "Add unit"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function Introduce({
  unit,
  onClose,
  onSaved,
}: {
  unit: Unit;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [count, setCount] = useState(Math.min(20, unit.unintroducedCards || 1)),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal title="Introduce new cards" subtitle={unit.name} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await api("cards.introduce", { unitId: unit.id, count });
            onSaved();
          } catch (e: any) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="dialog-copy">
          The next cards in stored order will join your review queue as new
          cards. They will only receive learning history when you actually
          review them.
        </p>
        <label className="form-field">
          How many cards?
          <input
            type="number"
            required
            min={1}
            max={unit.unintroducedCards || 1}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          />
          <small>
            {number(unit.unintroducedCards)} cards available in this unit.
          </small>
        </label>
        <ErrorNotice message={error} />
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy
              ? "Introducing…"
              : count === 1
                ? "Introduce 1 card"
                : `Introduce ${count} cards`}
            <Plus size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
function CourseSettings({
  course: c,
  units,
  onClose,
  onSaved,
}: {
  course: Course;
  units: Unit[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(c.name),
    [subject, setSubject] = useState(c.subject),
    [midterm, setMidterm] = useState(c.midtermUnitId || ""),
    [retention, setRetention] = useState(
      Math.round((c.retention || 0.9) * 100),
    ),
    [relaxed, setRelaxed] = useState(
      Math.round((c.relaxedRetention || 0.8) * 100),
    ),
    [max, setMax] = useState(c.maxInterval || 36500),
    [archive, setArchive] = useState(c.archived),
    [archiveMode, setArchiveMode] = useState(c.archiveMode || "relaxed"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal
      title="Course settings"
      subtitle="Adjust the pace without losing your progress."
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await api("courses.update", {
              id: c.id,
              name,
              subject,
              midtermUnitId: midterm || null,
              retention: retention / 100,
              relaxedRetention: relaxed / 100,
              maxInterval: max,
              archived: archive,
              archiveMode,
            });
            onSaved();
          } catch (e: any) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-stack">
          <label className="form-field">
            Course name
            <input
              value={name}
              required
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="form-field">
            Subject
            <input
              value={subject}
              required
              onChange={(e) => setSubject(e.target.value)}
            />
          </label>
          <label className="form-field">
            Midterm boundary
            <select
              value={midterm}
              onChange={(e) => setMidterm(e.target.value)}
            >
              <option value="">Not set</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  Through {u.name}
                </option>
              ))}
            </select>
          </label>
          <div className="field-row">
            <label className="form-field">
              Desired retention (%)
              <input
                type="number"
                min={70}
                max={99}
                value={retention}
                onChange={(e) => setRetention(+e.target.value)}
              />
            </label>
            <label className="form-field">
              Maximum interval (days)
              <input
                type="number"
                min={1}
                max={36500}
                value={max}
                onChange={(e) => setMax(+e.target.value)}
              />
            </label>
          </div>
          <div className="setting-divider" />
          <label className="check-label">
            <input
              type="checkbox"
              checked={archive}
              onChange={(e) => setArchive(e.target.checked)}
            />
            <span>
              Archive this course
              <small>Preserves cards, schedules, and every study record.</small>
            </span>
          </label>
          {archive && (
            <>
              <label className="form-field">
                Archived review mode
                <select
                  value={archiveMode}
                  onChange={(e) => setArchiveMode(e.target.value)}
                >
                  <option value="relaxed">Relaxed FSRS · recommended</option>
                  <option value="normal">Normal FSRS</option>
                  <option value="paused">Paused</option>
                </select>
              </label>
              {archiveMode === "relaxed" && (
                <label className="form-field">
                  Relaxed retention (%)
                  <input
                    type="number"
                    min={70}
                    max={99}
                    value={relaxed}
                    onChange={(e) => setRelaxed(+e.target.value)}
                  />
                </label>
              )}
            </>
          )}
          <p className="fine-print">
            Retention settings affect future reviews. Existing due dates are
            preserved.
          </p>
        </div>
        <ErrorNotice message={error} />
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
            <Check size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
