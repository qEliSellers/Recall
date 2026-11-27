import React, { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import type { ImportKind, ImportResult } from "../lib/import-format";
import { MAX_IMPORT_BYTES } from "../lib/import-limits";
import importGuide from "../docs/import-format.md?raw";
import { api, type Course, type Unit } from "./api";
import { importExample } from "./import-example";
import { buildImportInput, CSV_HEADER } from "./import-file";
import { ErrorNotice, Modal } from "./ui";

function download(name: string, file: Blob) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function ImportDialog({
  course,
  units,
  kind,
  initialUnitId,
  onClose,
  onSaved,
}: {
  course: Course;
  units: Unit[];
  kind: ImportKind;
  initialUnitId: string;
  onClose: () => void;
  onSaved: (result: ImportResult) => void;
}) {
  const [defaultUnitId, setDefaultUnitId] = useState(initialUnitId);
  const [format, setFormat] = useState<"json" | "csv">("json");
  const [source, setSource] = useState("");
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"read" | "check" | "import" | null>(null);
  const [checked, setChecked] = useState<{
    input: ReturnType<typeof buildImportInput>;
    result: ImportResult;
  } | null>(null);
  const inFlight = useRef(false);

  function invalidate() {
    setChecked(null);
    setError("");
  }
  async function chooseFile(file: File) {
    invalidate();
    inFlight.current = true;
    setBusy("read");
    try {
      if (file.size > MAX_IMPORT_BYTES)
        throw new Error("Choose a file under 8 MiB or split this batch.");
      const value = new TextDecoder("utf-8", { fatal: true }).decode(
        await file.arrayBuffer(),
      );
      setSource(value);
      setFileName(file.name);
      if (/\.csv$/i.test(file.name)) setFormat("csv");
      if (/\.json$/i.test(file.name)) setFormat("json");
    } catch (cause) {
      setSource("");
      setFileName("");
      setError(
        cause instanceof TypeError
          ? "Save this file as UTF-8 before importing."
          : (cause as Error).message,
      );
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    setError("");
    if (checked?.result.replayed || checked?.result.imported === 0) {
      onClose();
      return;
    }
    inFlight.current = true;
    setBusy(checked ? "import" : "check");
    try {
      if (checked) {
        onSaved(
          await api("library.import", {
            ...checked.input,
            previewKey: checked.result.previewKey,
          }),
        );
      } else {
        const input = buildImportInput(source, {
          format,
          kind,
          courseId: course.id,
          defaultUnitId,
        });
        const result = await api<ImportResult>("library.previewImport", input);
        setChecked({ input, result });
      }
    } catch (cause) {
      setChecked(null);
      setError((cause as Error).message);
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }

  function downloadExample() {
    const unitId = defaultUnitId || units[0].id;
    const example = importExample({
      courseId: course.id,
      unitId,
      otherUnitId: units.find((unit) => unit.id !== unitId)?.id,
      batchId: `example-${crypto.randomUUID()}`,
      isMath: course.isMath,
    });
    const file = new Blob([JSON.stringify(example, null, 2) + "\n"], {
      type: "application/json",
    });
    download("recall-import-example.json", file);
  }

  const result = checked?.result;
  return (
    <Modal
      title="Import study content"
      subtitle={course.name}
      onClose={() => {
        if (!inFlight.current) onClose();
      }}
      wide
    >
      <form onSubmit={submit}>
        <fieldset className="import-fields" disabled={busy !== null}>
          <div className="field-row">
            <label className="form-field">
              Default unit
              <select
                value={defaultUnitId}
                onChange={(e) => {
                  setDefaultUnitId(e.target.value);
                  invalidate();
                }}
              >
                <option value="">Use destinations in the file</option>
                {units.map((unit, index) => (
                  <option key={unit.id} value={unit.id}>
                    {index + 1}. {unit.name}
                  </option>
                ))}
              </select>
              <small>Applies to entries without a unit in the file.</small>
            </label>
            <label className="form-field">
              Format
              <select
                value={format}
                onChange={(e) => {
                  setFormat(e.target.value as "json" | "csv");
                  invalidate();
                }}
              >
                <option value="json">JSON · all question types</option>
                <option value="csv">CSV · multiple choice {kind}</option>
              </select>
            </label>
          </div>
          <label className="file-drop">
            <Upload size={22} />
            <strong>
              {busy === "read"
                ? "Reading file…"
                : fileName || "Choose a JSON or CSV file"}
            </strong>
            <span>Or paste the data below.</span>
            <input
              type="file"
              accept=".json,.csv,application/json,text/csv"
              aria-label="Import file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void chooseFile(file);
              }}
            />
          </label>
          <label className="form-field">
            Import data
            <textarea
              className="code-editor"
              rows={8}
              value={source}
              placeholder={
                format === "json" ? "Paste a JSON import file" : CSV_HEADER
              }
              onChange={(e) => {
                setSource(e.target.value);
                setFileName("");
                invalidate();
              }}
            />
          </label>
          <details className="import-help">
            <summary>File rules and example</summary>
            <p>
              Use up to 1,000 entries per batch. New items are appended in file
              order within each unit.
            </p>
            {format === "json" ? (
              <p>
                Use a version 1 file with a stable <code>batchId</code> and a{" "}
                <code>cards</code> or <code>problems</code> array. Math courses
                can include both. Set <code>unitId</code> or an exact{" "}
                <code>unitName</code> on each entry or once for the whole file.
              </p>
            ) : (
              <p>
                Required columns are <code>prompt</code>, <code>option_a</code>,{" "}
                <code>option_b</code>, and <code>answer</code>. Match the answer
                to the option text. Use <code>unit_id</code> or{" "}
                <code>unit_name</code> to specify a unit and semicolons to
                separate skills. Quote fields containing commas or line breaks.
              </p>
            )}
            <div className="button-row">
              <button
                type="button"
                className="text-button"
                onClick={downloadExample}
              >
                <Download size={16} /> Download synthetic JSON example
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  download(
                    "recall-import-format.md",
                    new Blob([importGuide], { type: "text/markdown" }),
                  )
                }
              >
                <Download size={16} /> Download full format guide
              </button>
            </div>
          </details>
          <details className="import-help">
            <summary>Unit names and IDs for this course</summary>
            <pre>
              {JSON.stringify(
                units.map(({ id, name }) => ({ unitName: name, unitId: id })),
                null,
                2,
              )}
            </pre>
          </details>
        </fieldset>
        <div className="import-errors">
          <ErrorNotice message={error} />
        </div>
        {result && (
          <section
            className="import-preview"
            aria-label="Import preview"
            role="status"
          >
            <strong>
              {result.replayed
                ? "This batch was already imported."
                : `${result.imported} ready to add · ${result.skipped} already in the library`}
            </strong>
            {!result.replayed && (
              <div className="import-table">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Unit</th>
                      <th scope="col">New cards</th>
                      <th scope="col">New problems</th>
                      <th scope="col">Skipped</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.units?.map((unit) => (
                      <tr key={unit.unitId}>
                        <th scope="row">{unit.unitName}</th>
                        <td>{unit.cards.imported}</td>
                        <td>{unit.problems.imported}</td>
                        <td>{unit.cards.skipped + unit.problems.skipped}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {result.units?.some((unit) => unit.cards.imported) &&
              !result.replayed && (
                <p>
                  New cards stay unintroduced until you add them to reviews.
                </p>
              )}
          </section>
        )}
        <div className="modal-actions">
          <button
            type="button"
            className="button secondary"
            onClick={onClose}
            disabled={busy !== null}
          >
            Cancel
          </button>
          <button
            className="button primary"
            disabled={busy !== null || !source.trim()}
          >
            {busy === "check"
              ? "Checking…"
              : busy === "import"
                ? "Importing…"
                : result
                  ? result.replayed || !result.imported
                    ? "Done"
                    : `Import ${result.imported} items`
                  : "Check batch"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
