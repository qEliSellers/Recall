import { z } from "zod";
import {
  type Database,
  type Statement,
  rows,
  one,
  run,
  stmt,
  json,
  uid,
  now,
  placeholders,
  fail,
  ServiceError,
} from "./db";
import {
  questionSchema,
  questionResponseSchema,
  type GradeResult,
  type PreparedQuestion,
} from "./types";
import { prepareQuestion, gradeQuestion, gradePhase } from "./questions";
import {
  cardsImportSchema,
  importError,
  libraryImportSchema,
  problemFields,
  problemsImportSchema,
  skillTags as skills,
} from "./import-format";
import { MAX_IMPORT_ITEMS } from "./import-limits";
import { importLibrary } from "./import-library";
import {
  newSchedule,
  reviewSchedule,
  retrievability,
  schedulerFor,
} from "./scheduling";

const id = z.string().min(1).max(100),
  name = z.string().trim().min(1).max(200),
  empty = z.object({}).strict();
const pagination = {
  limit: z.number().int().min(1).max(200).default(100),
  offset: z.number().int().min(0).max(100000).default(0),
};
const settingsSchema = z
  .object({
    retention: z.number().min(0.7).max(0.99).default(0.9),
    maxInterval: z.number().int().min(1).max(36500).default(36500),
    timezone: z
      .string()
      .max(100)
      .refine((v) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: v });
          return true;
        } catch {
          return false;
        }
      }, "Invalid timezone")
      .default("UTC"),
    theme: z.enum(["dark", "light", "system"]).default("dark"),
    dailyGoal: z.number().int().min(1).max(1000).default(30),
    learningSteps: z
      .array(z.string().regex(/^[1-9]\d{0,3}(m|h|d)$/))
      .max(10)
      .default(["1m", "10m"]),
    relearningSteps: z
      .array(z.string().regex(/^[1-9]\d{0,3}(m|h|d)$/))
      .max(10)
      .default(["10m"]),
  })
  .strict();
const courseUpdate = {
  name: name.optional(),
  subject: name.optional(),
  isMath: z.boolean().optional(),
  archived: z.boolean().optional(),
  archiveMode: z.enum(["normal", "relaxed", "paused"]).optional(),
  retention: z.number().min(0.7).max(0.99).optional(),
  relaxedRetention: z.number().min(0.7).max(0.99).optional(),
  maxInterval: z.number().int().min(1).max(36500).optional(),
  midtermUnitId: id.nullable().optional(),
};
const listInput = {
  courseId: id,
  unitId: id.optional(),
  skill: z.string().max(100).optional(),
  search: z.string().max(300).optional(),
  type: z.string().max(50).optional(),
  ...pagination,
};
export const actionSchemas = {
  dashboard: empty,
  "courses.list": z.object({ archived: z.boolean().default(false) }).strict(),
  "courses.get": z.object({ id }).strict(),
  "courses.create": z
    .object({
      name,
      subject: name.default("General"),
      isMath: z.boolean().default(false),
      units: z.array(name).max(100).default([]),
      sourceUrl: z.string().url().max(2000).optional(),
      sample: z.boolean().default(false),
    })
    .strict(),
  "courses.update": z.object({ id, ...courseUpdate }).strict(),
  "units.list": z.object({ courseId: id }).strict(),
  "units.create": z.object({ courseId: id, name }).strict(),
  "units.update": z.object({ id, name }).strict(),
  "units.reorder": z
    .object({ courseId: id, unitIds: z.array(id).min(1).max(1000) })
    .strict(),
  "cards.list": z
    .object({
      ...listInput,
      status: z.enum(["unintroduced", "active", "suspended"]).optional(),
    })
    .strict(),
  "cards.get": z.object({ id }).strict(),
  "cards.import": cardsImportSchema,
  "library.previewImport": libraryImportSchema,
  "library.import": libraryImportSchema,
  "cards.update": z
    .object({
      id,
      content: questionSchema.optional(),
      skills: skills.optional(),
      unitId: id.optional(),
      resetSchedule: z.boolean().default(false),
      confirmReset: z.boolean().default(false),
    })
    .strict(),
  "cards.introduce": z
    .object({
      unitId: id,
      count: z.number().int().positive().max(10000).optional(),
      cardIds: z.array(id).min(1).max(1000).optional(),
    })
    .strict()
    .refine(
      (v) => Boolean(v.count) !== Boolean(v.cardIds),
      "Choose a count or specific cards",
    ),
  "cards.status": z
    .object({
      ids: z.array(id).min(1).max(1000),
      status: z.enum(["active", "suspended"]),
    })
    .strict(),
  "problems.list": z.object(listInput).strict(),
  "problems.get": z.object({ id }).strict(),
  "problems.import": problemsImportSchema,
  "problems.update": z
    .object({
      id,
      content: questionSchema.optional(),
      skills: skills.optional(),
      unitId: id.optional(),
      difficulty: z.number().int().min(1).max(5).optional(),
      hint: z.string().max(10000).optional(),
      solution: z.string().max(20000).optional(),
      template: z.record(z.string(), z.unknown()).optional(),
    })
    .strict(),
  "sessions.create": z
    .object({
      courseId: id,
      mode: z.enum(["review", "quiz", "problem"]),
      scope: z.enum(["course", "unit", "midterm"]).default("course"),
      unitId: id.optional(),
      count: z.number().int().min(1).max(300).default(20),
      selection: z
        .enum(["random", "balanced", "weak", "ordered"])
        .default("random"),
      feedback: z.enum(["immediate", "end"]).default("immediate"),
      includeUnintroduced: z.boolean().default(false),
      early: z.boolean().default(false),
      skill: z.string().max(100).optional(),
      retrySessionId: id.optional(),
    })
    .strict(),
  "sessions.get": z.object({ id }).strict(),
  "sessions.phase": z
    .object({
      id,
      itemId: id,
      componentId: id,
      answer: z.string().max(1000),
      responseMs: z.number().int().min(0).max(3600000).default(0),
    })
    .strict(),
  "sessions.answer": z
    .object({
      id,
      itemId: id,
      response: questionResponseSchema,
      responseMs: z.number().int().min(0).max(3600000).default(0),
    })
    .strict(),
  "sessions.rate": z
    .object({
      id,
      itemId: id,
      rating: z.number().int().min(1).max(4).optional(),
    })
    .strict(),
  "sessions.list": z
    .object({
      courseId: id.optional(),
      limit: z.number().int().min(1).max(100).default(30),
    })
    .strict(),
  "history.reviews": z
    .object({
      courseId: id.optional(),
      unitId: id.optional(),
      cardId: id.optional(),
      ...pagination,
    })
    .strict(),
  analytics: z
    .object({
      courseId: id.optional(),
      unitId: id.optional(),
      skill: z.string().max(100).optional(),
      type: z.string().max(50).optional(),
      days: z.number().int().min(1).max(3650).default(30),
    })
    .strict(),
  "settings.get": empty,
  "settings.update": z
    .object(
      Object.fromEntries(
        Object.entries(settingsSchema.shape).map(([key, value]) => [
          key,
          value.removeDefault().optional(),
        ]),
      ),
    )
    .strict(),
  "backup.export": empty,
  "backup.restore": z
    .object({ backup: z.unknown(), confirm: z.literal(true) })
    .strict(),
  "sample.remove": z.object({ confirm: z.literal(true) }).strict(),
};
export type ActionName = keyof typeof actionSchemas;
const camel = (row: any) =>
  Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key.replace(/_([a-z])/g, (_, c) => c.toUpperCase()),
      value,
    ]),
  );
const courseJson = (r: any) => ({
  ...camel(r),
  isMath: !!r.is_math,
  archived: !!r.archived,
  sample: !!r.sample,
});
const cardJson = (r: any) => ({
  ...camel(r),
  content: json(r.content),
  skills: json(r.skills, []),
  status: r.introduced_at
    ? r.suspended
      ? "suspended"
      : "active"
    : "unintroduced",
  schedule: json(r.fsrs),
  order: r.position,
});
const problemJson = (r: any) => ({
  ...camel(r),
  content: json(r.content),
  skills: json(r.skills, []),
  template: json(r.template),
});
async function ownedCourse(db: Database, user: string, courseId: string) {
  return (
    (await one<any>(
      db,
      "SELECT * FROM courses WHERE id=? AND user_id=?",
      courseId,
      user,
    )) ?? fail(404, "Course not found")
  );
}
async function ownedUnit(db: Database, user: string, unitId: string) {
  return (
    (await one<any>(
      db,
      "SELECT u.* FROM units u JOIN courses c ON c.id=u.course_id WHERE u.id=? AND c.user_id=?",
      unitId,
      user,
    )) ?? fail(404, "Unit not found")
  );
}
async function ownedContent(
  db: Database,
  user: string,
  contentId: string,
  kind: "cards" | "problems" = "cards",
) {
  return (
    (await one<any>(
      db,
      `SELECT q.* FROM ${kind} q JOIN courses c ON c.id=q.course_id WHERE q.id=? AND c.user_id=?`,
      contentId,
      user,
    )) ?? fail(404, "Content not found")
  );
}
async function getSettings(db: Database, user: string) {
  return settingsSchema.parse(
    json(
      (
        await one<any>(
          db,
          "SELECT settings FROM user_settings WHERE user_id=?",
          user,
        )
      )?.settings,
      {},
    ),
  );
}
async function scheduleSettings(db: Database, user: string, course: any) {
  return { ...(await getSettings(db, user)), ...courseJson(course) };
}
const zeroCounts = () => ({
  totalCards: 0,
  activeCards: 0,
  introducedCards: 0,
  unintroducedCards: 0,
  suspendedCards: 0,
  dueCards: 0,
  newCards: 0,
});
async function contentCounts(
  db: Database,
  user: string,
  courseId?: string,
  unitId?: string,
) {
  const args: any[] = [now(), user];
  let filter = "";
  if (courseId) {
    filter += " AND c.id=?";
    args.push(courseId);
  } else filter += " AND c.archived=0";
  if (unitId) {
    filter += " AND q.unit_id=?";
    args.push(unitId);
  }
  const r = await one<any>(
    db,
    `SELECT COUNT(*) AS totalCards,
       SUM(s.card_id IS NOT NULL) AS introducedCards,
       SUM(s.card_id IS NULL) AS unintroducedCards,
       SUM(s.suspended=0) AS activeCards,
       SUM(s.suspended=1) AS suspendedCards,
       SUM(s.suspended=0 AND s.due<=? AND NOT(c.archived=1 AND c.archive_mode='paused')) AS dueCards,
       SUM(json_extract(s.fsrs,'$.reps')=0) AS newCards,
       MIN(CASE WHEN s.suspended=0 AND NOT(c.archived=1 AND c.archive_mode='paused') THEN s.due END) AS nextReviewAt
     FROM cards q JOIN courses c ON c.id=q.course_id LEFT JOIN schedules s ON s.card_id=q.id
     WHERE c.user_id=?${filter}`,
    ...args,
  );
  return {
    ...Object.fromEntries(
      Object.keys(zeroCounts()).map((key) => [key, Number(r?.[key] ?? 0)]),
    ),
    nextReviewAt: (r?.nextReviewAt ?? null) as string | null,
  };
}
async function courseSummary(db: Database, user: string, r: any) {
  return {
    ...courseJson(r),
    ...(await contentCounts(db, user, r.id)),
    unitCount: Number(
      (
        await one<any>(
          db,
          "SELECT COUNT(*) AS n FROM units WHERE course_id=?",
          r.id,
        )
      )?.n ?? 0,
    ),
  };
}
async function coursesList(db: Database, user: string, archived: boolean) {
  const data = await rows<any>(
    db,
    "SELECT * FROM courses WHERE user_id=? AND archived=? ORDER BY created_at DESC",
    user,
    Number(archived),
  );
  return Promise.all(data.map((r) => courseSummary(db, user, r)));
}
async function courseDetail(db: Database, user: string, courseId: string) {
  const course = await ownedCourse(db, user, courseId);
  const units = await rows<any>(
    db,
    "SELECT * FROM units WHERE course_id=? ORDER BY position,id",
    courseId,
  );
  const [summary, detailedUnits, [resumeSession]] = await Promise.all([
    courseSummary(db, user, course),
    Promise.all(
      units.map(async (r) => ({
        ...camel(r),
        order: r.position,
        ...(await contentCounts(db, user, courseId, r.id)),
      })),
    ),
    sessionsList(db, user, { courseId, limit: 1 }, true),
  ]);
  return {
    course: summary,
    units: detailedUnits,
    resumeSession: resumeSession ?? null,
  };
}
async function contentList(
  db: Database,
  user: string,
  p: any,
  kind: "cards" | "problems",
) {
  await ownedCourse(db, user, p.courseId);
  const args: any[] = [p.courseId];
  let filter = "q.course_id=?";
  if (p.unitId) {
    await ownedUnit(db, user, p.unitId);
    filter += " AND q.unit_id=?";
    args.push(p.unitId);
  }
  if (p.search) {
    filter +=
      " AND (json_extract(q.content,'$.prompt') LIKE ? OR q.external_id LIKE ?)";
    args.push("%" + p.search + "%", "%" + p.search + "%");
  }
  if (p.type) {
    filter += " AND json_extract(q.content,'$.type')=?";
    args.push(p.type);
  }
  if (p.skill) {
    filter += " AND EXISTS(SELECT 1 FROM json_each(q.skills) WHERE value=?)";
    args.push(p.skill);
  }
  if (kind === "cards" && p.status) {
    filter +=
      p.status === "unintroduced"
        ? " AND s.card_id IS NULL"
        : p.status === "suspended"
          ? " AND s.suspended=1"
          : " AND s.card_id IS NOT NULL AND s.suspended=0";
  }
  const join =
    kind === "cards" ? " LEFT JOIN schedules s ON s.card_id=q.id" : "";
  const total = Number(
    (
      await one<any>(
        db,
        `SELECT COUNT(*) AS n FROM ${kind} q${join} WHERE ${filter}`,
        ...args,
      )
    )?.n,
  );
  const items = await rows<any>(
    db,
    `SELECT q.*${kind === "cards" ? ",s.fsrs,s.introduced_at,s.suspended,s.due,s.version AS schedule_version" : ""} FROM ${kind} q${join} WHERE ${filter} ORDER BY q.position,q.id LIMIT ? OFFSET ?`,
    ...args,
    p.limit,
    p.offset,
  );
  return {
    items: items.map((item) =>
      kind === "cards" ? cardJson(item) : problemJson(item),
    ),
    total,
    nextOffset:
      p.offset + items.length < total ? p.offset + items.length : null,
  };
}
async function introduce(db: Database, user: string, p: any) {
  const unit = await ownedUnit(db, user, p.unitId);
  const course = await ownedCourse(db, user, unit.course_id);
  const eligible = await rows<any>(
    db,
    "SELECT q.id FROM cards q LEFT JOIN schedules s ON s.card_id=q.id WHERE q.unit_id=? AND s.card_id IS NULL ORDER BY q.position,q.id",
    p.unitId,
  );
  let selected: any[];
  if (p.cardIds) {
    const requested = new Set(p.cardIds);
    if (requested.size !== p.cardIds.length) fail(400, "Choose each card once");
    const owned = await rows<any>(
      db,
      "SELECT id FROM cards WHERE unit_id=? AND id IN (SELECT value FROM json_each(?))",
      p.unitId,
      JSON.stringify(p.cardIds),
    );
    if (owned.length !== p.cardIds.length)
      fail(400, "Selected cards must belong to this unit");
    selected = eligible.filter((c) => requested.has(c.id));
  } else {
    if (p.count > eligible.length)
      fail(400, `Only ${eligible.length} unintroduced cards are available`);
    selected = eligible.slice(0, p.count);
  }
  if (!selected.length)
    return {
      introduced: 0,
      ...(await contentCounts(db, user, unit.course_id, p.unitId)),
    };
  const time = now(),
    settings = await scheduleSettings(db, user, course);
  const statements: Statement[] = [];
  for (const item of selected) {
    const initial = await newSchedule(settings, new Date(time));
    statements.push(
      stmt(
        db,
        "INSERT OR IGNORE INTO schedules(card_id,introduced_at,suspended,due,fsrs,version) VALUES(?,?,0,?,?,0)",
        item.id,
        time,
        time,
        JSON.stringify(initial),
      ),
    );
  }
  const result = await db.batch(statements);
  return {
    introduced: result.reduce((n, r) => n + (r.meta?.changes ?? 0), 0),
    ...(await contentCounts(db, user, unit.course_id, p.unitId)),
  };
}
async function updateContent(
  db: Database,
  user: string,
  p: any,
  kind: "cards" | "problems",
) {
  const item = await ownedContent(db, user, p.id, kind);
  if (p.unitId) {
    const unit = await ownedUnit(db, user, p.unitId);
    if (unit.course_id !== item.course_id)
      fail(400, "Unit must be in this course");
  }
  if (p.resetSchedule && !p.confirmReset)
    fail(400, "Confirm the explicit schedule reset");
  const sets: string[] = ["updated_at=?", "revision=revision+1"],
    args: any[] = [now()];
  for (const [key, column] of Object.entries({
    content: "content",
    skills: "skills",
    unitId: "unit_id",
    difficulty: "difficulty",
    hint: "hint",
    solution: "solution",
    template: "template",
  })) {
    if (p[key] !== undefined) {
      sets.push(`${column}=?`);
      args.push(
        ["content", "skills", "template"].includes(key)
          ? JSON.stringify(p[key])
          : p[key],
      );
    }
  }
  const statements = [
    stmt(db, `UPDATE ${kind} SET ${sets.join(",")} WHERE id=?`, ...args, p.id),
  ];
  if (kind === "cards" && p.resetSchedule) {
    const old = await one<any>(
      db,
      "SELECT * FROM schedules WHERE card_id=?",
      p.id,
    );
    if (old) {
      const course = await ownedCourse(db, user, item.course_id);
      const initial = await newSchedule(
        await scheduleSettings(db, user, course),
      );
      statements.push(
        stmt(
          db,
          "UPDATE schedules SET fsrs=?,due=?,version=version+1 WHERE card_id=?",
          JSON.stringify(initial),
          initial.dueAt.toISOString(),
          p.id,
        ),
      );
    }
  }
  await db.batch(statements);
  return kind === "cards"
    ? getCard(db, user, p.id)
    : problemJson(await ownedContent(db, user, p.id, "problems"));
}
async function getCard(db: Database, user: string, cardId: string) {
  await ownedContent(db, user, cardId);
  return cardJson(
    await one<any>(
      db,
      "SELECT q.*,s.fsrs,s.introduced_at,s.suspended,s.due,s.version AS schedule_version FROM cards q LEFT JOIN schedules s ON s.card_id=q.id WHERE q.id=?",
      cardId,
    ),
  );
}
function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
async function ownedSession(db: Database, user: string, sessionId: string) {
  return (
    (await one<any>(
      db,
      `SELECT s.*, (c.archived=1 AND c.archive_mode='paused') AS course_paused
       FROM sessions s JOIN courses c ON c.id=s.course_id WHERE s.id=? AND s.user_id=?`,
      sessionId,
      user,
    )) ?? fail(404, "Session not found")
  );
}
async function sessionItems(db: Database, sessionId: string) {
  return rows<any>(
    db,
    "SELECT * FROM session_items WHERE session_id=? ORDER BY position",
    sessionId,
  );
}
const finished = (session: any, item: any) =>
  item.answered_at !== null &&
  json<GradeResult | null>(item.grade)?.correct != null &&
  (session.mode !== "review" || item.reviewed_at !== null);
const finishedSessionItem = `i.answered_at IS NOT NULL AND json_extract(i.grade,'$.correct') IS NOT NULL
  AND (s.mode<>'review' OR i.reviewed_at IS NOT NULL)`;
const unavailableSessionItem = `(s.mode='review' AND (sch.card_id IS NULL OR sch.suspended=1 OR sch.version IS NOT i.schedule_version))
  OR (s.mode='quiz' AND (i.card_id IS NULL OR sch.suspended IS 1))
  OR (s.mode='problem' AND i.problem_id IS NULL)`;
const canWriteSessionItem = `i.skipped_at IS NULL AND EXISTS (
  SELECT 1 FROM sessions s LEFT JOIN courses c ON c.id=s.course_id
  LEFT JOIN schedules sch ON sch.card_id=i.card_id
  WHERE s.id=i.session_id AND s.status='active'
    AND NOT (s.mode='review' AND c.archived=1 AND c.archive_mode='paused')
    AND NOT (${unavailableSessionItem})
)`;

async function activeSessionItems(db: Database, session: any) {
  if (session.status === "active") {
    // Keep answered history, and persist each skip so a reload or reactivation cannot reopen it.
    await run(
      db,
      `UPDATE session_items AS i SET skipped_at=? WHERE i.session_id=? AND i.skipped_at IS NULL AND EXISTS (
        SELECT 1 FROM sessions s LEFT JOIN schedules sch ON sch.card_id=i.card_id
        WHERE s.id=i.session_id AND s.status='active'
          AND NOT (${finishedSessionItem}) AND (${unavailableSessionItem})
      )`,
      now(),
      session.id,
    );
  }
  return sessionItems(db, session.id);
}

const currentSessionItem = (session: any, items: any[]) =>
  items.find((item) => !item.skipped_at && !finished(session, item));

async function loadSessionItem(db: Database, user: string, p: any) {
  const session = await ownedSession(db, user, p.id);
  const items = await activeSessionItems(db, session);
  const item =
    items.find((entry) => entry.id === p.itemId) ??
    fail(404, "Question not found");
  return { session, items, item };
}

async function sessionView(
  db: Database,
  user: string,
  sessionId: string,
  lastAnswer?: any,
) {
  const session = await ownedSession(db, user, sessionId);
  const all = await activeSessionItems(db, session);
  const items = all.filter((i) => !i.skipped_at);
  const answered = items.filter((i) => finished(session, i)).length;
  const current = currentSessionItem(session, items);
  const complete = !current;
  let completedAt = session.completed_at;
  if (complete && session.status !== "completed") {
    completedAt = now();
    await run(
      db,
      "UPDATE sessions SET status='completed',completed_at=COALESCE(completed_at,?) WHERE id=?",
      completedAt,
      session.id,
    );
  }
  const view: any = {
    id: session.id,
    courseId: session.course_id,
    mode: session.mode,
    status: complete ? "completed" : "active",
    total: items.length,
    answered,
    index: current ? items.indexOf(current) : items.length,
    createdAt: session.created_at,
    completedAt,
  };
  if (all.length > items.length) view.skipped = all.length - items.length;
  if (current && session.mode === "review" && session.course_paused)
    view.paused = true;
  else if (current) {
    const prepared = json<PreparedQuestion>(current.prepared),
      snapshot = json<any>(current.snapshot),
      grade = json<GradeResult | null>(current.grade),
      settings = json<any>(session.options);
    view.current = {
      id: current.id,
      cardId: current.card_id,
      problemId: current.problem_id,
      unitId: current.unit_id,
      skills: json(current.skills, []),
      question: prepared.presentation,
      submitted: !!current.answered_at,
    };
    if (current.answered_at) view.current.response = json(current.response);
    const phase = json<any>(current.phase_progress, {
      answers: {},
      grades: [],
      elapsedMs: 0,
    });
    view.current.phaseIndex = Object.keys(phase.answers).length;
    view.current.phaseAnswers = phase.answers;
    view.current.phaseGrades = settings.feedback === "end" ? [] : phase.grades;
    if (snapshot.hint) view.current.hint = snapshot.hint;
    if (
      grade &&
      (session.mode === "review" ||
        settings.feedback === "immediate" ||
        grade.requiresManual)
    ) {
      view.current.grade = grade;
      view.current.recommendedRating = grade.correct ? 3 : 1;
      if (snapshot.solution) view.current.solution = snapshot.solution;
    }
  }
  if (complete) {
    const unitNames = new Map(
      (
        await rows<{ id: string; name: string }>(
          db,
          "SELECT id,name FROM units WHERE course_id=?",
          session.course_id,
        )
      ).map((unit) => [unit.id, unit.name]),
    );
    const resultItems = items.map((item) => ({
      id: item.id,
      cardId: item.card_id,
      problemId: item.problem_id,
      question: json<PreparedQuestion>(item.prepared).presentation,
      grade: json(item.grade),
      response: json(item.response),
      skills: json(item.skills, []),
      unitId: item.unit_id,
      unitName: unitNames.get(item.unit_id) ?? "Previous unit",
      rating: item.rating,
      responseMs: item.response_ms,
      solution: json<any>(item.snapshot).solution,
    }));
    const correct = resultItems.filter((i) => i.grade?.correct === true).length;
    view.results = {
      accuracy: items.length ? correct / items.length : 0,
      correct,
      total: items.length,
      responseMs: items.reduce((n, i) => n + i.response_ms, 0),
      items: resultItems,
    };
  }
  if (lastAnswer) view.lastAnswer = lastAnswer;
  return view;
}
async function createSession(db: Database, user: string, p: any) {
  const course = await ownedCourse(db, user, p.courseId);
  if (
    p.mode === "review" &&
    course.archived &&
    course.archive_mode === "paused"
  )
    fail(
      400,
      "Scheduled reviews are paused for this archived course. Change its review mode or use a practice quiz.",
    );
  let unitIds: string[] | null = null;
  if (p.scope === "unit") {
    if (!p.unitId) fail(400, "Select a unit");
    const unit = await ownedUnit(db, user, p.unitId);
    if (unit.course_id !== p.courseId) fail(400, "Unit is outside this course");
    unitIds = [p.unitId];
  } else if (p.scope === "midterm") {
    if (!course.midterm_unit_id)
      fail(400, "Set a midterm boundary for this course first");
    const boundary = await ownedUnit(db, user, course.midterm_unit_id);
    unitIds = (
      await rows<any>(
        db,
        "SELECT id FROM units WHERE course_id=? AND position<=? ORDER BY position",
        p.courseId,
        boundary.position,
      )
    ).map((u) => u.id);
  }
  const kind = p.mode === "problem" ? "problems" : "cards",
    args: any[] = [p.courseId];
  let filter = "q.course_id=?";
  if (unitIds) {
    filter += " AND q.unit_id IN (SELECT value FROM json_each(?))";
    args.push(JSON.stringify(unitIds));
  }
  if (p.skill) {
    filter += " AND EXISTS(SELECT 1 FROM json_each(q.skills) WHERE value=?)";
    args.push(p.skill);
  }
  let join = "";
  if (kind === "cards") {
    join = " LEFT JOIN schedules s ON s.card_id=q.id";
    filter += " AND s.suspended IS NOT 1";
    if (p.mode === "review" || !p.includeUnintroduced)
      filter += " AND s.card_id IS NOT NULL";
    if (p.mode === "review" && !p.early) {
      filter += " AND s.due<=?";
      args.push(now());
    }
  }
  let candidates = await rows<any>(
    db,
    `SELECT q.*${kind === "cards" ? ",s.version AS schedule_version,s.due" : ""} FROM ${kind} q${join} WHERE ${filter}`,
    ...args,
  );
  if (p.retrySessionId) {
    const retry = await ownedSession(db, user, p.retrySessionId);
    if (retry.course_id !== p.courseId)
      fail(400, "Retry must stay in the same course");
    const source = await sessionItems(db, retry.id);
    const missed = new Set(
      source
        .filter(
          (i) =>
            !i.skipped_at &&
            finished(retry, i) &&
            json<GradeResult | null>(i.grade)?.correct === false,
        )
        .map((i) => (kind === "cards" ? i.card_id : i.problem_id)),
    );
    candidates = candidates.filter((c) => missed.has(c.id));
  }
  if (p.selection === "weak") {
    const attempts = await rows<any>(
      db,
      `SELECT i.card_id,i.problem_id,i.grade FROM session_items i JOIN sessions s ON s.id=i.session_id
       WHERE s.user_id=? AND s.course_id=? AND i.skipped_at IS NULL AND ${finishedSessionItem}`,
      user,
      p.courseId,
    );
    const scores = new Map<string, { n: number; correct: number }>();
    for (const a of attempts) {
      const key = kind === "cards" ? a.card_id : a.problem_id;
      const grade = json<GradeResult>(a.grade);
      if (grade.correct === null) continue;
      const s = scores.get(key) ?? { n: 0, correct: 0 };
      s.n++;
      s.correct += Number(grade.correct);
      scores.set(key, s);
    }
    candidates = shuffle(candidates).sort((a, b) => {
      const aa = scores.get(a.id),
        bb = scores.get(b.id);
      return (aa ? aa.correct / aa.n : 0.5) - (bb ? bb.correct / bb.n : 0.5);
    });
  } else if (p.selection === "balanced") {
    const buckets = new Map<string, any[]>();
    for (const c of shuffle(candidates)) {
      const b = buckets.get(c.unit_id) ?? [];
      b.push(c);
      buckets.set(c.unit_id, b);
    }
    candidates = [];
    while ([...buckets.values()].some((b) => b.length)) {
      for (const b of buckets.values()) if (b.length) candidates.push(b.pop());
    }
  } else if (p.mode === "review")
    candidates.sort(
      (a, b) =>
        String(a.due).localeCompare(String(b.due)) || a.position - b.position,
    );
  else if (p.selection === "ordered")
    candidates.sort(
      (a, b) => a.position - b.position || a.id.localeCompare(b.id),
    );
  else candidates = shuffle(candidates);
  candidates = candidates.slice(0, p.count);
  if (!candidates.length)
    fail(
      400,
      p.retrySessionId
        ? "No missed questions are available to retry."
        : p.mode === "review"
          ? "No cards are available to review in this scope."
          : p.mode === "problem"
            ? "No problems match this scope. Change the scope or add problems to this course."
            : p.includeUnintroduced
              ? "No available cards match this scope. Change the scope or check your card library."
              : "No active cards match this scope. Change the scope or include unintroduced cards.",
    );
  const sessionId = uid(),
    time = now();
  const statements = [
    stmt(
      db,
      "INSERT INTO sessions(id,user_id,course_id,mode,options,status,created_at) VALUES(?,?,?,?,?,'active',?)",
      sessionId,
      user,
      p.courseId,
      p.mode,
      JSON.stringify(p),
      time,
    ),
  ];
  candidates.forEach((c, index) => {
    const snapshot = {
      ...camel(c),
      content: json(c.content),
      skills: json(c.skills, []),
    };
    const prepared = prepareQuestion(snapshot.content);
    statements.push(
      stmt(
        db,
        "INSERT INTO session_items(id,session_id,position,card_id,problem_id,unit_id,skills,snapshot,prepared,schedule_version) VALUES(?,?,?,?,?,?,?,?,?,?)",
        uid(),
        sessionId,
        index,
        kind === "cards" ? c.id : null,
        kind === "problems" ? c.id : null,
        c.unit_id,
        c.skills,
        JSON.stringify(snapshot),
        JSON.stringify(prepared),
        c.schedule_version ?? null,
      ),
    );
  });
  await db.batch(statements);
  return sessionView(db, user, sessionId);
}
async function answerSession(db: Database, user: string, p: any) {
  const { session, items, item } = await loadSessionItem(db, user, p);
  if (item.skipped_at || (session.mode === "review" && session.course_paused))
    return sessionView(db, user, p.id);
  const options = json<any>(session.options),
    prepared = json<PreparedQuestion>(item.prepared);
  const previous = json<GradeResult | null>(item.grade);
  const feedback = (grade: GradeResult) =>
    options.feedback === "immediate"
      ? {
          question: prepared.presentation,
          grade,
          solution: json<any>(item.snapshot).solution,
          itemId: item.id,
        }
      : undefined;
  if (previous && !previous.requiresManual)
    return sessionView(
      db,
      user,
      p.id,
      session.mode !== "review" ? feedback(previous) : undefined,
    );
  const current = currentSessionItem(session, items);
  if (current?.id !== item.id) fail(409, "Answer the current question first");
  let response = p.response;
  const phases = json<any>(item.phase_progress, { answers: {}, elapsedMs: 0 });
  if (Object.keys(phases.answers).length)
    response = {
      ...response,
      answers: { ...response.answers, ...phases.answers },
    };
  if (previous?.requiresManual) {
    if (typeof response.manualCorrect !== "boolean")
      return sessionView(db, user, p.id);
    response = {
      ...json<any>(item.response),
      manualCorrect: response.manualCorrect,
    };
  } else if (response.manualCorrect !== undefined)
    fail(400, "Submit your answer before self-grading");
  const grade = gradeQuestion(prepared.answerKey, response);
  const time = now();
  const statements = [
    stmt(
      db,
      `UPDATE session_items AS i SET response=?,grade=?,response_ms=?,answered_at=?
       WHERE i.id=? AND (i.answered_at IS NULL OR json_extract(i.grade,'$.requiresManual')=1)
       AND ${canWriteSessionItem}`,
      JSON.stringify(response),
      JSON.stringify(grade),
      previous ? item.response_ms : p.responseMs,
      time,
      item.id,
    ),
  ];
  if (session.mode === "problem" && grade.correct !== null) {
    statements.push(
      stmt(
        db,
        `INSERT OR IGNORE INTO problem_attempts(id,user_id,problem_id,session_item_id,correct,grade,response_ms,created_at)
         SELECT ?,?,?,?,json_extract(grade,'$.correct'),grade,response_ms,? FROM session_items
         WHERE id=? AND skipped_at IS NULL AND json_extract(grade,'$.correct') IS NOT NULL`,
        uid(),
        user,
        item.problem_id,
        item.id,
        time,
        item.id,
      ),
    );
  }
  await db.batch(statements);
  const saved = await one<any>(
    db,
    "SELECT grade,skipped_at FROM session_items WHERE id=?",
    item.id,
  );
  const savedGrade = saved?.skipped_at
    ? null
    : json<GradeResult | null>(saved?.grade);
  return sessionView(
    db,
    user,
    p.id,
    session.mode !== "review" && savedGrade && !savedGrade.requiresManual
      ? feedback(savedGrade)
      : undefined,
  );
}

async function phaseSession(db: Database, user: string, p: any) {
  const { session, items, item } = await loadSessionItem(db, user, p);
  if (item.skipped_at || (session.mode === "review" && session.course_paused))
    return sessionView(db, user, p.id);
  const prepared = json<PreparedQuestion>(item.prepared);
  if (prepared.presentation.type !== "cloze")
    fail(400, "Phased responses apply only to cloze cards");
  const progress = json<any>(item.phase_progress, {
      answers: {},
      grades: [],
      elapsedMs: 0,
    }),
    components = prepared.presentation.components,
    index = components.findIndex((c) => c.id === p.componentId);
  if (index < 0) fail(400, "Unknown component");
  const feedback = json<any>(session.options).feedback !== "end";
  if (Object.hasOwn(progress.answers, p.componentId)) {
    const view =
      !item.answered_at &&
      Object.keys(progress.answers).length === components.length
        ? await answerSession(db, user, {
            id: p.id,
            itemId: p.itemId,
            response: { answers: progress.answers },
            responseMs: progress.elapsedMs,
          })
        : await sessionView(db, user, p.id);
    view.lastPhase = {
      componentId: p.componentId,
      ...(feedback ? { grade: progress.grades[index] } : {}),
    };
    return view;
  }
  if (item.answered_at) fail(409, "This question is already answered");
  const current = currentSessionItem(session, items);
  if (current?.id !== item.id) fail(409, "Answer the current question first");
  if (index !== Object.keys(progress.answers).length)
    fail(409, "Answer cloze components in order");
  const grade = gradePhase(prepared.answerKey, p.componentId, p.answer);
  progress.answers[p.componentId] = p.answer;
  progress.grades.push(grade);
  progress.elapsedMs = Math.min(3600000, progress.elapsedMs + p.responseMs);
  const changed = await run(
    db,
    `UPDATE session_items AS i SET phase_progress=?
     WHERE i.id=? AND i.phase_progress IS ? AND i.answered_at IS NULL AND ${canWriteSessionItem}`,
    JSON.stringify(progress),
    item.id,
    item.phase_progress,
  );
  if (!changed.meta?.changes)
    fail(409, "This phase was updated elsewhere. Reload the session.");
  const view =
    Object.keys(progress.answers).length === components.length
      ? await answerSession(db, user, {
          id: p.id,
          itemId: p.itemId,
          response: { answers: progress.answers },
          responseMs: progress.elapsedMs,
        })
      : await sessionView(db, user, p.id);
  view.lastPhase = {
    componentId: p.componentId,
    ...(feedback ? { grade } : {}),
  };
  return view;
}

async function rateSession(db: Database, user: string, p: any) {
  const { session, items, item } = await loadSessionItem(db, user, p);
  if (session.mode !== "review")
    fail(400, "Only scheduled review accepts FSRS ratings");
  if (item.reviewed_at) return sessionView(db, user, p.id);
  if (item.skipped_at)
    fail(
      409,
      "This card was updated in another session or is now unavailable.",
    );
  const grade = json<GradeResult | null>(item.grade);
  if (!grade || grade.requiresManual || grade.correct === null)
    throw new ServiceError(400, "Answer and grade the question first");
  const current = currentSessionItem(session, items);
  if (current?.id !== item.id) fail(409, "Rate the current question first");
  const schedule =
    (await one<any>(
      db,
      "SELECT * FROM schedules WHERE card_id=?",
      item.card_id,
    )) ?? fail(409, "This card is no longer introduced");
  if (schedule.suspended) fail(409, "This card is suspended");
  if (schedule.version !== item.schedule_version)
    fail(409, "This card was reviewed or reset in another session.");
  const course = await ownedCourse(db, user, session.course_id);
  if (course.archived && course.archive_mode === "paused")
    fail(409, "Scheduled reviews are paused for this course");
  const rating = p.rating ?? (grade.correct ? 3 : 1),
    time = now(),
    result = await reviewSchedule(
      json(schedule.fsrs),
      rating,
      await scheduleSettings(db, user, course),
      new Date(time),
    );
  const eventId = uid();
  const statements = [
    stmt(
      db,
      `INSERT INTO reviews(id,user_id,card_id,session_item_id,rating,correct,before,after,log,grade,response_ms,created_at)
       SELECT ?,?,?,?,?,?,?,?,?,?,?,? FROM schedules WHERE card_id=? AND version=? AND suspended=0
       AND EXISTS (SELECT 1 FROM session_items i WHERE i.id=? AND ${canWriteSessionItem})`,
      eventId,
      user,
      item.card_id,
      item.id,
      rating,
      Number(grade.correct),
      schedule.fsrs,
      JSON.stringify(result.card),
      JSON.stringify(result.revlog),
      item.grade,
      item.response_ms,
      time,
      item.card_id,
      item.schedule_version,
      item.id,
    ),
    stmt(
      db,
      "UPDATE schedules SET fsrs=?,due=?,version=version+1 WHERE card_id=? AND version=? AND EXISTS(SELECT 1 FROM reviews WHERE id=?)",
      JSON.stringify(result.card),
      result.card.dueAt.toISOString(),
      item.card_id,
      item.schedule_version,
      eventId,
    ),
    stmt(
      db,
      "UPDATE session_items SET rating=?,reviewed_at=? WHERE id=? AND EXISTS(SELECT 1 FROM reviews WHERE id=?)",
      rating,
      time,
      item.id,
      eventId,
    ),
  ];
  try {
    await db.batch(statements);
  } catch (error) {
    if (
      await one(db, "SELECT id FROM reviews WHERE session_item_id=?", item.id)
    )
      return sessionView(db, user, p.id);
    throw error;
  }
  if (
    !(await one(db, "SELECT id FROM reviews WHERE session_item_id=?", item.id))
  )
    fail(409, "This card changed while the rating was being saved.");
  return sessionView(db, user, p.id);
}
async function sessionsList(
  db: Database,
  user: string,
  p: { courseId?: string; limit: number },
  resumableOnly = false,
) {
  const args: any[] = [user];
  let filter = "s.user_id=?";
  if (p.courseId) {
    await ownedCourse(db, user, p.courseId);
    filter += " AND s.course_id=?";
    args.push(p.courseId);
  }
  if (resumableOnly)
    filter +=
      " AND s.status='active' AND NOT (s.mode='review' AND c.archived=1 AND c.archive_mode='paused')";
  return rows<any>(
    db,
    `SELECT s.id,s.course_id AS courseId,c.name AS courseName,s.mode,s.status,
       s.created_at AS createdAt,s.completed_at AS completedAt,
       COUNT(CASE WHEN (${finishedSessionItem}) OR NOT (${unavailableSessionItem}) THEN i.id END) AS total,
       COUNT(CASE WHEN ${finishedSessionItem} THEN 1 END) AS answered,
       COUNT(CASE WHEN ${finishedSessionItem} AND json_extract(i.grade,'$.correct')=1 THEN 1 END) AS correct,
       AVG(CASE WHEN ${finishedSessionItem} THEN json_extract(i.grade,'$.correct') END) AS accuracy,
       SUM(CASE WHEN ${finishedSessionItem} THEN i.response_ms ELSE 0 END) AS responseMs
     FROM sessions s JOIN courses c ON c.id=s.course_id
     LEFT JOIN session_items i ON i.session_id=s.id AND i.skipped_at IS NULL
     LEFT JOIN schedules sch ON sch.card_id=i.card_id
     WHERE ${filter} GROUP BY s.id ${resumableOnly ? "HAVING total > answered" : ""}
     ORDER BY s.created_at DESC,s.id DESC LIMIT ?`,
    ...args,
    p.limit,
  );
}
async function analytics(db: Database, user: string, p: any) {
  if (p.courseId) await ownedCourse(db, user, p.courseId);
  if (p.unitId) await ownedUnit(db, user, p.unitId);
  const args: any[] = [
    user,
    new Date(Date.now() - p.days * 86400000).toISOString(),
  ];
  let filter = "s.user_id=? AND i.answered_at>=? AND i.skipped_at IS NULL";
  if (p.courseId) {
    filter += " AND s.course_id=?";
    args.push(p.courseId);
  } else filter += " AND c.archived=0";
  if (p.unitId) {
    filter += " AND i.unit_id=?";
    args.push(p.unitId);
  }
  if (p.skill) {
    filter += " AND EXISTS(SELECT 1 FROM json_each(i.skills) WHERE value=?)";
    args.push(p.skill);
  }
  if (p.type) {
    filter += " AND json_extract(i.snapshot,'$.content.type')=?";
    args.push(p.type);
  }
  const events = await rows<any>(
    db,
    `SELECT i.*,s.mode,s.course_id,u.name AS unit_name FROM session_items i JOIN sessions s ON s.id=i.session_id JOIN courses c ON c.id=s.course_id LEFT JOIN units u ON u.id=i.unit_id WHERE ${filter}`,
    ...args,
  );
  const valid = events.filter(
      (e) =>
        json<GradeResult | null>(e.grade)?.correct != null &&
        (e.mode !== "review" || e.reviewed_at),
    ),
    review = valid.filter((e) => e.mode === "review"),
    practice = valid.filter((e) => e.mode !== "review");
  const correct = (a: any[]) =>
    a.filter((e) => json<GradeResult>(e.grade).correct).length;
  const weakUnits = new Map<string, any>(),
    weakSkills = new Map<string, any>(),
    byType = new Map<string, any>(),
    misses = new Map<string, any>(),
    trend = new Map<string, any>();
  const timezone = (await getSettings(db, user)).timezone;
  const dateKey = (date: string) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(date));
  for (const event of valid) {
    const grade = json<GradeResult>(event.grade),
      snapshot = json<any>(event.snapshot),
      skillNames = json<string[]>(event.skills, []);
    const accumulate = (map: Map<string, any>, key: string, fields: any) => {
      const v = map.get(key) ?? { ...fields, total: 0, correct: 0 };
      v.total++;
      v.correct += Number(grade.correct);
      map.set(key, v);
    };
    accumulate(weakUnits, event.unit_id, {
      unitId: event.unit_id,
      name: event.unit_name ?? "Previous unit",
    });
    for (const skill of skillNames) accumulate(weakSkills, skill, { skill });
    accumulate(byType, snapshot.content.type, { type: snapshot.content.type });
    const key = event.card_id ?? event.problem_id;
    if (key) {
      const v = misses.get(key) ?? {
        cardId: event.card_id,
        problemId: event.problem_id,
        prompt: snapshot.content.prompt,
        misses: 0,
        total: 0,
      };
      v.total++;
      v.misses += Number(!grade.correct);
      misses.set(key, v);
    }
    const date = dateKey(event.answered_at),
      day = trend.get(date) ?? {
        date,
        reviews: 0,
        practice: 0,
        correct: 0,
        responseMs: 0,
      };
    day[event.mode === "review" ? "reviews" : "practice"]++;
    day.correct += Number(grade.correct);
    day.responseMs += event.response_ms;
    trend.set(date, day);
  }
  const scheduleArgs: any[] = [user];
  let sf = "c.user_id=? AND s.suspended=0";
  if (p.courseId) {
    sf += " AND c.id=?";
    scheduleArgs.push(p.courseId);
  } else sf += " AND c.archived=0";
  if (p.unitId) {
    sf += " AND q.unit_id=?";
    scheduleArgs.push(p.unitId);
  }
  if (p.skill) {
    sf += " AND EXISTS(SELECT 1 FROM json_each(q.skills) WHERE value=?)";
    scheduleArgs.push(p.skill);
  }
  if (p.type) {
    sf += " AND json_extract(q.content,'$.type')=?";
    scheduleArgs.push(p.type);
  }
  const states = await rows<any>(
    db,
    `SELECT s.fsrs,s.due FROM schedules s JOIN cards q ON q.id=s.card_id JOIN courses c ON c.id=q.course_id WHERE ${sf}`,
    ...scheduleArgs,
  );
  const estimates = (
    await Promise.all(states.map((s) => retrievability(json(s.fsrs))))
  ).filter((x): x is number => x !== null);
  const summary = {
    ...(await contentCounts(db, user, p.courseId, p.unitId)),
    reviewCount: review.length,
    reviewSuccessRate: review.length ? correct(review) / review.length : null,
    practiceCount: practice.length,
    practiceAccuracy: practice.length
      ? correct(practice) / practice.length
      : null,
    studyTimeMs: valid.reduce((n, e) => n + e.response_ms, 0),
    estimatedRetention: estimates.length
      ? estimates.reduce((a, b) => a + b, 0) / estimates.length
      : null,
  };
  const grouped = (m: Map<string, any>) =>
    [...m.values()]
      .map((v) => ({ ...v, accuracy: v.total ? v.correct / v.total : 0 }))
      .sort((a, b) => a.accuracy - b.accuracy);
  const workloadMap = new Map<string, number>();
  for (const s of states) {
    const day = dateKey(s.due);
    workloadMap.set(day, (workloadMap.get(day) ?? 0) + 1);
  }
  return {
    summary,
    ...summary,
    trend: [...trend.values()].sort((a, b) => a.date.localeCompare(b.date)),
    weakUnits: grouped(weakUnits),
    weakSkills: grouped(weakSkills),
    byType: grouped(byType),
    frequentMisses: [...misses.values()]
      .filter((v) => v.misses > 0)
      .sort((a, b) => b.misses - a.misses)
      .slice(0, 20),
    workload: [...workloadMap]
      .map(([date, due]) => ({ date, due }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    recentSessions: await sessionsList(db, user, {
      courseId: p.courseId,
      limit: 10,
    }),
  };
}
export const backupTables = [
  "user_settings",
  "courses",
  "units",
  "cards",
  "schedules",
  "problems",
  "sessions",
  "session_items",
  "reviews",
  "problem_attempts",
  "import_batches",
  "assets",
] as const;
const tableColumns: Record<string, string[]> = {
  user_settings: ["user_id", "settings", "updated_at"],
  courses: [
    "id",
    "user_id",
    "name",
    "subject",
    "is_math",
    "archived",
    "archive_mode",
    "retention",
    "relaxed_retention",
    "max_interval",
    "midterm_unit_id",
    "source_url",
    "sample",
    "created_at",
  ],
  units: ["id", "course_id", "name", "position"],
  cards: [
    "id",
    "course_id",
    "unit_id",
    "external_id",
    "content",
    "skills",
    "position",
    "revision",
    "created_at",
    "updated_at",
  ],
  schedules: [
    "card_id",
    "introduced_at",
    "suspended",
    "due",
    "fsrs",
    "version",
  ],
  problems: [
    "id",
    "course_id",
    "unit_id",
    "external_id",
    "content",
    "skills",
    "difficulty",
    "hint",
    "solution",
    "template",
    "position",
    "revision",
    "created_at",
    "updated_at",
  ],
  sessions: [
    "id",
    "user_id",
    "course_id",
    "mode",
    "options",
    "status",
    "created_at",
    "completed_at",
  ],
  session_items: [
    "id",
    "session_id",
    "position",
    "card_id",
    "problem_id",
    "unit_id",
    "skills",
    "snapshot",
    "prepared",
    "schedule_version",
    "phase_progress",
    "response",
    "grade",
    "response_ms",
    "answered_at",
    "rating",
    "reviewed_at",
    "skipped_at",
  ],
  reviews: [
    "id",
    "user_id",
    "card_id",
    "session_item_id",
    "rating",
    "correct",
    "before",
    "after",
    "log",
    "grade",
    "response_ms",
    "created_at",
  ],
  problem_attempts: [
    "id",
    "user_id",
    "problem_id",
    "session_item_id",
    "correct",
    "grade",
    "response_ms",
    "created_at",
  ],
  import_batches: [
    "id",
    "user_id",
    "batch_key",
    "hash",
    "result",
    "created_at",
  ],
  assets: [
    "id",
    "user_id",
    "key",
    "content_type",
    "name",
    "bytes",
    "created_at",
  ],
};
const directOwner = new Set([
  "user_settings",
  "courses",
  "sessions",
  "reviews",
  "problem_attempts",
  "import_batches",
  "assets",
]);
async function exportBackup(db: Database, user: string) {
  const tables: Record<string, any[]> = {};
  for (const table of backupTables) {
    if (directOwner.has(table))
      tables[table] = await rows(
        db,
        `SELECT * FROM ${table} WHERE user_id=?`,
        user,
      );
    else if (["units", "cards", "problems"].includes(table))
      tables[table] = await rows(
        db,
        `SELECT t.* FROM ${table} t JOIN courses c ON c.id=t.course_id WHERE c.user_id=?`,
        user,
      );
    else if (table === "schedules")
      tables[table] = await rows(
        db,
        "SELECT s.* FROM schedules s JOIN cards q ON q.id=s.card_id JOIN courses c ON c.id=q.course_id WHERE c.user_id=?",
        user,
      );
    else
      tables[table] = await rows(
        db,
        "SELECT i.* FROM session_items i JOIN sessions s ON s.id=i.session_id WHERE s.user_id=?",
        user,
      );
  }
  return { format: "recall-academy", version: 1, exportedAt: now(), tables };
}
const nullableColumns = new Set([
  "midterm_unit_id",
  "source_url",
  "external_id",
  "hint",
  "solution",
  "template",
  "completed_at",
  "card_id",
  "problem_id",
  "schedule_version",
  "phase_progress",
  "response",
  "grade",
  "answered_at",
  "rating",
  "reviewed_at",
  "skipped_at",
]);
const numericColumns = new Set([
  "is_math",
  "archived",
  "retention",
  "relaxed_retention",
  "max_interval",
  "sample",
  "position",
  "revision",
  "suspended",
  "version",
  "difficulty",
  "schedule_version",
  "response_ms",
  "rating",
  "correct",
  "bytes",
]);

const backupDate = z.string().datetime();
const savedFsrs = z
  .object({
    stability: z.number().nonnegative(),
    stabilityFast: z.number().nonnegative(),
    difficulty: z.number().min(0).max(10),
    state: z.number().int().min(0).max(3),
    scheduleStatus: z.enum(["new", "learning", "review", "relearning"]),
    dueAt: backupDate,
    lastReviewAt: backupDate.nullable(),
    cardId: id,
    reps: z.number().int().nonnegative(),
    lapses: z.number().int().nonnegative(),
    scheduledDays: z.number().nonnegative(),
    learningStep: z.number().int().nonnegative(),
  })
  .passthrough();
const savedGrade = z
  .object({
    correct: z.boolean().nullable(),
    requiresManual: z.boolean(),
    components: z
      .array(
        z
          .object({
            id,
            sourceId: id,
            correct: z.boolean().nullable(),
            submitted: z.union([z.string(), z.array(z.string())]),
            expected: z.array(z.string()),
            explanation: z.string().optional(),
            reason: z.string().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(30),
    explanation: z.string().optional(),
  })
  .strict();
const savedPresentation = z
  .object({
    type: z.enum([
      "multiple_choice",
      "multiple_select",
      "true_false",
      "cloze",
      "matching",
      "sequencing",
      "typed",
    ]),
    prompt: z.string(),
    variantId: id.nullable(),
    imageUrl: z.string().optional(),
    imageAlt: z.string().optional(),
    components: z
      .array(
        z
          .object({
            id,
            kind: z.enum(["single", "multiple", "sequence", "typed"]),
            prompt: z.string(),
            options: z
              .array(z.object({ id, text: z.string() }).strict())
              .optional(),
            gradingMode: z.enum(["numeric", "expression", "manual"]).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(30),
  })
  .strict();
const savedAnswerKey = z
  .object({
    type: savedPresentation.shape.type,
    variantId: id.nullable(),
    components: z
      .array(
        z
          .object({
            id,
            sourceId: id,
            kind: z.enum(["single", "multiple", "sequence", "typed"]),
            correct: z.union([z.string(), z.array(z.string())]),
            expectedText: z.array(z.string()),
            explanation: z.string().optional(),
            gradingMode: z.enum(["numeric", "expression", "manual"]).optional(),
            tolerance: z.number().nonnegative().optional(),
            variables: z.array(z.string()).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(30),
    explanation: z.string().optional(),
  })
  .strict();
const savedPrepared = z
  .object({ presentation: savedPresentation, answerKey: savedAnswerKey })
  .strict()
  .refine(
    (v) =>
      v.presentation.type === v.answerKey.type &&
      v.presentation.components.length === v.answerKey.components.length &&
      v.presentation.components.every(
        (part, index) =>
          part.id === v.answerKey.components[index].id &&
          part.kind === v.answerKey.components[index].kind,
      ),
    "Presentation and answer key must match",
  );
const savedPhase = z
  .object({
    answers: z.record(z.string(), z.string()),
    grades: z.array(savedGrade).max(20),
    elapsedMs: z.number().int().min(0).max(3600000),
  })
  .strict();
function backupJson(value: unknown) {
  try {
    return json<any>(value);
  } catch {
    throw new ServiceError(400, "Backup contains invalid JSON");
  }
}
function validateRowJson(table: string, row: any) {
  for (const key of [
    "created_at",
    "updated_at",
    "introduced_at",
    "due",
    "answered_at",
    "reviewed_at",
    "skipped_at",
    "completed_at",
  ])
    if (row[key] !== undefined && row[key] !== null) backupDate.parse(row[key]);
  for (const key of ["is_math", "archived", "sample", "suspended", "correct"])
    if (row[key] !== undefined) z.number().int().min(0).max(1).parse(row[key]);
  for (const key of [
    "position",
    "revision",
    "version",
    "schedule_version",
    "response_ms",
    "bytes",
  ])
    if (row[key] !== undefined && row[key] !== null)
      z.number().int().nonnegative().parse(row[key]);
  if (row.skills !== undefined) skills.parse(backupJson(row.skills));
  if (row.template !== undefined && row.template !== null)
    z.record(z.string(), z.unknown()).parse(backupJson(row.template));
  if (row.fsrs !== undefined) savedFsrs.parse(backupJson(row.fsrs));
  if (row.grade !== undefined && row.grade !== null)
    savedGrade.parse(backupJson(row.grade));
  if (row.response !== undefined && row.response !== null)
    questionResponseSchema.parse(backupJson(row.response));
  if (row.prepared !== undefined) savedPrepared.parse(backupJson(row.prepared));
  if (row.phase_progress !== undefined && row.phase_progress !== null)
    savedPhase.parse(backupJson(row.phase_progress));
  if (row.snapshot !== undefined)
    z.object({ content: questionSchema, skills })
      .passthrough()
      .parse(backupJson(row.snapshot));
  if (table === "sessions") {
    actionSchemas["sessions.create"].parse(backupJson(row.options));
    z.enum(["review", "quiz", "problem"]).parse(row.mode);
    z.enum(["active", "completed"]).parse(row.status);
  }
  if (table === "reviews") {
    savedFsrs.parse(backupJson(row.before));
    savedFsrs.parse(backupJson(row.after));
    z.object({
      rating: z.number().int().min(1).max(4),
      reviewTime: backupDate,
      dueAt: backupDate,
      state: z.number().int().min(0).max(3),
      cardId: id,
    })
      .passthrough()
      .parse(backupJson(row.log));
  }
  if (table === "import_batches")
    z.object({
      imported: z.number().int().nonnegative(),
      skipped: z.number().int().nonnegative(),
      ids: z.array(id),
      batchId: id,
    })
      .passthrough()
      .parse(backupJson(row.result));
}

function validateBackup(value: unknown) {
  const parsed = z
    .object({
      format: z.literal("recall-academy"),
      version: z.literal(1),
      exportedAt: z.string().datetime(),
      tables: z.record(
        z.string(),
        z
          .array(
            z.record(
              z.string(),
              z.union([z.string().max(500000), z.number().finite(), z.null()]),
            ),
          )
          .max(100000),
      ),
    })
    .strict()
    .parse(value);
  if (
    Object.keys(parsed.tables).length !== backupTables.length ||
    backupTables.some((t) => !parsed.tables[t])
  )
    fail(400, "Backup must contain every supported table");
  // Version 1 backups made before problem ordering used creation time, then ID.
  const problems = parsed.tables.problems;
  if (
    problems.length &&
    problems.every((row) => !Object.hasOwn(row, "position"))
  ) {
    const nextPosition = new Map<string, number>();
    const oldOrder = [...problems].sort(
      (a, b) =>
        String(a.created_at).localeCompare(String(b.created_at)) ||
        String(a.id).localeCompare(String(b.id)),
    );
    for (const row of oldOrder) {
      const courseId = String(row.course_id);
      const position = nextPosition.get(courseId) ?? 0;
      row.position = position;
      nextPosition.set(courseId, position + 1);
    }
  }
  for (const row of parsed.tables.session_items)
    if (!Object.hasOwn(row, "skipped_at")) row.skipped_at = null;
  let rowCount = 0;
  for (const table of backupTables) {
    for (const row of parsed.tables[table]) {
      rowCount++;
      validateRowJson(table, row);
      const columns = tableColumns[table];
      if (
        Object.keys(row).length !== columns.length ||
        Object.keys(row).some((k) => !columns.includes(k))
      )
        fail(400, `Invalid ${table} columns`);
      for (const column of columns) {
        const v = row[column];
        const nullable =
          nullableColumns.has(column) &&
          !(column === "card_id" && ["reviews", "schedules"].includes(table)) &&
          !(column === "problem_id" && table === "problem_attempts") &&
          !(column === "rating" && table === "reviews") &&
          !(
            column === "grade" &&
            ["reviews", "problem_attempts"].includes(table)
          );
        if (v === null) {
          if (!nullable) fail(400, `Missing ${table}.${column}`);
        } else if (
          typeof v !== (numericColumns.has(column) ? "number" : "string")
        )
          fail(400, `Invalid ${table}.${column}`);
      }
      if (["cards", "problems"].includes(table)) {
        questionSchema.parse(backupJson(row.content));
        skills.parse(backupJson(row.skills));
      }
      if (table === "user_settings")
        settingsSchema.parse(backupJson(row.settings));
      if (table === "schedules") {
        const state = backupJson(row.fsrs);
        if (
          !Number.isFinite(state.stability) ||
          !Number.isFinite(state.difficulty) ||
          !Number.isFinite(state.reps) ||
          !Number.isFinite(Date.parse(state.dueAt))
        )
          fail(400, "Invalid FSRS state");
      }
      if (table === "courses") {
        z.object(courseUpdate).parse({
          name: row.name,
          subject: row.subject,
          retention: row.retention,
          relaxedRetention: row.relaxed_retention,
          maxInterval: row.max_interval,
          archiveMode: row.archive_mode,
        });
      }
    }
  }
  if (rowCount > 150000) fail(400, "Backup exceeds the supported restore size");
  for (const table of backupTables) {
    const keys = parsed.tables[table].map((r) =>
      String(r.id ?? r.card_id ?? r.user_id),
    );
    if (new Set(keys).size !== keys.length)
      fail(400, `Duplicate ${table} identifiers`);
  }
  const sets = Object.fromEntries(
    backupTables.map((t) => [
      t,
      new Set(
        parsed.tables[t].map((r) => String(r.id ?? r.card_id ?? r.user_id)),
      ),
    ]),
  );
  const requireRef = (
    table: string,
    row: any,
    column: string,
    target: string,
    optional = false,
  ) => {
    if (row[column] === null && optional) return;
    if (!sets[target].has(String(row[column])))
      fail(400, `Broken ${table}.${column} reference`);
  };
  for (const table of ["units", "cards", "problems", "sessions"])
    for (const row of parsed.tables[table])
      requireRef(table, row, "course_id", "courses");
  for (const table of ["cards", "problems"])
    for (const row of parsed.tables[table]) {
      requireRef(table, row, "unit_id", "units");
      if (
        parsed.tables.units.find((u) => u.id === row.unit_id)?.course_id !==
        row.course_id
      )
        fail(400, "Content unit must belong to its course");
    }
  for (const row of parsed.tables.courses)
    if (row.midterm_unit_id) {
      requireRef("courses", row, "midterm_unit_id", "units");
      if (
        parsed.tables.units.find((u) => u.id === row.midterm_unit_id)
          ?.course_id !== row.id
      )
        fail(400, "Midterm unit belongs to another course");
    }
  for (const row of parsed.tables.schedules)
    requireRef("schedules", row, "card_id", "cards");
  for (const row of parsed.tables.session_items) {
    requireRef("session_items", row, "session_id", "sessions");
    requireRef("session_items", row, "card_id", "cards", true);
    requireRef("session_items", row, "problem_id", "problems", true);
    requireRef("session_items", row, "unit_id", "units");
    const session = parsed.tables.sessions.find((s) => s.id === row.session_id),
      unit = parsed.tables.units.find((u) => u.id === row.unit_id);
    if (session?.course_id !== unit?.course_id)
      fail(400, "Session item unit belongs to another course");
    for (const [field, target] of [
      ["card_id", "cards"],
      ["problem_id", "problems"],
    ])
      if (
        row[field] &&
        parsed.tables[target].find((c) => c.id === row[field])?.course_id !==
          session?.course_id
      )
        fail(400, "Session content belongs to another course");
  }
  for (const table of ["reviews", "problem_attempts"])
    for (const row of parsed.tables[table]) {
      requireRef(table, row, "session_item_id", "session_items");
      requireRef(
        table,
        row,
        table === "reviews" ? "card_id" : "problem_id",
        table === "reviews" ? "cards" : "problems",
      );
    }
  return parsed;
}
async function restoreBackup(db: Database, user: string, value: unknown) {
  const backup = validateBackup(value);
  const statements = [
    stmt(db, "DELETE FROM courses WHERE user_id=?", user),
    stmt(db, "DELETE FROM import_batches WHERE user_id=?", user),
    stmt(db, "DELETE FROM assets WHERE user_id=?", user),
    stmt(db, "DELETE FROM user_settings WHERE user_id=?", user),
  ];
  let restored = 0;
  for (const table of backupTables) {
    const cols = tableColumns[table],
      data = backup.tables[table];
    for (const row of data) {
      if (directOwner.has(table)) row.user_id = user;
      restored++;
    }
    for (let i = 0; i < data.length; i += 50) {
      const chunk = data.slice(i, i + 50);
      const expressions = cols
        .map((c) => `json_extract(value,'$.${c}')`)
        .join(",");
      statements.push(
        stmt(
          db,
          `INSERT INTO ${table}(${cols.join(",")}) SELECT ${expressions} FROM json_each(?)`,
          JSON.stringify(chunk),
        ),
      );
    }
  }
  await db.batch(statements);
  return {
    restored,
    tableCounts: Object.fromEntries(
      backupTables.map((t) => [t, backup.tables[t].length]),
    ),
  };
}

export async function execute(
  db: Database,
  user: string,
  action: string,
  input: unknown = {},
): Promise<any> {
  if (!user) fail(401, "Sign in is required");
  const schema = actionSchemas[action as ActionName];
  if (!schema) fail(404, "Unknown operation");
  const importing =
    action.endsWith(".import") || action === "library.previewImport";
  if (importing && input && typeof input === "object") {
    const { cards, problems } = input as Record<string, unknown>;
    const count =
      (Array.isArray(cards) ? cards.length : 0) +
      (Array.isArray(problems) ? problems.length : 0);
    if (count > MAX_IMPORT_ITEMS)
      fail(
        400,
        `Include at most ${MAX_IMPORT_ITEMS} items total across cards and problems`,
      );
  }
  let p: any;
  try {
    p = schema.parse(input ?? {});
  } catch (error) {
    if (error instanceof z.ZodError && importing)
      fail(400, importError(error.issues));
    throw error;
  }
  switch (action) {
    case "settings.get":
      return getSettings(db, user);
    case "settings.update": {
      const settings = settingsSchema.parse({
        ...(await getSettings(db, user)),
        ...p,
      });
      await schedulerFor(settings);
      await run(
        db,
        "INSERT INTO user_settings(user_id,settings,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET settings=excluded.settings,updated_at=excluded.updated_at",
        user,
        JSON.stringify(settings),
        now(),
      );
      return settings;
    }
    case "dashboard": {
      const [courses, analysis, recentSessions, [resumeSession]] =
        await Promise.all([
          coursesList(db, user, false),
          analytics(db, user, { days: 30 }),
          sessionsList(db, user, { limit: 8 }),
          sessionsList(db, user, { limit: 1 }, true),
        ]);
      const preferences = await getSettings(db, user);
      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: preferences.timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
      return {
        courses,
        stats: {
          ...analysis.summary,
          dailyGoal: preferences.dailyGoal,
          todayReviews:
            analysis.trend.find((day) => day.date === today)?.reviews ?? 0,
        },
        recentSessions,
        resumeSession: resumeSession ?? null,
        trend: analysis.trend,
        weakSkills: analysis.weakSkills,
      };
    }
    case "courses.list":
      return coursesList(db, user, p.archived);
    case "courses.get":
      return courseDetail(db, user, p.id);
    case "units.list":
      return (await courseDetail(db, user, p.courseId)).units;
    case "courses.create": {
      const courseId = uid(),
        time = now(),
        settings = await getSettings(db, user);
      const statements = [
        stmt(
          db,
          "INSERT INTO courses(id,user_id,name,subject,is_math,retention,max_interval,source_url,sample,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
          courseId,
          user,
          p.name,
          p.subject,
          Number(p.isMath),
          settings.retention,
          settings.maxInterval,
          p.sourceUrl ?? null,
          Number(p.sample),
          time,
        ),
      ];
      p.units.forEach((unitName: string, index: number) =>
        statements.push(
          stmt(
            db,
            "INSERT INTO units(id,course_id,name,position) VALUES(?,?,?,?)",
            uid(),
            courseId,
            unitName,
            index,
          ),
        ),
      );
      await db.batch(statements);
      return courseSummary(db, user, await ownedCourse(db, user, courseId));
    }
    case "courses.update": {
      await ownedCourse(db, user, p.id);
      if (p.midtermUnitId) {
        const unit = await ownedUnit(db, user, p.midtermUnitId);
        if (unit.course_id !== p.id)
          fail(400, "Midterm boundary must be a unit in this course");
      }
      const sets: string[] = [],
        args: any[] = [];
      for (const key of Object.keys(courseUpdate)) {
        if (p[key] !== undefined) {
          sets.push(`${key.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase())}=?`);
          args.push(typeof p[key] === "boolean" ? Number(p[key]) : p[key]);
        }
      }
      if (sets.length)
        await run(
          db,
          `UPDATE courses SET ${sets.join(",")} WHERE id=? AND user_id=?`,
          ...args,
          p.id,
          user,
        );
      return courseSummary(db, user, await ownedCourse(db, user, p.id));
    }
    case "units.create": {
      await ownedCourse(db, user, p.courseId);
      const unitId = uid();
      await run(
        db,
        "INSERT INTO units(id,course_id,name,position) VALUES(?,?,?,(SELECT COALESCE(MAX(position),-1)+1 FROM units WHERE course_id=?))",
        unitId,
        p.courseId,
        p.name,
        p.courseId,
      );
      return { ...camel(await ownedUnit(db, user, unitId)), ...zeroCounts() };
    }
    case "units.update": {
      await ownedUnit(db, user, p.id);
      await run(db, "UPDATE units SET name=? WHERE id=?", p.name, p.id);
      return camel(await ownedUnit(db, user, p.id));
    }
    case "units.reorder": {
      await ownedCourse(db, user, p.courseId);
      const existing = await rows<any>(
        db,
        "SELECT id FROM units WHERE course_id=?",
        p.courseId,
      );
      if (
        existing.length !== p.unitIds.length ||
        new Set(p.unitIds).size !== p.unitIds.length ||
        existing.some((u) => !p.unitIds.includes(u.id))
      )
        fail(400, "Supply every unit exactly once");
      await db.batch(
        p.unitIds.map((unitId: string, index: number) =>
          stmt(
            db,
            "UPDATE units SET position=? WHERE id=? AND course_id=?",
            index,
            unitId,
            p.courseId,
          ),
        ),
      );
      return (await courseDetail(db, user, p.courseId)).units;
    }
    case "cards.list":
      return contentList(db, user, p, "cards");
    case "problems.list":
      return contentList(db, user, p, "problems");
    case "cards.get":
      return getCard(db, user, p.id);
    case "problems.get":
      return problemJson(await ownedContent(db, user, p.id, "problems"));
    case "cards.import":
    case "problems.import":
    case "library.import":
    case "library.previewImport":
      return importLibrary(db, user, p, action === "library.previewImport");
    case "cards.update":
      return updateContent(db, user, p, "cards");
    case "problems.update":
      return updateContent(db, user, p, "problems");
    case "cards.introduce":
      return introduce(db, user, p);
    case "cards.status": {
      const ids = [...new Set(p.ids)] as string[];
      const found = await rows<any>(
        db,
        "SELECT q.id,s.card_id FROM cards q JOIN courses c ON c.id=q.course_id LEFT JOIN schedules s ON s.card_id=q.id WHERE c.user_id=? AND q.id IN (SELECT value FROM json_each(?))",
        user,
        JSON.stringify(ids),
      );
      if (found.length !== ids.length)
        fail(404, "One or more cards were not found");
      if (found.some((c) => !c.card_id))
        fail(400, "Introduce cards before activating or suspending them");
      const suspended = Number(p.status === "suspended");
      await run(
        db,
        `UPDATE schedules SET suspended=?,version=version+1
         WHERE suspended<>? AND card_id IN (SELECT value FROM json_each(?))`,
        suspended,
        suspended,
        JSON.stringify(ids),
      );
      return { updated: ids.length, status: p.status };
    }
    case "sessions.create":
      return createSession(db, user, p);
    case "sessions.get":
      return sessionView(db, user, p.id);
    case "sessions.phase":
      return phaseSession(db, user, p);
    case "sessions.answer":
      return answerSession(db, user, p);
    case "sessions.rate":
      return rateSession(db, user, p);
    case "sessions.list":
      return sessionsList(db, user, p);
    case "analytics":
      return analytics(db, user, p);
    case "history.reviews": {
      const args: any[] = [user];
      let f = "r.user_id=?";
      if (p.courseId) {
        await ownedCourse(db, user, p.courseId);
        f += " AND q.course_id=?";
        args.push(p.courseId);
      }
      if (p.unitId) {
        await ownedUnit(db, user, p.unitId);
        f += " AND q.unit_id=?";
        args.push(p.unitId);
      }
      if (p.cardId) {
        await ownedContent(db, user, p.cardId);
        f += " AND r.card_id=?";
        args.push(p.cardId);
      }
      const total = Number(
        (
          await one<any>(
            db,
            `SELECT COUNT(*) AS n FROM reviews r JOIN cards q ON q.id=r.card_id WHERE ${f}`,
            ...args,
          )
        )?.n,
      );
      const data = await rows<any>(
        db,
        `SELECT r.*,i.snapshot,i.prepared FROM reviews r JOIN cards q ON q.id=r.card_id JOIN session_items i ON i.id=r.session_item_id WHERE ${f} ORDER BY r.created_at DESC LIMIT ? OFFSET ?`,
        ...args,
        p.limit,
        p.offset,
      );
      return {
        items: data.map((r) => ({
          ...camel(r),
          before: json(r.before),
          after: json(r.after),
          log: json(r.log),
          grade: json(r.grade),
          snapshot: json(r.snapshot),
          prepared: undefined,
          question: json<PreparedQuestion>(r.prepared).presentation,
        })),
        total,
        nextOffset:
          p.offset + data.length < total ? p.offset + data.length : null,
      };
    }
    case "backup.export":
      return exportBackup(db, user);
    case "backup.restore":
      return restoreBackup(db, user, p.backup);
    case "sample.remove": {
      const result = await run(
        db,
        "DELETE FROM courses WHERE user_id=? AND sample=1",
        user,
      );
      return { removed: result.meta?.changes ?? 0 };
    }
    default:
      throw new ServiceError(404, "Unknown operation");
  }
}
