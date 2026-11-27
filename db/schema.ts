import {
  sqliteTable,
  text,
  integer,
  real,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";

export const userSettings = sqliteTable("user_settings", {
  userId: text("user_id").primaryKey(),
  settings: text("settings").notNull(),
  updatedAt: text("updated_at").notNull(),
});
export const courses = sqliteTable(
  "courses",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    subject: text("subject").notNull(),
    isMath: integer("is_math").notNull().default(0),
    archived: integer("archived").notNull().default(0),
    archiveMode: text("archive_mode").notNull().default("relaxed"),
    retention: real("retention").notNull().default(0.9),
    relaxedRetention: real("relaxed_retention").notNull().default(0.8),
    maxInterval: integer("max_interval").notNull().default(36500),
    midtermUnitId: text("midterm_unit_id"),
    sourceUrl: text("source_url"),
    sample: integer("sample").notNull().default(0),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("courses_user").on(t.userId)],
);
export const units = sqliteTable("units", {
  id: text("id").primaryKey(),
  courseId: text("course_id")
    .notNull()
    .references(() => courses.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  position: integer("position").notNull(),
});
export const cards = sqliteTable(
  "cards",
  {
    id: text("id").primaryKey(),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    unitId: text("unit_id")
      .notNull()
      .references(() => units.id),
    externalId: text("external_id"),
    content: text("content").notNull(),
    skills: text("skills").notNull().default("[]"),
    position: integer("position").notNull(),
    revision: integer("revision").notNull().default(1),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("cards_course_external").on(t.courseId, t.externalId),
    index("cards_course_position").on(t.courseId, t.position),
    index("cards_unit").on(t.unitId),
  ],
);
export const schedules = sqliteTable("schedules", {
  cardId: text("card_id")
    .primaryKey()
    .references(() => cards.id, { onDelete: "cascade" }),
  introducedAt: text("introduced_at").notNull(),
  suspended: integer("suspended").notNull().default(0),
  due: text("due").notNull(),
  fsrs: text("fsrs").notNull(),
  version: integer("version").notNull().default(0),
});
export const problems = sqliteTable(
  "problems",
  {
    id: text("id").primaryKey(),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    unitId: text("unit_id")
      .notNull()
      .references(() => units.id),
    externalId: text("external_id"),
    content: text("content").notNull(),
    skills: text("skills").notNull().default("[]"),
    difficulty: integer("difficulty").notNull().default(2),
    hint: text("hint"),
    solution: text("solution"),
    template: text("template"),
    position: integer("position").notNull().default(0),
    revision: integer("revision").notNull().default(1),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("problems_course_external").on(t.courseId, t.externalId),
    index("problems_course_position").on(t.courseId, t.position),
  ],
);
export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    mode: text("mode").notNull(),
    options: text("options").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: text("created_at").notNull(),
    completedAt: text("completed_at"),
  },
  (t) => [index("sessions_user").on(t.userId)],
);
export const sessionItems = sqliteTable(
  "session_items",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    cardId: text("card_id").references(() => cards.id, {
      onDelete: "set null",
    }),
    problemId: text("problem_id").references(() => problems.id, {
      onDelete: "set null",
    }),
    unitId: text("unit_id").notNull(),
    skills: text("skills").notNull(),
    snapshot: text("snapshot").notNull(),
    prepared: text("prepared").notNull(),
    scheduleVersion: integer("schedule_version"),
    phaseProgress: text("phase_progress"),
    response: text("response"),
    grade: text("grade"),
    responseMs: integer("response_ms").notNull().default(0),
    answeredAt: text("answered_at"),
    rating: integer("rating"),
    reviewedAt: text("reviewed_at"),
  },
  (t) => [uniqueIndex("session_item_position").on(t.sessionId, t.position)],
);
export const reviews = sqliteTable(
  "reviews",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    cardId: text("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    sessionItemId: text("session_item_id")
      .notNull()
      .references(() => sessionItems.id, { onDelete: "cascade" }),
    rating: integer("rating").notNull(),
    correct: integer("correct").notNull(),
    before: text("before").notNull(),
    after: text("after").notNull(),
    log: text("log").notNull(),
    grade: text("grade").notNull(),
    responseMs: integer("response_ms").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("review_once").on(t.sessionItemId),
    index("reviews_user_date").on(t.userId, t.createdAt),
  ],
);
export const problemAttempts = sqliteTable(
  "problem_attempts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    problemId: text("problem_id")
      .notNull()
      .references(() => problems.id, { onDelete: "cascade" }),
    sessionItemId: text("session_item_id")
      .notNull()
      .references(() => sessionItems.id, { onDelete: "cascade" }),
    correct: integer("correct").notNull(),
    grade: text("grade").notNull(),
    responseMs: integer("response_ms").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [uniqueIndex("problem_attempt_once").on(t.sessionItemId)],
);
export const importBatches = sqliteTable(
  "import_batches",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    batchKey: text("batch_key").notNull(),
    hash: text("hash").notNull(),
    result: text("result").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [uniqueIndex("import_once").on(t.userId, t.batchKey)],
);
export const assets = sqliteTable("assets", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  key: text("key").notNull(),
  contentType: text("content_type").notNull(),
  name: text("name").notNull(),
  bytes: integer("bytes").notNull(),
  createdAt: text("created_at").notNull(),
});
