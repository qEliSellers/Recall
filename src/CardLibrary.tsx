import React, { useState, useEffect } from "react";
import {
  Search,
  Plus,
  Upload,
  PenLine,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  Check,
  ImagePlus,
  Info,
  Calculator,
  Trash2,
  Layers3,
} from "lucide-react";
import { api, typeLabel, type Course, type Unit, type CardRow } from "./api";
import { Modal, Empty, Loading, ErrorNotice } from "./ui";
import type { ImportResult } from "../lib/import-format";
import ImportDialog from "./ImportDialog";
const exampleContent = {
  type: "multiple_choice",
  prompt: "Synthetic example: which number is even?",
  options: [
    { id: "a", text: "2" },
    { id: "b", text: "3" },
    { id: "c", text: "5" },
  ],
  correctOptionIds: ["a"],
  explanation: "2 is divisible by 2 without a remainder.",
};
export default function CardLibrary({
  course,
  units,
  mode,
  refresh,
  onPractice,
}: {
  course: Course;
  units: Unit[];
  mode: "card" | "problem";
  refresh: () => void;
  onPractice: () => void;
}) {
  const [items, setItems] = useState<CardRow[]>([]),
    [total, setTotal] = useState(0),
    [search, setSearch] = useState(""),
    [unitId, setUnitId] = useState(""),
    [status, setStatus] = useState(""),
    [type, setType] = useState(""),
    [skill, setSkill] = useState(""),
    [offset, setOffset] = useState(0),
    [selected, setSelected] = useState<string[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [importing, setImporting] = useState(false),
    [importResult, setImportResult] = useState<ImportResult | null>(null),
    [editing, setEditing] = useState<CardRow | null | undefined>(undefined),
    [localRevision, setLocalRevision] = useState(0),
    [busy, setBusy] = useState(false);
  const prefix = mode === "problem" ? "problems" : "cards";
  useEffect(() => {
    setOffset(0);
    setSelected([]);
  }, [search, unitId, status, type, skill, mode]);
  useEffect(() => {
    let live = true;
    setLoading(true);
    const timeout = setTimeout(
      () =>
        api(`${prefix}.list`, {
          courseId: course.id,
          unitId: unitId || undefined,
          status: mode === "card" ? status || undefined : undefined,
          type: type || undefined,
          skill: skill || undefined,
          search: search || undefined,
          limit: 40,
          offset,
        })
          .then((r) => {
            if (live) {
              setItems(Array.isArray(r) ? r : r.items || []);
              setTotal(Array.isArray(r) ? r.length : r.total);
              setError("");
            }
          })
          .catch((e) => live && setError(e.message))
          .finally(() => live && setLoading(false)),
      180,
    );
    return () => {
      live = false;
      clearTimeout(timeout);
    };
  }, [
    course.id,
    mode,
    search,
    unitId,
    status,
    type,
    skill,
    offset,
    localRevision,
  ]);
  const changed = () => {
    setLocalRevision((v) => v + 1);
    setSelected([]);
    refresh();
  };
  async function bulk(action: "introduce" | "active" | "suspended") {
    setBusy(true);
    setError("");
    try {
      if (action === "introduce") {
        const rows = items.filter(
          (i) => selected.includes(i.id) && i.status === "unintroduced",
        );
        for (const u of new Set(rows.map((r) => r.unitId)))
          await api("cards.introduce", {
            unitId: u,
            cardIds: rows.filter((r) => r.unitId === u).map((r) => r.id),
          });
      } else await api("cards.status", { ids: selected, status: action });
      changed();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="section-title">
        <div>
          <h2>
            {mode === "problem" ? "Your problem library" : "Your card library"}
          </h2>
          <p>
            {mode === "problem"
              ? "Practice applying your knowledge. Problem attempts never change FSRS."
              : "Import now. Introduce when you’re ready. Every card keeps its own history."}
          </p>
        </div>
        <div className="button-row">
          {mode === "problem" && (
            <button className="button primary" onClick={onPractice}>
              <Play size={15} />
              Practice
            </button>
          )}
          <button
            className="button secondary"
            onClick={() => setImporting(true)}
            disabled={!units.length}
          >
            <Upload size={16} />
            Import
          </button>
          <button
            className="button secondary"
            onClick={() => setEditing(null)}
            disabled={!units.length}
          >
            <Plus size={16} />
            {mode === "problem" ? "New problem" : "New card"}
          </button>
        </div>
      </div>
      {!units.length ? (
        <div className="info-notice">
          <Info size={18} />
          <span>
            Add a unit in the Units tab before creating or importing{" "}
            {mode === "problem" ? "problems" : "cards"}.
          </span>
        </div>
      ) : null}
      <section className="panel library-panel">
        <div className="library-filters">
          <div className="search-field">
            <Search size={16} />
            <input
              aria-label="Search library"
              placeholder={`Search ${mode === "problem" ? "problems" : "cards"}…`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            aria-label="Filter by unit"
            value={unitId}
            onChange={(e) => setUnitId(e.target.value)}
          >
            <option value="">All units</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          {mode === "card" && (
            <select
              aria-label="Filter by status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">All statuses</option>
              <option value="unintroduced">Unintroduced</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>
          )}
          <select
            aria-label="Filter by question type"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="">All formats</option>
            {[
              "multiple_choice",
              "cloze",
              "multiple_select",
              "matching",
              "sequencing",
              "true_false",
              "typed",
            ].map((t) => (
              <option key={t} value={t}>
                {typeLabel(t)}
              </option>
            ))}
          </select>
          <input
            className="skill-filter"
            aria-label="Filter by skill"
            placeholder="Skill tag"
            value={skill}
            onChange={(e) => setSkill(e.target.value)}
          />
        </div>
        <ErrorNotice message={error} />
        {selected.length > 0 && mode === "card" && (
          <div className="selection-toolbar">
            <strong>{selected.length} selected</strong>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => bulk("introduce")}
            >
              <Plus size={14} />
              Introduce new
            </button>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => bulk("suspended")}
            >
              <Pause size={14} />
              Suspend
            </button>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => bulk("active")}
            >
              <Play size={14} />
              Reactivate
            </button>
            <button
              className="icon-button"
              onClick={() => setSelected([])}
              aria-label="Clear selection"
            >
              ×
            </button>
          </div>
        )}
        {loading ? (
          <Loading />
        ) : items.length ? (
          <>
            <div className="library-table">
              <div className="library-row library-table-head">
                {mode === "card" && (
                  <input
                    aria-label="Select all visible cards"
                    type="checkbox"
                    checked={
                      items.length > 0 &&
                      items.every((i) => selected.includes(i.id))
                    }
                    onChange={(e) =>
                      setSelected(
                        e.target.checked ? items.map((i) => i.id) : [],
                      )
                    }
                  />
                )}
                <span>QUESTION</span>
                <span>UNIT & FORMAT</span>
                <span>{mode === "card" ? "STATUS" : "DIFFICULTY"}</span>
                <span />
              </div>
              {items.map((item) => (
                <div className="library-row" key={item.id}>
                  {mode === "card" && (
                    <input
                      aria-label={`Select ${item.content.prompt}`}
                      type="checkbox"
                      checked={selected.includes(item.id)}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? [...selected, item.id]
                            : selected.filter((id) => id !== item.id),
                        )
                      }
                    />
                  )}
                  <button
                    className="question-summary"
                    onClick={() => setEditing(item)}
                  >
                    <strong>{item.content.prompt}</strong>
                    <span>
                      {item.skills?.length ? (
                        item.skills.map((s) => (
                          <span className="skill-tag" key={s}>
                            {s}
                          </span>
                        ))
                      ) : (
                        <span className="muted">No skill tags</span>
                      )}
                    </span>
                  </button>
                  <div className="library-unit">
                    <strong>
                      {units.find((u) => u.id === item.unitId)?.name || "Unit"}
                    </strong>
                    <span>{typeLabel(item.content.type)}</span>
                  </div>
                  <span className={`status-badge ${item.status || ""}`}>
                    {mode === "problem"
                      ? `${item.difficulty || 1} / 5`
                      : item.status === "unintroduced"
                        ? "Unintroduced"
                        : item.status === "active"
                          ? "Active"
                          : "Suspended"}
                  </span>
                  <button
                    className="icon-button"
                    aria-label="Edit question"
                    onClick={() => setEditing(item)}
                  >
                    <PenLine size={16} />
                  </button>
                </div>
              ))}
            </div>
            <div className="pagination">
              <span>
                {offset + 1}–{Math.min(offset + items.length, total)} of {total}
              </span>
              <div>
                <button
                  className="icon-button"
                  disabled={offset === 0}
                  aria-label="Previous page"
                  onClick={() => setOffset(Math.max(0, offset - 40))}
                >
                  <ChevronLeft size={17} />
                </button>
                <button
                  className="icon-button"
                  disabled={offset + items.length >= total}
                  aria-label="Next page"
                  onClick={() => setOffset(offset + 40)}
                >
                  <ChevronRight size={17} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <Empty
            title={
              search || (mode === "card" && status) || unitId || type || skill
                ? "No matching questions"
                : mode === "problem"
                  ? "Put understanding into practice"
                  : "A library waiting to grow"
            }
            body={
              search || (mode === "card" && status) || unitId || type || skill
                ? "Try adjusting your filters."
                : mode === "problem"
                  ? "Import your own problems with skill tags, hints, and worked solutions."
                  : "Add your own content in JSON or CSV. Imported cards stay unintroduced until you choose to study them."
            }
            icon={
              mode === "problem" ? (
                <Calculator size={27} />
              ) : (
                <Layers3 size={27} />
              )
            }
            action={
              units.length ? (
                <button
                  className="button secondary"
                  onClick={() => setImporting(true)}
                >
                  <Upload size={16} />
                  Import {mode === "problem" ? "problems" : "cards"}
                </button>
              ) : undefined
            }
          />
        )}
      </section>
      {importResult && (
        <div className="success-notice" role="status">
          <Check size={16} />
          <span>
            {importResult.replayed
              ? "This batch was already imported."
              : `Added ${importResult.units?.reduce((sum, unit) => sum + unit.cards.imported, 0) ?? 0} cards and ${importResult.units?.reduce((sum, unit) => sum + unit.problems.imported, 0) ?? 0} problems. ${importResult.skipped} existing items skipped.`}
          </span>
        </div>
      )}
      {importing && (
        <ImportDialog
          course={course}
          units={units}
          kind={prefix}
          initialUnitId={unitId}
          onClose={() => setImporting(false)}
          onSaved={(result) => {
            setImporting(false);
            setImportResult(result);
            setOffset(0);
            changed();
          }}
        />
      )}
      {editing !== undefined && (
        <Editor
          item={editing}
          course={course}
          units={units}
          mode={mode}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            changed();
          }}
        />
      )}
    </>
  );
}
function Editor({
  item,
  course,
  units,
  mode,
  onClose,
  onSaved,
}: {
  item: CardRow | null;
  course: Course;
  units: Unit[];
  mode: "card" | "problem";
  onClose: () => void;
  onSaved: () => void;
}) {
  const [unitId, setUnitId] = useState(item?.unitId || units[0]?.id || ""),
    [content, setContent] = useState(
      item?.content || {
        type: "multiple_choice",
        prompt: "",
        options: [
          { id: "a", text: "" },
          { id: "b", text: "" },
          { id: "c", text: "" },
          { id: "d", text: "" },
        ],
        correctOptionIds: ["a"],
      },
    ),
    [raw, setRaw] = useState(
      JSON.stringify(item?.content || exampleContent, null, 2),
    ),
    [advanced, setAdvanced] = useState(false),
    [skills, setSkills] = useState(item?.skills.join(", ") || ""),
    [difficulty, setDifficulty] = useState(item?.difficulty || 1),
    [hint, setHint] = useState(item?.hint || ""),
    [solution, setSolution] = useState(item?.solution || ""),
    [reset, setReset] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [uploading, setUploading] = useState(false);
  const simple = [
    "multiple_choice",
    "multiple_select",
    "true_false",
    "typed",
  ].includes(content.type);
  const update = (values: any) => setContent({ ...content, ...values });
  async function upload(file?: File) {
    if (!file) return;
    setUploading(true);
    try {
      const data = new FormData();
      data.set("file", file);
      const response = await fetch("/api/assets", {
        method: "POST",
        body: data,
      });
      const result: any = await response.json();
      if (!response.ok) throw new Error(result.error || "Upload failed");
      update({
        imageUrl: result.data.url,
        imageAlt: content.imageAlt || file.name,
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const finalContent = advanced || !simple ? JSON.parse(raw) : content;
      const payload = {
        unitId,
        content: finalContent,
        skills: skills
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        ...(mode === "problem"
          ? {
              difficulty,
              hint,
              solution,
            }
          : {}),
      };
      if (item)
        await api(`${mode === "problem" ? "problems" : "cards"}.update`, {
          id: item.id,
          ...payload,
          ...(mode === "card"
            ? { resetSchedule: reset, confirmReset: reset }
            : {}),
        });
      else
        await api(`${mode === "problem" ? "problems" : "cards"}.import`, {
          courseId: course.id,
          unitId,
          batchId: crypto.randomUUID(),
          [mode === "problem" ? "problems" : "cards"]: [payload],
        });
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={`${item ? "Edit" : "Create"} ${mode === "problem" ? "problem" : "card"}`}
      subtitle={
        item
          ? `Revision ${item.revision} · History is preserved unless explicitly reset.`
          : "New cards begin unintroduced."
      }
      onClose={onClose}
      wide
    >
      <form onSubmit={save}>
        <div className="form-stack">
          <div className="field-row">
            <label className="form-field">
              Unit
              <select
                value={unitId}
                onChange={(e) => setUnitId(e.target.value)}
              >
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              Question format
              <select
                value={content.type}
                onChange={(e) => {
                  const type = e.target.value;
                  const base = {
                    prompt: content.prompt,
                    explanation: content.explanation,
                  };
                  const next =
                    type === "typed"
                      ? { ...base, type, answer: "", grading: "numeric" }
                      : type === "cloze"
                        ? {
                            ...base,
                            type,
                            components: [
                              {
                                id: "blank-1",
                                prompt: "Fill in the blank",
                                options: [
                                  { id: "a", text: "Answer" },
                                  { id: "b", text: "Distractor" },
                                ],
                                correctOptionIds: ["a"],
                              },
                            ],
                          }
                        : type === "matching"
                          ? {
                              ...base,
                              type,
                              pairs: [
                                { id: "1", left: "Term", right: "Definition" },
                                {
                                  id: "2",
                                  left: "Another term",
                                  right: "Another definition",
                                },
                              ],
                            }
                          : type === "sequencing"
                            ? {
                                ...base,
                                type,
                                items: [
                                  { id: "1", text: "First step" },
                                  { id: "2", text: "Second step" },
                                ],
                              }
                            : {
                                ...base,
                                type,
                                options:
                                  type === "true_false"
                                    ? [
                                        { id: "true", text: "True" },
                                        { id: "false", text: "False" },
                                      ]
                                    : [
                                        { id: "a", text: "" },
                                        { id: "b", text: "" },
                                        { id: "c", text: "" },
                                        { id: "d", text: "" },
                                      ],
                                correctOptionIds: [
                                  type === "true_false" ? "true" : "a",
                                ],
                              };
                  setContent(next);
                  setRaw(JSON.stringify(next, null, 2));
                  setAdvanced(
                    ![
                      "multiple_choice",
                      "multiple_select",
                      "true_false",
                      "typed",
                    ].includes(type),
                  );
                }}
              >
                {[
                  "multiple_choice",
                  "cloze",
                  "multiple_select",
                  "matching",
                  "sequencing",
                  "true_false",
                  "typed",
                ].map((t) => (
                  <option key={t} value={t}>
                    {typeLabel(t)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="check-label">
            <input
              type="checkbox"
              checked={advanced || !simple}
              disabled={!simple}
              onChange={(e) => {
                if (e.target.checked) setRaw(JSON.stringify(content, null, 2));
                else {
                  try {
                    setContent(JSON.parse(raw));
                  } catch {
                    setError("Fix the JSON before switching editors.");
                    return;
                  }
                }
                setAdvanced(e.target.checked);
              }}
            />
            <span>
              Advanced JSON editor
              <small>
                Full control over components, variants, and distractor pools.
              </small>
            </span>
          </label>
          {advanced || !simple ? (
            <label className="form-field">
              Question definition
              <textarea
                className="code-editor"
                rows={16}
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                required
              />
            </label>
          ) : (
            <>
              <label className="form-field">
                Question
                <textarea
                  required
                  rows={3}
                  value={content.prompt}
                  onChange={(e) => update({ prompt: e.target.value })}
                  placeholder="What do you want to remember?"
                />
                <small>
                  Use $…$ for inline math and $$…$$ for display math. Use{" "}
                  {"\\$"} to mark a literal dollar sign next to a formula.
                </small>
              </label>
              {content.type === "typed" ? (
                <div className="field-row">
                  <label className="form-field">
                    Expected answer
                    <input
                      value={content.answer || ""}
                      onChange={(e) => update({ answer: e.target.value })}
                      required
                    />
                  </label>
                  <label className="form-field">
                    Grading
                    <select
                      value={content.grading}
                      onChange={(e) => update({ grading: e.target.value })}
                    >
                      <option value="numeric">
                        Numeric · integers, decimals, fractions
                      </option>
                      <option value="expression">
                        Simple algebraic expression
                      </option>
                      <option value="manual">Manual self-grading</option>
                    </select>
                  </label>
                </div>
              ) : (
                <div className="answer-editor">
                  <label>
                    Answer choices{" "}
                    <span className="muted">
                      Mark the correct{" "}
                      {content.type === "multiple_select"
                        ? "answers"
                        : "answer"}
                    </span>
                  </label>
                  {content.options.map((o: any, i: number) => (
                    <div className="answer-editor-row" key={o.id}>
                      <input
                        type={
                          content.type === "multiple_select"
                            ? "checkbox"
                            : "radio"
                        }
                        name="correct"
                        aria-label={`Option ${i + 1} is correct`}
                        checked={content.correctOptionIds.includes(o.id)}
                        onChange={(e) =>
                          update({
                            correctOptionIds:
                              content.type === "multiple_select"
                                ? e.target.checked
                                  ? [...content.correctOptionIds, o.id]
                                  : content.correctOptionIds.filter(
                                      (id: string) => id !== o.id,
                                    )
                                : [o.id],
                          })
                        }
                      />
                      <span>{String.fromCharCode(65 + i)}</span>
                      <input
                        value={o.text}
                        required
                        aria-label={`Option ${i + 1}`}
                        onChange={(e) =>
                          update({
                            options: content.options.map((x: any) =>
                              x.id === o.id
                                ? { ...x, text: e.target.value }
                                : x,
                            ),
                          })
                        }
                      />
                      {content.options.length > 2 && (
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={`Remove option ${i + 1}`}
                          onClick={() =>
                            update({
                              options: content.options.filter(
                                (x: any) => x.id !== o.id,
                              ),
                              correctOptionIds: content.correctOptionIds.filter(
                                (id: string) => id !== o.id,
                              ),
                            })
                          }
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                  {content.type !== "true_false" && (
                    <button
                      type="button"
                      className="text-button"
                      onClick={() =>
                        update({
                          options: [
                            ...content.options,
                            { id: crypto.randomUUID(), text: "" },
                          ],
                        })
                      }
                    >
                      <Plus size={14} />
                      Add choice / distractor
                    </button>
                  )}
                </div>
              )}
              <label className="form-field">
                Explanation <span className="muted">Shown after answering</span>
                <textarea
                  rows={3}
                  value={content.explanation || ""}
                  onChange={(e) => update({ explanation: e.target.value })}
                />
              </label>
              {content.type === "typed" && (
                <label className="form-field">
                  Numeric tolerance <span className="muted">Optional</span>
                  <input
                    type="number"
                    step="any"
                    min={0}
                    value={content.tolerance ?? ""}
                    onChange={(e) =>
                      update({
                        tolerance:
                          e.target.value === ""
                            ? undefined
                            : Number(e.target.value),
                      })
                    }
                  />
                </label>
              )}
              <div className="image-editor">
                <label className="button secondary">
                  <ImagePlus size={16} />
                  {uploading
                    ? "Uploading…"
                    : content.imageUrl
                      ? "Replace image"
                      : "Attach image"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    hidden
                    disabled={uploading}
                    onChange={(e) => upload(e.target.files?.[0])}
                  />
                </label>
                {content.imageUrl && (
                  <>
                    <img
                      src={content.imageUrl}
                      alt={content.imageAlt || "Question image"}
                    />
                    <label className="form-field">
                      Image description
                      <input
                        required
                        value={content.imageAlt || ""}
                        onChange={(e) => update({ imageAlt: e.target.value })}
                      />
                    </label>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() =>
                        update({ imageUrl: undefined, imageAlt: undefined })
                      }
                    >
                      Remove from question
                    </button>
                  </>
                )}
              </div>
            </>
          )}
          <label className="form-field">
            Skill tags
            <input
              value={skills}
              onChange={(e) => setSkills(e.target.value)}
              placeholder="fractions, linear-equations"
            />
            <small>Separate tags with commas.</small>
          </label>
          {mode === "problem" && (
            <>
              <label className="form-field">
                Difficulty
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(+e.target.value)}
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n} ·{" "}
                      {
                        [
                          "Foundational",
                          "Easy",
                          "Intermediate",
                          "Challenging",
                          "Advanced",
                        ][n - 1]
                      }
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-field">
                Hint
                <textarea
                  value={hint}
                  onChange={(e) => setHint(e.target.value)}
                  rows={2}
                />
              </label>
              <label className="form-field">
                Worked solution
                <textarea
                  value={solution}
                  onChange={(e) => setSolution(e.target.value)}
                  rows={4}
                />
              </label>
            </>
          )}
          {item && mode === "card" && (
            <label className="check-label danger-text">
              <input
                type="checkbox"
                checked={reset}
                onChange={(e) => setReset(e.target.checked)}
              />
              <span>
                Reset scheduling for a changed knowledge target
                <small>
                  I understand that this resets an introduced card to a new
                  learning state due now. Suspension and historical reviews
                  remain preserved.
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
          <button className="button primary" disabled={busy || uploading}>
            {busy ? "Saving…" : item ? "Save changes" : "Create"}
            <Check size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
