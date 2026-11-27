import React, { useState, useEffect } from "react";
import {
  BookOpen,
  Search,
  Check,
  Plus,
  ArrowRight,
  ExternalLink,
  Layers3,
  Target,
  Calculator,
  Info,
} from "lucide-react";
import { ACELLUS_COURSES, ACELLUS_CATALOG_URL } from "../lib/catalog";
import { api, type Course, type Unit } from "./api";
import { Modal, ErrorNotice } from "./ui";
export function CreateCourse({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [tab, setTab] = useState("catalog"),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState(""),
    [name, setName] = useState(""),
    [subject, setSubject] = useState(""),
    [isMath, setIsMath] = useState(false),
    [units, setUnits] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const selection = ACELLUS_COURSES.find((c) => c.id === selected);
  const filtered = ACELLUS_COURSES.filter((c) =>
    (c.name + " " + c.subject).toLowerCase().includes(query.toLowerCase()),
  );
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const c = await api(
        "courses.create",
        tab === "catalog"
          ? {
              name: selection!.name,
              subject: selection!.subject,
              isMath: selection!.isMath,
              units: selection!.units,
              sourceUrl: selection!.sourceUrl,
            }
          : {
              name,
              subject: subject || "General",
              isMath,
              units: units
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean),
            },
      );
      onCreated(c.id || c.course?.id);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Add a course"
      subtitle="Create a home for your next chapter."
      onClose={onClose}
      wide
    >
      <form onSubmit={submit}>
        <div className="segmented">
          <button
            type="button"
            className={tab === "catalog" ? "selected" : ""}
            onClick={() => setTab("catalog")}
          >
            Acellus catalog
          </button>
          <button
            type="button"
            className={tab === "custom" ? "selected" : ""}
            onClick={() => setTab("custom")}
          >
            Custom course
          </button>
        </div>
        {tab === "catalog" ? (
          <>
            <div className="search-field">
              <Search size={17} />
              <input
                placeholder="Search subjects and courses…"
                aria-label="Search Acellus catalog"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="catalog-list">
              {filtered.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  className={`catalog-item ${selected === c.id ? "selected" : ""}`}
                  onClick={() => setSelected(c.id)}
                >
                  <div className="catalog-icon">
                    {c.isMath ? (
                      <Calculator size={18} />
                    ) : (
                      <BookOpen size={18} />
                    )}
                  </div>
                  <div>
                    <strong>{c.name}</strong>
                    <span>
                      {c.subject} ·{" "}
                      {c.unitsVerified
                        ? `${c.units.length} verified units`
                        : "Add units manually"}
                    </span>
                  </div>
                  {selected === c.id && <Check size={17} />}
                </button>
              ))}
            </div>
            {selection && (
              <div className="info-notice">
                <Info size={17} />
                <span>
                  {selection.unitsVerified
                    ? "Official course name and ordered units will be imported. Cards are added separately."
                    : "The course name is verified. Its unit sequence is unavailable; you can create or import units after adding it."}{" "}
                  <a
                    href={selection.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View source ↗
                  </a>
                </span>
              </div>
            )}
            <p className="fine-print">
              Course metadata from the{" "}
              <a href={ACELLUS_CATALOG_URL} target="_blank" rel="noreferrer">
                official Acellus high-school catalog
              </a>
              . No course content is generated.
            </p>
          </>
        ) : (
          <div className="form-stack">
            <label className="form-field">
              Course name
              <input
                required
                maxLength={200}
                placeholder="e.g. World History"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="form-field">
              Subject
              <input
                maxLength={100}
                placeholder="e.g. Social Studies"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={isMath}
                onChange={(e) => setIsMath(e.target.checked)}
              />
              <span>
                Math course{" "}
                <small>
                  Includes separate Concept Review and Problem Practice.
                </small>
              </span>
            </label>
            <label className="form-field">
              Units <span className="muted">Optional · one per line</span>
              <textarea
                rows={5}
                value={units}
                onChange={(e) => setUnits(e.target.value)}
                placeholder={"Foundations\nUnit 2\nUnit 3"}
              />
            </label>
          </div>
        )}
        <ErrorNotice message={error} />
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="button primary"
            disabled={busy || (tab === "catalog" ? !selection : !name.trim())}
          >
            {busy ? "Creating…" : "Create course"}
            <ArrowRight size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function SessionSetup({
  course,
  units: providedUnits,
  initialMode = "review",
  onClose,
  onStarted,
}: {
  course: Course;
  units?: Unit[];
  initialMode?: "review" | "quiz" | "problem";
  onClose: () => void;
  onStarted: (id: string) => void;
}) {
  const [units, setUnits] = useState(providedUnits || []),
    [mode, setMode] = useState(initialMode),
    [scope, setScope] = useState("course"),
    [unitId, setUnitId] = useState(""),
    [count, setCount] = useState(20),
    [selection, setSelection] = useState("random"),
    [feedback, setFeedback] = useState("immediate"),
    [include, setInclude] = useState(false),
    [early, setEarly] = useState(false),
    [skill, setSkill] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (!providedUnits)
      api("courses.get", { id: course.id })
        .then((d) => setUnits(d.units))
        .catch((e) => setError(e.message));
  }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const session = await api("sessions.create", {
        courseId: course.id,
        mode,
        scope,
        unitId: scope === "unit" ? unitId : undefined,
        count,
        selection,
        feedback,
        includeUnintroduced: include,
        early,
        skill: skill || undefined,
      });
      onStarted(session.id);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Find your focus" subtitle={course.name} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="mode-options">
          <button
            type="button"
            className={`mode-option ${mode === "review" ? "selected" : ""}`}
            onClick={() => setMode("review")}
          >
            <Layers3 size={20} />
            <strong>
              {course.isMath ? "Concept Review" : "Scheduled Review"}
            </strong>
            <span>Build lasting memory with FSRS</span>
          </button>
          <button
            type="button"
            className={`mode-option ${mode === "quiz" ? "selected" : ""}`}
            onClick={() => setMode("quiz")}
          >
            <Target size={20} />
            <strong>Practice Quiz</strong>
            <span>Test yourself, keep schedules intact</span>
          </button>
          {course.isMath && (
            <button
              type="button"
              className={`mode-option ${mode === "problem" ? "selected" : ""}`}
              onClick={() => setMode("problem")}
            >
              <Calculator size={20} />
              <strong>Problem Practice</strong>
              <span>Apply your skills, step by step</span>
            </button>
          )}
        </div>
        <div className="form-stack">
          <label className="form-field">
            Study scope
            <select value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="course">Entire course</option>
              <option value="unit">One unit</option>
              <option value="midterm" disabled={!course.midtermUnitId}>
                Before the midterm
                {!course.midtermUnitId ? " · set boundary first" : ""}
              </option>
            </select>
          </label>
          {scope === "unit" && (
            <label className="form-field">
              Unit
              <select
                required
                value={unitId}
                onChange={(e) => setUnitId(e.target.value)}
              >
                <option value="">Select unit</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="field-row">
            <label className="form-field">
              {mode === "review" ? "Session limit" : "Questions"}
              <input
                type="number"
                min={1}
                max={300}
                required
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
              />
            </label>
            {mode !== "review" && (
              <label className="form-field">
                Selection
                <select
                  value={selection}
                  onChange={(e) => setSelection(e.target.value)}
                >
                  <option value="random">Random</option>
                  <option value="balanced">Balanced across units</option>
                  <option value="weak">Prioritize weak areas</option>
                </select>
              </label>
            )}
          </div>
          {mode !== "review" && (
            <>
              <div className="preset-row">
                {[10, 20, 50, 100, 300].map((n) => (
                  <button
                    type="button"
                    className={count === n ? "selected" : ""}
                    key={n}
                    onClick={() => setCount(n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <label className="form-field">
                Feedback
                <select
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                >
                  <option value="immediate">After each question</option>
                  <option value="end">At the end</option>
                </select>
              </label>
              <label className="form-field">
                Skill filter <span className="muted">Optional</span>
                <input
                  value={skill}
                  onChange={(e) => setSkill(e.target.value)}
                  placeholder="e.g. linear-equations"
                />
              </label>
            </>
          )}
          {mode === "quiz" && (
            <label className="check-label">
              <input
                type="checkbox"
                checked={include}
                onChange={(e) => setInclude(e.target.checked)}
              />
              <span>
                Include unintroduced cards
                <small>Practicing does not introduce them into FSRS.</small>
              </span>
            </label>
          )}
          {mode === "review" && (
            <label className="check-label">
              <input
                type="checkbox"
                checked={early}
                onChange={(e) => setEarly(e.target.checked)}
              />
              <span>
                Review early too
                <small>
                  Deliberately include introduced cards that aren’t due yet.
                </small>
              </span>
            </label>
          )}
        </div>
        <ErrorNotice message={error} />
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? "Preparing…" : "Begin session"}
            <ArrowRight size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
