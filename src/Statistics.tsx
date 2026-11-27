import React, { useState, useEffect } from "react";
import {
  ChartNoAxesCombined,
  Clock3,
  Target,
  Layers3,
  ArrowDownRight,
  Info,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import { api, percent, number, day, type Course, type Unit } from "./api";
import { Loading, ErrorNotice, Empty, Stat } from "./ui";
export default function Statistics({
  courses,
  fixedCourseId,
  units: providedUnits,
}: {
  courses: Course[];
  fixedCourseId?: string;
  units?: Unit[];
}) {
  const [courseId, setCourseId] = useState(fixedCourseId || ""),
    [unitId, setUnitId] = useState(""),
    [units, setUnits] = useState(providedUnits || []),
    [days, setDays] = useState(30),
    [skill, setSkill] = useState(""),
    [type, setType] = useState(""),
    [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!courseId) {
      setUnits([]);
      return;
    }
    if (providedUnits) return;
    api("courses.get", { id: courseId })
      .then((r) => setUnits(r.units))
      .catch(() => {});
  }, [courseId]);
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      setLoading(true);
      api("analytics", {
        courseId: courseId || undefined,
        unitId: unitId || undefined,
        skill: skill || undefined,
        type: type || undefined,
        days,
      })
        .then((d) => {
          if (live) {
            setData(d);
            setError("");
          }
        })
        .catch((e) => live && setError(e.message))
        .finally(() => live && setLoading(false));
    }, 150);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [courseId, unitId, days, skill, type]);
  const s = data?.summary || {};
  return (
    <>
      <div className="analytics-filters">
        {!fixedCourseId && (
          <label className="form-field">
            Course
            <select
              value={courseId}
              onChange={(e) => {
                setCourseId(e.target.value);
                setUnitId("");
              }}
            >
              <option value="">All active courses</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="form-field">
          Unit
          <select
            value={unitId}
            disabled={!courseId}
            onChange={(e) => setUnitId(e.target.value)}
          >
            <option value="">All units</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field">
          Period
          <select value={days} onChange={(e) => setDays(+e.target.value)}>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={365}>Last year</option>
            <option value={3650}>All time</option>
          </select>
        </label>
        <label className="form-field">
          Question format
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All formats</option>
            {[
              "multiple_choice",
              "multiple_select",
              "cloze",
              "matching",
              "sequencing",
              "true_false",
              "typed",
            ].map((t) => (
              <option key={t} value={t}>
                {t.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field">
          Skill
          <input
            value={skill}
            onChange={(e) => setSkill(e.target.value)}
            placeholder="Any skill"
          />
        </label>
      </div>
      <ErrorNotice message={error} />
      {loading ? (
        <Loading />
      ) : (
        <>
          <div className="stats-grid">
            <Stat
              label="Review success"
              value={percent(s.reviewSuccessRate)}
              detail={`${number(s.reviewCount)} scheduled reviews`}
              icon={<Layers3 size={17} />}
              accent
            />
            <Stat
              label="Estimated retention"
              value={percent(s.estimatedRetention)}
              detail="FSRS model estimate · not a test score"
              icon={<Target size={17} />}
            />
            <Stat
              label="Practice accuracy"
              value={percent(s.practiceAccuracy)}
              detail={`${number(s.practiceCount)} practice answers`}
              icon={<ChartNoAxesCombined size={17} />}
            />
            <Stat
              label="Focused study time"
              value={
                s.studyTimeMs ? `${Math.round(s.studyTimeMs / 60000)}m` : "—"
              }
              detail="Recorded response time"
              icon={<Clock3 size={17} />}
            />
          </div>
          <div className="info-notice">
            <Info size={16} />
            <span>
              Memory estimates and practice accuracy measure different things.
              Multiple-choice recognition and additional practice can affect how
              closely FSRS estimates reflect unaided recall.
            </span>
          </div>
          <section className="panel analytics-chart">
            <div className="panel-heading">
              <div>
                <h2>Your study activity</h2>
                <p>Scheduled reviews and practice, shown separately</p>
              </div>
              <span className="subtle-badge">
                {days >= 3650 ? "ALL TIME" : `${days} DAYS`}
              </span>
            </div>
            {data?.trend?.some((d: any) => d.reviews || d.practice) ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.trend}>
                  <CartesianGrid vertical={false} stroke="#ffffff0a" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={day}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#898d86", fontSize: 11 }}
                  />
                  <YAxis
                    allowDecimals={false}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#898d86", fontSize: 11 }}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#242822",
                      border: "1px solid #3b4237",
                      borderRadius: 8,
                    }}
                  />
                  <Legend />
                  <Bar
                    dataKey="reviews"
                    name="Scheduled reviews"
                    fill="#afc3a6"
                    radius={[3, 3, 0, 0]}
                  />
                  <Bar
                    dataKey="practice"
                    name="Practice answers"
                    fill="#c9a97b"
                    radius={[3, 3, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Empty
                title="Your progress will take shape here"
                body="Complete a review or practice session to begin building your study history."
                icon={<ChartNoAxesCombined size={27} />}
              />
            )}
          </section>
          <section className="panel analytics-chart">
            <div className="panel-heading">
              <div>
                <h2>Scheduled workload</h2>
                <p>Current due dates · counts change as you review</p>
              </div>
              <Clock3 size={18} className="muted" />
            </div>
            {data?.workload?.length ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.workload.slice(0, 14)}>
                  <CartesianGrid vertical={false} stroke="#ffffff0a" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={day}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#898d86", fontSize: 11 }}
                  />
                  <YAxis
                    allowDecimals={false}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#898d86", fontSize: 11 }}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#242822",
                      border: "1px solid #3b4237",
                      borderRadius: 8,
                    }}
                  />
                  <Bar
                    dataKey="due"
                    name="Cards due"
                    fill="#afc3a6"
                    radius={[3, 3, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="panel-empty-copy">
                Introduce cards to start building your review schedule.
              </p>
            )}
          </section>
          <div className="lower-grid">
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Units to revisit</h2>
                  <p>Accuracy from recorded answers</p>
                </div>
                <ArrowDownRight size={18} className="muted" />
              </div>
              <Breakdown
                rows={data?.weakUnits || []}
                label="name"
                empty="Unit-level patterns appear as you study."
              />
            </section>
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Skills to strengthen</h2>
                  <p>Small improvements add up</p>
                </div>
                <Target size={18} className="muted" />
              </div>
              <Breakdown
                rows={data?.weakSkills || []}
                label="skill"
                empty="Tag your questions with skills to see your strengths and gaps."
              />
            </section>
          </div>
          <section className="panel misses-panel">
            <div className="panel-heading">
              <div>
                <h2>Frequently missed</h2>
                <p>A useful starting point for your next practice session</p>
              </div>
            </div>
            {data?.frequentMisses?.length ? (
              <div className="misses-list">
                {data.frequentMisses.slice(0, 15).map((q: any, i: number) => (
                  <div className="miss-row" key={q.cardId || i}>
                    <span className="unit-number">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <strong>{q.prompt}</strong>
                    <span className="badge amber">
                      {q.misses} missed / {q.total}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="panel-empty-copy">
                No repeated misses in this period. Keep practicing to build a
                clearer picture.
              </p>
            )}
          </section>
        </>
      )}
    </>
  );
}
function Breakdown({
  rows,
  label,
  empty,
}: {
  rows: any[];
  label: string;
  empty: string;
}) {
  return rows.length ? (
    <div className="breakdown-list">
      {rows.slice(0, 8).map((row, i) => (
        <div className="breakdown-row" key={row.unitId || row.skill || i}>
          <div>
            <strong>{row[label]}</strong>
            <span>{row.total} answers</span>
          </div>
          <div className="breakdown-meter">
            <div>
              <span
                style={{
                  width: `${(row.accuracy <= 1 ? row.accuracy * 100 : row.accuracy) || 0}%`,
                }}
              />
            </div>
            <strong>{percent(row.accuracy)}</strong>
          </div>
        </div>
      ))}
    </div>
  ) : (
    <p className="panel-empty-copy">{empty}</p>
  );
}
