import React, { useState, useEffect, useCallback } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  ChartNoAxesCombined,
  LayoutDashboard,
  Settings2,
  Archive,
  Plus,
  Search,
  Menu,
  X,
  Check,
  Clock3,
  Layers3,
  Sparkles,
  Command,
  GraduationCap,
  Target,
  CalendarDays,
  Ellipsis,
  Play,
  Flame,
  Library,
  Download,
  Upload,
  ShieldCheck,
  Link2,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  CartesianGrid,
} from "recharts";
import { api, percent, number, day, type Course, type Unit } from "./api";
import { Modal, Empty, Loading, ErrorNotice, Stat } from "./ui";
import CourseDetail from "./CourseDetail";
import { StudySession } from "./StudySession";
import { CreateCourse, SessionSetup } from "./dialogs";
import SettingsPage from "./SettingsPage";
import Statistics from "./Statistics";

type Page = "dashboard" | "courses" | "archived" | "statistics" | "settings";
const navItems = [
  { id: "dashboard", label: "Overview", icon: LayoutDashboard },
  { id: "courses", label: "Courses", icon: BookOpen },
  { id: "statistics", label: "Statistics", icon: ChartNoAxesCombined },
  { id: "archived", label: "Archived", icon: Archive },
] as const;
function readRoute() {
  const parts = location.hash.replace(/^#\/?/, "").split("/");
  return {
    page: ([
      "dashboard",
      "courses",
      "archived",
      "statistics",
      "settings",
    ].includes(parts[0])
      ? parts[0]
      : "dashboard") as Page,
    courseId: parts[0] === "course" ? parts[1] : undefined,
    sessionId: parts[0] === "session" ? parts[1] : undefined,
  };
}
export default function App() {
  const [route, setRoute] = useState(readRoute),
    [sidebar, setSidebar] = useState(false),
    [data, setData] = useState<any>(null),
    [user, setUser] = useState<any>({}),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [create, setCreate] = useState(false),
    [sessionSetup, setSessionSetup] = useState<Course | null>(null),
    [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((v) => v + 1), []);
  useEffect(() => {
    const onHash = () => {
      setRoute(readRoute());
      setSidebar(false);
      window.scrollTo(0, 0);
    };
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    let live = true;
    api("dashboard")
      .then((d) => {
        if (live) {
          setData(d);
          setError("");
        }
      })
      .catch((e) => live && setError(e.message))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [revision]);
  useEffect(() => {
    api("settings.get")
      .then((s) => {
        document.documentElement.dataset.theme =
          s.theme === "light" ? "light" : "dark";
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    fetch("/api/me")
      .then(async (r) => {
        if (r.status === 401) {
          setUser({ needsSignIn: true });
          return;
        }
        const body: any = await r.json();
        setUser(body.data || {});
      })
      .catch(() => {});
  }, []);
  const go = (path: string) => {
    location.hash = path;
  };
  const courses: Course[] = data?.courses || [];
  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const name = user.name?.split(" ")[0];
  const pageTitle = route.courseId
    ? "Course workspace"
    : route.page === "dashboard"
      ? "Your learning, in focus"
      : route.page === "courses"
        ? "Your courses"
        : route.page === "archived"
          ? "Archived courses"
          : route.page === "statistics"
            ? "Learning insights"
            : "Settings";
  if (user.needsSignIn)
    return (
      <main className="study-session">
        <section className="panel study-empty" style={{ marginTop: "12vh" }}>
          <ShieldCheck size={32} />
          <span className="eyebrow">RECALL · PRIVATE ACADEMIC WORKSPACE</span>
          <h1>A space for lasting knowledge.</h1>
          <p className="muted">
            Sign in to access your courses, reviews, and study history.
          </p>
          <a
            className="button primary"
            href="/signin-with-chatgpt?return_to=/"
            target="_top"
          >
            Sign in with ChatGPT <ArrowRight size={16} />
          </a>
        </section>
      </main>
    );
  if (route.sessionId)
    return (
      <div className="app">
        <StudySession
          sessionId={route.sessionId}
          onClose={() => {
            refresh();
            go("/dashboard");
          }}
          onChanged={refresh}
        />
      </div>
    );
  return (
    <div className="app-shell">
      {sidebar && (
        <div className="sidebar-scrim" onClick={() => setSidebar(false)} />
      )}
      <aside className={`sidebar ${sidebar ? "open" : ""}`}>
        <a className="brand" href="#/dashboard">
          <span className="brand-mark">
            <Layers3 size={23} strokeWidth={1.8} />
          </span>
          <span>
            recall<span className="brand-period">.</span>
          </span>
        </a>
        <div className="workspace-label">
          <div className="workspace-avatar">A</div>
          <div>
            <strong>Academic workspace</strong>
            <span>Personal · Private</span>
          </div>
          <ShieldCheck size={15} />
        </div>
        <div className="nav-caption">WORKSPACE</div>
        <nav>
          {navItems.map(({ id, label, icon: Icon }) => (
            <a
              key={id}
              href={`#/${id}`}
              className={`nav-item ${!route.courseId && route.page === id ? "active" : ""}`}
            >
              <Icon size={18} />
              <span>{label}</span>
              {id === "courses" && courses.length > 0 && (
                <span className="nav-count">{courses.length}</span>
              )}
            </a>
          ))}
        </nav>
        <div className="nav-caption course-caption">
          YOUR COURSES
          <button
            className="icon-button"
            aria-label="Add course"
            onClick={() => setCreate(true)}
          >
            <Plus size={15} />
          </button>
        </div>
        <nav className="course-nav">
          {courses.slice(0, 7).map((c, i) => (
            <a
              key={c.id}
              href={`#/course/${c.id}`}
              className={`nav-item ${route.courseId === c.id ? "active" : ""}`}
            >
              <span className={`course-dot color-${i % 4}`} />
              <span>{c.name}</span>
            </a>
          ))}
          {!courses.length && (
            <p className="sidebar-empty">
              Your next chapter starts
              <br />
              with a course.
            </p>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="private-note">
            <ShieldCheck size={15} />
            <span>Your progress stays yours.</span>
          </div>
          <a
            href="#/settings"
            className={`nav-item ${route.page === "settings" && !route.courseId ? "active" : ""}`}
          >
            <Settings2 size={18} />
            Settings
          </a>
          <div className="profile">
            <div className="profile-avatar">
              {(name || user.email || "Y").slice(0, 1).toUpperCase()}
            </div>
            <div>
              <strong>{user.name || "Your workspace"}</strong>
              <span>Personal account</span>
            </div>
            <span className="online-dot" />
          </div>
        </div>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              onClick={() => setSidebar(true)}
              aria-label="Open navigation"
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>
              {route.courseId
                ? "Course"
                : navItems.find((x) => x.id === route.page)?.label ||
                  "Settings"}
            </strong>
          </div>
          <div className="topbar-right">
            <span className="private-badge">
              <span />
              Private workspace
            </span>
            <span className="keyboard-hint">
              <Command size={12} />
              Make it stick.
            </span>
          </div>
        </header>
        <div className="page-content">
          {route.courseId ? (
            <CourseDetail
              id={route.courseId}
              revision={revision}
              refresh={refresh}
              onSession={(id) => go(`/session/${id}`)}
            />
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    {route.page === "dashboard"
                      ? today
                      : "YOUR ACADEMIC WORKSPACE"}
                  </div>
                  <h1>{pageTitle}</h1>
                  <p>
                    {route.page === "dashboard"
                      ? `${name ? `Welcome back, ${name}. ` : ""}A little focus today. Knowledge that lasts.`
                      : route.page === "courses"
                        ? "Organize your material. Build understanding, one unit at a time."
                        : route.page === "archived"
                          ? "Keep what you learned, at a pace that works for you."
                          : route.page === "statistics"
                            ? "A clear view of what’s sticking and what needs another look."
                            : "Make Recall work for the way you learn."}
                  </p>
                </div>
                {["dashboard", "courses"].includes(route.page) && (
                  <button
                    className="button secondary"
                    onClick={() => setCreate(true)}
                  >
                    <Plus size={16} />
                    Add course
                  </button>
                )}
              </div>
              <ErrorNotice message={error} />
              {loading ? (
                <Loading />
              ) : route.page === "dashboard" ? (
                <Dashboard
                  data={data}
                  onCreate={() => setCreate(true)}
                  onStudy={setSessionSetup}
                  onCourse={(id) => go(`/course/${id}`)}
                />
              ) : route.page === "courses" || route.page === "archived" ? (
                <CoursesPage
                  archived={route.page === "archived"}
                  activeCourses={courses}
                  revision={revision}
                  onCreate={() => setCreate(true)}
                  onCourse={(id) => go(`/course/${id}`)}
                  refresh={refresh}
                />
              ) : route.page === "statistics" ? (
                <Statistics courses={courses} />
              ) : (
                <SettingsPage refresh={refresh} />
              )}
            </>
          )}
        </div>
        <footer className="page-footer">
          <span>Recall · A space for lasting knowledge</span>
          <span>
            Built for the long run <span className="footer-dot" />
          </span>
        </footer>
      </main>
      {create && (
        <CreateCourse
          onClose={() => setCreate(false)}
          onCreated={(id) => {
            setCreate(false);
            refresh();
            go(`/course/${id}`);
          }}
        />
      )}
      {sessionSetup && (
        <SessionSetup
          course={sessionSetup}
          onClose={() => setSessionSetup(null)}
          onStarted={(id) => {
            setSessionSetup(null);
            go(`/session/${id}`);
          }}
        />
      )}
    </div>
  );
}
function Dashboard({
  data,
  onCreate,
  onStudy,
  onCourse,
}: {
  data: any;
  onCreate: () => void;
  onStudy: (c: Course) => void;
  onCourse: (id: string) => void;
}) {
  const courses: Course[] = data?.courses || [],
    s = data?.stats || {};
  const due =
    s.dueCards ?? s.due ?? courses.reduce((n, c) => n + (c.dueCards || 0), 0);
  const active = s.introducedCards ?? s.activeCards ?? 0;
  const newCards = s.unintroducedCards ?? 0;
  const recent = data?.recentSessions || [];
  const trend = data?.trend || s.workload || s.trends || data?.workload || [];
  const nextCourse = courses.find((c) => (c.dueCards || 0) > 0) || courses[0];
  return (
    <>
      <div className="dashboard-grid">
        <section className="focus-card">
          <div className="focus-top">
            <span className="eyebrow">
              <span className="live-dot" /> YOUR DAILY PRACTICE
            </span>
            <span className="small-badge">SPACED REPETITION</span>
          </div>
          <div className="focus-content">
            <div>
              <h2>
                {due > 0
                  ? "A good day to remember."
                  : courses.length
                    ? "Keep your momentum."
                    : "Make room for what matters."}
              </h2>
              <p>
                {due > 0
                  ? `${number(due)} cards are ready for a fresh look. Small sessions build lasting understanding.`
                  : courses.length
                    ? "Introduce new material, practice a skill, or revisit what you’ve learned."
                    : "Bring your courses together, introduce cards at your own pace, and let science guide your reviews."}
              </p>
              <button
                className="button primary"
                onClick={() => (nextCourse ? onStudy(nextCourse) : onCreate())}
              >
                {nextCourse ? (
                  <Play size={16} fill="currentColor" />
                ) : (
                  <Plus size={17} />
                )}{" "}
                {nextCourse ? "Start a study session" : "Add your first course"}
                <ArrowRight size={17} />
              </button>
            </div>
            <div className="focus-art" aria-hidden="true">
              <div className="orbit orbit-one" />
              <div className="orbit orbit-two" />
              <div className="orbit orbit-three" />
              <div className="art-card back">
                <span />
                <span />
                <span />
              </div>
              <div className="art-card front">
                <Layers3 size={30} />
                <div className="art-line" />
                <div className="art-line short" />
                <div className="art-check">
                  <Check size={13} />
                </div>
              </div>
              <span className="art-star">✧</span>
            </div>
          </div>
          <div className="focus-bottom">
            <ShieldCheck size={14} />
            <span>Standard FSRS scheduling</span>
            <span className="divider-dot" />
            <span>
              {s.dailyGoal
                ? `${number(s.todayReviews)} / ${number(s.dailyGoal)} reviewed today`
                : "Progress at your own pace"}
            </span>
          </div>
        </section>
        <section className="intent-card">
          <span className="eyebrow">THE LONG VIEW</span>
          <div className="quote-mark">“</div>
          <blockquote>
            Learning is a process.
            <br />
            Make it a practice.
          </blockquote>
          <div className="intent-rule" />
          <p>
            One focused session at a time.
            <br />
            Your future self will thank you.
          </p>
          <span className="small-label">CONSISTENCY OVER INTENSITY</span>
        </section>
      </div>
      <div className="stats-grid">
        <Stat
          label="Ready to review"
          value={number(due)}
          detail="Due across active courses"
          icon={<Clock3 size={17} />}
          accent
        />
        <Stat
          label="Introduced cards"
          value={number(active)}
          detail={`${number(newCards)} waiting in your library`}
          icon={<Layers3 size={17} />}
        />
        <Stat
          label="Review success"
          value={percent(s.reviewAccuracy ?? s.reviewSuccessRate)}
          detail="Scheduled reviews only"
          icon={<Target size={17} />}
        />
        <Stat
          label="Practice accuracy"
          value={percent(s.practiceAccuracy)}
          detail="Quizzes & problem practice"
          icon={<ChartNoAxesCombined size={17} />}
        />
      </div>
      <div className="section-title">
        <div>
          <h2>
            Your courses <span className="count-pill">{courses.length}</span>
          </h2>
          <p>Each subject, its own steady progress.</p>
        </div>
        <a className="text-button" href="#/courses">
          View all courses <ArrowUpRight size={15} />
        </a>
      </div>
      {!courses.length ? (
        <section className="panel onboarding">
          <div className="onboarding-icon">
            <BookOpen size={31} />
          </div>
          <div>
            <span className="eyebrow">YOUR FIRST CHAPTER</span>
            <h3>Everything begins with a course.</h3>
            <p>
              Choose from the Acellus catalog or create your own. Your library
              stays separate from your review queue until you’re ready.
            </p>
          </div>
          <button className="button secondary" onClick={onCreate}>
            <Plus size={16} />
            Create a course
          </button>
        </section>
      ) : (
        <div className="courses-grid">
          {courses.slice(0, 6).map((c, i) => (
            <CourseCard
              course={c}
              index={i}
              key={c.id}
              onClick={() => onCourse(c.id)}
            />
          ))}
        </div>
      )}
      <div className="lower-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Study rhythm</h2>
              <p>Your recorded activity over time</p>
            </div>
            <span className="subtle-badge">LAST 30 DAYS</span>
          </div>
          {trend.length ? (
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={trend}>
                  <defs>
                    <linearGradient
                      id="activityFill"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="0%" stopColor="#a8bda0" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#a8bda0" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="#ffffff0a" />
                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#7c817c", fontSize: 11 }}
                    tickFormatter={day}
                  />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{
                      background: "#20241f",
                      border: "1px solid #394034",
                      borderRadius: 8,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="reviews"
                    name="Reviews"
                    stroke="#a8bda0"
                    fill="url(#activityFill)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="chart-empty">
              <div className="chart-grid">
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
              <div>
                <ChartNoAxesCombined size={23} />
                <p>Your rhythm starts with your first session.</p>
              </div>
            </div>
          )}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Recent sessions</h2>
              <p>Your latest moments of focus</p>
            </div>
            <Clock3 size={17} className="muted" />
          </div>
          {recent.length ? (
            <div className="activity-list">
              {recent.slice(0, 5).map((r: any) => (
                <a
                  key={r.id}
                  href={`#/session/${r.id}`}
                  className="activity-row"
                >
                  <div
                    className={`activity-icon ${r.mode === "review" ? "sage" : "amber"}`}
                  >
                    {r.mode === "review" ? (
                      <Layers3 size={17} />
                    ) : (
                      <Target size={17} />
                    )}
                  </div>
                  <div>
                    <strong>
                      {r.courseName ||
                        courses.find((c) => c.id === r.courseId)?.name ||
                        "Study session"}
                    </strong>
                    <span>
                      {r.mode === "review"
                        ? "Scheduled review"
                        : r.mode === "problem"
                          ? "Problem practice"
                          : "Practice quiz"}{" "}
                      · {r.total || r.questionCount || 0} questions
                    </span>
                  </div>
                  <div className="activity-meta">
                    <strong>
                      {r.accuracy == null
                        ? r.status === "completed"
                          ? "Complete"
                          : "In progress"
                        : percent(r.accuracy)}
                    </strong>
                    <span>{day(r.createdAt || r.startedAt || Date.now())}</span>
                  </div>
                </a>
              ))}
            </div>
          ) : (
            <div className="activity-empty">
              <Clock3 size={24} />
              <h3>A fresh page.</h3>
              <p>
                Completed sessions will appear here.
                <br />
                Every bit of practice counts.
              </p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
export function CourseCard({
  course: c,
  index = 0,
  onClick,
}: {
  course: Course;
  index?: number;
  onClick: () => void;
}) {
  const total = c.totalCards || 0;
  const introduced =
    c.introducedCards ?? (c.activeCards || 0) + (c.suspendedCards || 0);
  return (
    <button className={`course-card color-${index % 4}`} onClick={onClick}>
      <div className="course-card-top">
        <span className="course-subject">{c.subject || "CUSTOM COURSE"}</span>
        <span className="course-glyph">
          {c.isMath ? <span>ƒ</span> : <BookOpen size={19} />}
        </span>
      </div>
      <h3>{c.name}</h3>
      <div className="course-subline">
        {c.unitCount ?? c.unitsCount ?? 0} units <span>·</span> {number(total)}{" "}
        cards {c.isMath && <span>· Concept + practice</span>}
      </div>
      <div className="course-progress">
        <span
          style={{
            width: `${total ? Math.min(100, (introduced / total) * 100) : 0}%`,
          }}
        />
      </div>
      <div className="course-card-bottom">
        <span>
          {number(introduced)} <span className="muted">introduced</span>
        </span>
        <span className={`due-badge ${c.dueCards ? "has-due" : ""}`}>
          {c.dueCards ? `${c.dueCards} due` : "Open course"}
          <ArrowUpRight size={13} />
        </span>
      </div>
    </button>
  );
}
function CoursesPage({
  archived,
  activeCourses,
  revision,
  onCreate,
  onCourse,
  refresh,
}: {
  archived: boolean;
  activeCourses: Course[];
  revision: number;
  onCreate: () => void;
  onCourse: (id: string) => void;
  refresh: () => void;
}) {
  const [courses, setCourses] = useState<Course[]>([]),
    [query, setQuery] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!archived) {
      setCourses(activeCourses);
      return;
    }
    setLoading(true);
    api<Course[]>("courses.list", { archived: true })
      .then(setCourses)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [archived, activeCourses, revision]);
  const visible = courses.filter((c) =>
    `${c.name} ${c.subject}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <div className="list-toolbar">
        <div className="search-field">
          <Search size={17} />
          <input
            aria-label="Search courses"
            placeholder="Search your courses…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <span className="muted">
          {courses.length} {archived ? "archived" : "active"} courses
        </span>
      </div>
      <ErrorNotice message={error} />
      {loading ? (
        <Loading />
      ) : visible.length ? (
        <div className="courses-grid">
          {visible.map((c, i) => (
            <CourseCard
              key={c.id}
              course={c}
              index={i}
              onClick={() => onCourse(c.id)}
            />
          ))}
        </div>
      ) : (
        <section className="panel">
          <Empty
            title={
              query
                ? "No matching courses"
                : archived
                  ? "Knowledge worth keeping"
                  : "Start your course library"
            }
            body={
              query
                ? "Try another course name or subject."
                : archived
                  ? "Completed courses will live here, with every card and study record preserved."
                  : "Add a course from the official Acellus catalog or create a custom course."
            }
            icon={archived ? <Archive size={27} /> : undefined}
            action={
              !archived && !query ? (
                <button className="button primary" onClick={onCreate}>
                  <Plus size={16} />
                  Add a course
                </button>
              ) : undefined
            }
          />
        </section>
      )}
    </>
  );
}
