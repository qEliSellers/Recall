import React, { useState, useEffect } from "react";
import {
  Check,
  Download,
  Upload,
  ShieldCheck,
  Link2,
  ExternalLink,
  Database,
  Info,
  Settings2,
} from "lucide-react";
import { api } from "./api";
import { Modal, ErrorNotice, Loading } from "./ui";
export default function SettingsPage({ refresh }: { refresh: () => void }) {
  const [settings, setSettings] = useState<any>(null),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false),
    [busy, setBusy] = useState(false),
    [backup, setBackup] = useState<any>(null),
    [backupName, setBackupName] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [restoring, setRestoring] = useState(false),
    [exporting, setExporting] = useState(false),
    [backupMessage, setBackupMessage] = useState("");
  useEffect(() => {
    api("settings.get")
      .then(setSettings)
      .catch((e) => setError(e.message));
  }, []);
  const update = (data: any) => {
    setSettings({ ...settings, ...data });
    setSaved(false);
  };
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("settings.update", settings);
      document.documentElement.dataset.theme =
        settings.theme === "light" ? "light" : "dark";
      setSaved(true);
      refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function exportBackup() {
    setExporting(true);
    setError("");
    try {
      const r = await fetch("/api/backup");
      if (!r.ok) {
        const failure: any = await r.json();
        throw new Error(failure.error || "Export failed");
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `recall-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setBackupMessage(
        "Backup exported, including study history and uploaded media.",
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setExporting(false);
    }
  }
  async function restore() {
    setRestoring(true);
    setError("");
    try {
      const r = await fetch("/api/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ backup, confirm: true }),
      });
      const data: any = await r.json();
      if (!r.ok) throw new Error(data.error || "Restore failed");
      setBackup(null);
      setConfirmed(false);
      setBackupMessage("Backup restored successfully.");
      refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRestoring(false);
    }
  }
  if (!settings)
    return (
      <>
        <ErrorNotice message={error} />
        <Loading />
      </>
    );
  return (
    <div className="settings-layout">
      <div>
        <form onSubmit={save}>
          <section className="panel settings-panel">
            <div className="panel-heading">
              <div>
                <h2>Learning preferences</h2>
                <p>Standard FSRS, tuned to your pace.</p>
              </div>
              <Settings2 size={19} className="muted" />
            </div>
            <div className="settings-body">
              <div className="field-row">
                <label className="form-field">
                  Default desired retention (%)
                  <input
                    type="number"
                    required
                    min={70}
                    max={99}
                    value={Math.round((settings.retention || 0.9) * 100)}
                    onChange={(e) =>
                      update({ retention: Number(e.target.value) / 100 })
                    }
                  />
                  <small>
                    90% is a balanced starting point. Higher targets mean more
                    reviews.
                  </small>
                </label>
                <label className="form-field">
                  Maximum interval (days)
                  <input
                    type="number"
                    required
                    min={1}
                    max={36500}
                    value={settings.maxInterval || 36500}
                    onChange={(e) =>
                      update({ maxInterval: Number(e.target.value) })
                    }
                  />
                </label>
              </div>
              <div className="field-row">
                <label className="form-field">
                  Learning steps
                  <input
                    value={(settings.learningSteps || ["1m", "10m"]).join(", ")}
                    onChange={(e) =>
                      update({
                        learningSteps: e.target.value
                          .split(",")
                          .map((s) => s.trim()),
                      })
                    }
                  />
                  <small>Comma-separated intervals, e.g. 1m, 10m.</small>
                </label>
                <label className="form-field">
                  Relearning steps
                  <input
                    value={(settings.relearningSteps || ["10m"]).join(", ")}
                    onChange={(e) =>
                      update({
                        relearningSteps: e.target.value
                          .split(",")
                          .map((s) => s.trim()),
                      })
                    }
                  />
                  <small>Used after a lapse on a learned card.</small>
                </label>
              </div>
              <p className="fine-print">
                Learning steps apply to future reviews. Default retention and
                maximum interval apply when creating courses; existing courses
                keep their own settings. Existing due dates are not rewritten.
              </p>
            </div>
          </section>
          <section className="panel settings-panel">
            <div className="panel-heading">
              <div>
                <h2>Your workspace</h2>
                <p>Small details that make it yours.</p>
              </div>
            </div>
            <div className="settings-body">
              <div className="field-row">
                <label className="form-field">
                  Study time zone
                  <input
                    value={settings.timezone || "UTC"}
                    onChange={(e) => update({ timezone: e.target.value })}
                    placeholder="America/Mexico_City"
                    list="timezones"
                  />
                  <datalist id="timezones">
                    {[
                      "UTC",
                      "America/Mexico_City",
                      "America/New_York",
                      "America/Chicago",
                      "America/Denver",
                      "America/Los_Angeles",
                      "Europe/London",
                      "Europe/Paris",
                      "Asia/Tokyo",
                      "Australia/Sydney",
                    ].map((z) => (
                      <option key={z} value={z} />
                    ))}
                  </datalist>
                  <small>Used to group activity by study day.</small>
                </label>
                <label className="form-field">
                  Daily review goal
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    value={settings.dailyGoal || 30}
                    onChange={(e) =>
                      update({ dailyGoal: Number(e.target.value) })
                    }
                  />
                </label>
              </div>
              <label className="form-field">
                Appearance
                <select
                  value={settings.theme || "dark"}
                  onChange={(e) => update({ theme: e.target.value })}
                >
                  <option value="dark">Dark · focused and calm</option>
                  <option value="light">Light · warm paper</option>
                </select>
              </label>
            </div>
          </section>
          <ErrorNotice message={error} />
          <div className="settings-save">
            <span className={saved ? "success-text" : "muted"}>
              {saved ? (
                <>
                  <Check size={16} />
                  Preferences saved
                </>
              ) : (
                "Your preferences sync across devices."
              )}
            </span>
            <button className="button primary" disabled={busy}>
              {busy ? "Saving…" : "Save preferences"}
              <Check size={16} />
            </button>
          </div>
        </form>
        <section className="panel settings-panel">
          <div className="panel-heading">
            <div>
              <h2>Your data, in your hands</h2>
              <p>Back up your library and the work you’ve put into it.</p>
            </div>
            <Database size={20} className="muted" />
          </div>
          <div className="settings-body">
            <p className="dialog-copy">
              A full backup includes course structure, cards, problems, FSRS
              schedules, study histories, settings, and uploaded images. Keep a
              copy somewhere safe.
            </p>
            <div className="button-row">
              <button
                className="button secondary"
                onClick={exportBackup}
                disabled={exporting}
              >
                <Download size={16} />
                {exporting ? "Preparing backup…" : "Export full backup"}
              </button>
              <label className="button secondary">
                <Upload size={16} />
                Restore a backup
                <input
                  type="file"
                  accept="application/json,.json"
                  hidden
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      try {
                        setBackup(JSON.parse(await f.text()));
                        setBackupName(f.name);
                        setConfirmed(false);
                      } catch {
                        setError("This file is not valid JSON.");
                      }
                    }
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            {backupMessage && (
              <div className="success-notice">
                <Check size={16} />
                {backupMessage}
              </div>
            )}
          </div>
        </section>
      </div>
      <aside className="settings-aside">
        <section className="panel integration-card">
          <span className="integration-icon">
            <Link2 size={23} />
          </span>
          <span className="eyebrow">CHATGPT INTEGRATION</span>
          <h2>
            Your study library,
            <br />
            within reach.
          </h2>
          <p>
            This private Site exposes scoped MCP tools for courses, content
            imports, reviews, and learning statistics. The website and tools use
            the same data.
          </p>
          <div className="integration-steps">
            <span>
              <i>1</i>Open ChatGPT or Codex Plugins.
            </span>
            <span>
              <i>2</i>Find Recall under “Created by you”.
            </span>
            <span>
              <i>3</i>Install or connect the private plugin.
            </span>
          </div>
          <div className="info-notice">
            <Info size={16} />
            <span>
              Connection is verified only after a successful tool call.
              Publishing the Site alone does not confirm installation.
            </span>
          </div>
        </section>
        <section className="privacy-card">
          <ShieldCheck size={21} />
          <h3>Private by design</h3>
          <a
            className="text-button"
            href="/signout-with-chatgpt?return_to=/"
            target="_top"
          >
            Sign out of Recall ↗
          </a>
          <p>
            Your account owns your records. Imported content is validated, and
            study actions use the same protected service from the web or
            ChatGPT.
          </p>
        </section>
      </aside>
      {backup && (
        <Modal
          title="Restore this backup?"
          subtitle={backupName}
          onClose={() => !restoring && setBackup(null)}
        >
          <p className="dialog-copy">
            Restoring replaces your current workspace data with the records in
            this backup. Export your current data first if you may need it
            later.
          </p>
          <label className="check-label">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            <span>I understand that this replaces my current study data.</span>
          </label>
          <ErrorNotice message={error} />
          <div className="modal-actions">
            <button
              className="button secondary"
              disabled={restoring}
              onClick={() => setBackup(null)}
            >
              Cancel
            </button>
            <button
              className="button danger"
              disabled={!confirmed || restoring}
              onClick={restore}
            >
              {restoring ? "Restoring…" : "Restore backup"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
