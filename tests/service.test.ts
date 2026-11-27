import { beforeEach, afterEach, describe, it, expect } from "vitest";
import { readFileSync, readdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDatabase } from "../lib/sqlite";
import { execute } from "../lib/service";
import { one, rows, run, json } from "../lib/db";
let db: ReturnType<typeof createDatabase>;
const user = "owner";
const choice = {
  type: "multiple_choice",
  prompt: "What is 2 + 2?",
  options: [
    { id: "a", text: "4" },
    { id: "b", text: "3" },
    { id: "c", text: "5" },
  ],
  correctOptionIds: ["a"],
  explanation: "Add two pairs.",
};
const migrate = (database: typeof db) =>
  readdirSync("drizzle")
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .forEach((f) => database.exec(readFileSync("drizzle/" + f, "utf8")));
const call = (action: string, input: any = {}) =>
  execute(db, user, action, input);
async function course(n = 100) {
  const c = await call("courses.create", {
    name: "Synthetic Algebra",
    subject: "Math",
    isMath: true,
    units: ["First", "Second", "Third"],
  });
  const detail = await call("courses.get", { id: c.id });
  if (n)
    await call("cards.import", {
      courseId: c.id,
      unitId: detail.units[0].id,
      batchId: "batch-" + c.id,
      cards: Array.from({ length: n }, (_, i) => ({
        externalId: "q" + i,
        content: choice,
        skills: ["addition"],
      })),
    });
  return { ...detail, courseId: c.id, unitId: detail.units[0].id };
}
async function answer(view: any, correct = true) {
  const stored = await one<any>(
      db,
      "SELECT prepared FROM session_items WHERE id=?",
      view.current.id,
    ),
    prepared = json<any>(stored.prepared),
    answers: any = {};
  for (const component of prepared.answerKey.components) {
    answers[component.id] = correct
      ? Array.isArray(component.correct)
        ? component.kind === "multiple" || component.kind === "sequence"
          ? component.correct
          : component.correct[0]
        : component.correct
      : "wrong";
  }
  if (!correct && prepared.presentation.components[0].options)
    answers[prepared.presentation.components[0].id] =
      prepared.presentation.components[0].options.find(
        (o: any) => !prepared.answerKey.components[0].correct.includes(o.id),
      ).id;
  return call("sessions.answer", {
    id: view.id,
    itemId: view.current.id,
    response: { answers },
    responseMs: 2500,
  });
}
beforeEach(() => {
  db = createDatabase();
  migrate(db);
});
afterEach(() => db.close());
describe("persistent course and SRS workflows", () => {
  it("creates/reorders units, configures midterm, imports and gradually introduces without fake reviews", async () => {
    const c = await course();
    expect(
      (await call("courses.get", { id: c.courseId })).course,
    ).toMatchObject({
      totalCards: 100,
      unintroducedCards: 100,
      activeCards: 0,
    });
    expect(await rows(db, "SELECT * FROM reviews")).toHaveLength(0);
    await call("units.reorder", {
      courseId: c.courseId,
      unitIds: c.units.map((u: any) => u.id).reverse(),
    });
    await call("courses.update", { id: c.courseId, midtermUnitId: c.unitId });
    expect((await call("courses.get", { id: c.courseId })).units[2].id).toBe(
      c.unitId,
    );
    await call("cards.introduce", { unitId: c.unitId, count: 20 });
    const first = await rows<any>(db, "SELECT * FROM schedules");
    expect(first).toHaveLength(20);
    expect(first.every((s) => json<any>(s.fsrs).reps === 0)).toBe(true);
    await call("cards.introduce", { unitId: c.unitId, count: 15 });
    expect(
      (await call("courses.get", { id: c.courseId })).course,
    ).toMatchObject({ activeCards: 35, unintroducedCards: 65 });
    expect(
      (
        await one<any>(
          db,
          "SELECT fsrs FROM schedules WHERE card_id=?",
          first[0].card_id,
        )
      )?.fsrs,
    ).toBe(first[0].fsrs);
  });
  it("persists independent standard FSRS7 states, relearning, atomic and idempotent review events", async () => {
    const c = await course(2);
    await call("cards.introduce", { unitId: c.unitId, count: 2 });
    let view = await call("sessions.create", {
      courseId: c.courseId,
      mode: "review",
      count: 1,
    });
    const firstId = view.current.cardId,
      reviewItem = view.current.id;
    expect(JSON.stringify(view)).not.toContain("correctOptionIds");
    expect(JSON.stringify(view)).not.toContain("Add two pairs");
    view = await answer(view);
    view = await call("sessions.rate", {
      id: view.id,
      itemId: reviewItem,
      rating: 4,
    });
    expect(view.status).toBe("completed");
    const first = await call("cards.get", { id: firstId });
    expect(first.schedule.reps).toBe(1);
    expect(first.schedule.state).toBe(2);
    await call("sessions.rate", { id: view.id, itemId: reviewItem, rating: 1 });
    expect(await rows(db, "SELECT * FROM reviews")).toHaveLength(1);
    const other = await one<any>(
      db,
      "SELECT fsrs FROM schedules WHERE card_id!=?",
      firstId,
    );
    expect(json<any>(other.fsrs).reps).toBe(0);
    await call("cards.status", { ids: [firstId], status: "suspended" });
    expect((await call("cards.get", { id: firstId })).schedule).toEqual(
      first.schedule,
    );
    await call("cards.status", { ids: [firstId], status: "active" });
    await run(
      db,
      "UPDATE schedules SET due=? WHERE card_id=?",
      "2020-01-01T00:00:00.000Z",
      firstId,
    );
    let second = await call("sessions.create", {
      courseId: c.courseId,
      mode: "review",
      count: 1,
    });
    expect(second.current.cardId).toBe(firstId);
    second = await answer(second, false);
    await call("sessions.rate", {
      id: second.id,
      itemId: second.current.id,
      rating: 1,
    });
    const reset = await call("cards.get", { id: firstId });
    expect(reset.schedule.state).toBe(3);
    expect(reset.schedule.reps).toBe(2);
    expect(reset.schedule.lapses).toBe(1);
  });
  it("rejects stale concurrent sessions without writing a partial schedule or review", async () => {
    const c = await course(1);
    await call("cards.introduce", { unitId: c.unitId, count: 1 });
    let a = await call("sessions.create", {
        courseId: c.courseId,
        mode: "review",
      }),
      b = await call("sessions.create", {
        courseId: c.courseId,
        mode: "review",
      });
    a = await answer(a);
    b = await answer(b);
    await call("sessions.rate", { id: a.id, itemId: a.current.id, rating: 3 });
    await expect(
      call("sessions.rate", { id: b.id, itemId: b.current.id, rating: 1 }),
    ).rejects.toThrow("another session");
    expect(await rows(db, "SELECT * FROM reviews")).toHaveLength(1);
  });
  it("keeps imports idempotent and validates owner boundaries", async () => {
    const c = await course(0);
    const payload = {
      courseId: c.courseId,
      unitId: c.unitId,
      batchId: "stable",
      cards: [{ externalId: "external", content: choice }],
    };
    const a = await call("cards.import", payload),
      b = await call("cards.import", payload);
    expect(b.ids).toEqual(a.ids);
    expect(b.replayed).toBe(true);
    await expect(
      call("cards.import", { ...payload, cards: [{ content: choice }] }),
    ).rejects.toThrow("different content");
    expect(
      (await call("cards.import", { ...payload, batchId: "other" })).skipped,
    ).toBe(1);
    await expect(
      execute(db, "stranger", "courses.get", { id: c.courseId }),
    ).rejects.toThrow("not found");
    await expect(
      execute(db, "stranger", "cards.get", { id: a.ids[0] }),
    ).rejects.toThrow("not found");
    await expect(execute(db, "", "dashboard", {})).rejects.toThrow("Sign in");
  });
  it("supports 1 and 300 question quizzes, midterm scopes, retries and no schedule mutation", async () => {
    const c = await course(300);
    const initial = await rows(db, "SELECT * FROM schedules");
    for (const count of [0, 301])
      await expect(
        call("sessions.create", { courseId: c.courseId, mode: "quiz", count }),
      ).rejects.toThrow();
    await call("courses.update", { id: c.courseId, midtermUnitId: c.unitId });
    const big = await call("sessions.create", {
      courseId: c.courseId,
      mode: "quiz",
      count: 300,
      includeUnintroduced: true,
      scope: "midterm",
      feedback: "end",
    });
    expect(big.total).toBe(300);
    const after = await answer(big, false);
    expect(after.lastAnswer).toBeUndefined();
    expect(after.current.grade).toBeUndefined();
    let single = await call("sessions.create", {
      courseId: c.courseId,
      mode: "quiz",
      count: 1,
      includeUnintroduced: true,
    });
    single = await answer(single, false);
    expect(single.results.accuracy).toBe(0);
    const retry = await call("sessions.create", {
      courseId: c.courseId,
      mode: "quiz",
      count: 1,
      includeUnintroduced: true,
      retrySessionId: single.id,
    });
    expect(retry.current.cardId).toBe(single.results.items[0].cardId);
    expect(await rows(db, "SELECT * FROM schedules")).toEqual(initial);
  });
  it("tracks problem practice and manual grading without schedules", async () => {
    const c = await course(0);
    await call("problems.import", {
      courseId: c.courseId,
      unitId: c.unitId,
      batchId: "math",
      problems: [
        {
          content: {
            type: "typed",
            prompt: "One half as a decimal?",
            answer: "1/2",
            grading: "numeric",
          },
          skills: ["fractions"],
          hint: "Divide 1 by 2",
          solution: "0.5",
        },
      ],
    });
    let view = await call("sessions.create", {
      courseId: c.courseId,
      mode: "problem",
      count: 1,
    });
    view = await call("sessions.answer", {
      id: view.id,
      itemId: view.current.id,
      response: { answers: { c1: "0.5" } },
      responseMs: 5000,
    });
    expect(view.results.correct).toBe(1);
    expect(await rows(db, "SELECT * FROM problem_attempts")).toHaveLength(1);
    expect(await rows(db, "SELECT * FROM schedules")).toHaveLength(0);
    const stats = await call("analytics", { courseId: c.courseId });
    expect(stats.summary.practiceAccuracy).toBe(1);
    expect(stats.weakSkills[0].skill).toBe("fractions");
    expect(stats.summary.reviewSuccessRate).toBeNull();
  });
  it("archives without rewriting due dates, separates workload and allows reactivation", async () => {
    const c = await course(1);
    await call("cards.introduce", { unitId: c.unitId, count: 1 });
    const before = await rows(db, "SELECT * FROM schedules");
    await call("courses.update", { id: c.courseId, archived: true });
    expect((await call("dashboard")).courses).toHaveLength(0);
    expect((await call("dashboard")).stats.dueCards).toBe(0);
    expect(
      (await call("courses.list", { archived: true }))[0].archiveMode,
    ).toBe("relaxed");
    expect(await rows(db, "SELECT * FROM schedules")).toEqual(before);
    await call("courses.update", { id: c.courseId, archiveMode: "paused" });
    await expect(
      call("sessions.create", { courseId: c.courseId, mode: "review" }),
    ).rejects.toThrow("paused");
    await call("courses.update", { id: c.courseId, archived: false });
    expect((await call("dashboard")).stats.dueCards).toBe(1);
  });
  it("backs up and atomically restores full relational state and rejects foreign references", async () => {
    const c = await course(1);
    await call("cards.introduce", { unitId: c.unitId, count: 1 });
    let view = await call("sessions.create", {
      courseId: c.courseId,
      mode: "review",
    });
    view = await answer(view);
    await call("sessions.rate", { id: view.id, itemId: view.current.id });
    const backup = await call("backup.export");
    await call("courses.create", { name: "Later", units: ["Extra"] });
    await call("backup.restore", { backup, confirm: true });
    expect(await call("backup.export")).toMatchObject({
      tables: backup.tables,
    });
    const invalid = structuredClone(backup);
    invalid.tables.cards[0].unit_id = "foreign-unit";
    await expect(
      call("backup.restore", { backup: invalid, confirm: true }),
    ).rejects.toThrow("reference");
    expect((await call("courses.list")).length).toBe(1);
    await expect(
      call("backup.restore", { backup, confirm: false }),
    ).rejects.toThrow();
  });
  it("preserves history across edits and explicit schedule reset", async () => {
    const c = await course(1);
    await call("cards.introduce", { unitId: c.unitId, count: 1 });
    let view = await call("sessions.create", {
      courseId: c.courseId,
      mode: "review",
    });
    const cardId = view.current.cardId;
    view = await answer(view);
    await call("sessions.rate", { id: view.id, itemId: view.current.id });
    const before = await call("cards.get", { id: cardId });
    await call("cards.update", {
      id: cardId,
      content: { ...choice, prompt: "Edited wording" },
    });
    expect((await call("cards.get", { id: cardId })).schedule).toEqual(
      before.schedule,
    );
    await expect(
      call("cards.update", { id: cardId, resetSchedule: true }),
    ).rejects.toThrow("Confirm");
    await call("cards.update", {
      id: cardId,
      resetSchedule: true,
      confirmReset: true,
    });
    expect((await call("cards.get", { id: cardId })).schedule.reps).toBe(0);
    const history = await call("history.reviews", { cardId });
    expect(history.total).toBe(1);
    expect(history.items[0].snapshot.content.prompt).toBe(choice.prompt);
  });
  it("persists across database restarts", async () => {
    const directory = mkdtempSync(join(tmpdir(), "recall-"));
    try {
      const path = join(directory, "data.db"),
        local = createDatabase(path);
      migrate(local);
      const c = await execute(local, user, "courses.create", {
        name: "Persisted",
      });
      local.close();
      const reopened = createDatabase(path);
      expect(
        (await execute(reopened, user, "courses.get", { id: c.id })).course
          .name,
      ).toBe("Persisted");
      reopened.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
describe("phase persistence and failure recovery", () => {
  it("freezes each cloze phase, reveals no future answer and records one composite review", async () => {
    const c = await course(0);
    const content = {
      type: "cloze",
      prompt: "Complete both blanks.",
      explanation: "Whole-card solution kept private until complete",
      components: [
        {
          id: "first",
          prompt: "2 + 2 = __",
          options: [
            { id: "a", text: "4" },
            { id: "b", text: "5" },
          ],
          correctOptionIds: ["a"],
          explanation: "First phase only",
        },
        {
          id: "second",
          prompt: "3 + 3 = __",
          options: [
            { id: "a", text: "6" },
            { id: "b", text: "7" },
          ],
          correctOptionIds: ["a"],
          explanation: "Future secret",
        },
      ],
    };
    await call("cards.import", {
      courseId: c.courseId,
      unitId: c.unitId,
      batchId: "cloze",
      cards: [{ content }],
    });
    await call("cards.introduce", { unitId: c.unitId, count: 1 });
    let view = await call("sessions.create", {
      courseId: c.courseId,
      mode: "review",
    });
    const itemId = view.current.id;
    const stored = json<any>(
      (
        await one<any>(
          db,
          "SELECT prepared FROM session_items WHERE id=?",
          itemId,
        )
      )?.prepared,
    );
    await expect(
      call("sessions.phase", {
        id: view.id,
        itemId,
        componentId: "c2",
        answer: stored.answerKey.components[1].correct[0],
      }),
    ).rejects.toThrow("in order");
    const wrong = stored.presentation.components[0].options.find(
      (o: any) => o.id !== stored.answerKey.components[0].correct[0],
    ).id;
    view = await call("sessions.phase", {
      id: view.id,
      itemId,
      componentId: "c1",
      answer: wrong,
      responseMs: 1000,
    });
    expect(view.current.phaseIndex).toBe(1);
    expect(view.lastPhase.grade.correct).toBe(false);
    expect(JSON.stringify(view)).not.toContain("Future secret");
    expect(JSON.stringify(view)).not.toContain("Whole-card solution");
    expect(await rows(db, "SELECT * FROM reviews")).toHaveLength(0);
    const repeated = await call("sessions.phase", {
      id: view.id,
      itemId,
      componentId: "c1",
      answer: stored.answerKey.components[0].correct[0],
    });
    expect(repeated.current.phaseAnswers.c1).toBe(wrong);
    view = await call("sessions.phase", {
      id: view.id,
      itemId,
      componentId: "c2",
      answer: stored.answerKey.components[1].correct[0],
      responseMs: 1000,
    });
    expect(view.current.grade.correct).toBe(false);
    expect(view.current.grade.components).toHaveLength(2);
    await call("sessions.rate", { id: view.id, itemId });
    expect(await rows(db, "SELECT * FROM reviews")).toHaveLength(1);
  });
  it("suppresses end-only quiz phase feedback and grades manual answers after explicit self-check", async () => {
    const c = await course(0);
    await call("problems.import", {
      courseId: c.courseId,
      unitId: c.unitId,
      batchId: "manual",
      problems: [
        {
          content: {
            type: "typed",
            prompt: "Explain the proof",
            answer: "A proof by induction",
            grading: "manual",
          },
          solution: "Use induction.",
        },
      ],
    });
    let view = await call("sessions.create", {
      courseId: c.courseId,
      mode: "problem",
      count: 1,
    });
    const itemId = view.current.id;
    view = await call("sessions.answer", {
      id: view.id,
      itemId,
      response: { answers: { c1: "My proof" } },
      responseMs: 2000,
    });
    expect(view.current.grade.requiresManual).toBe(true);
    expect(await rows(db, "SELECT * FROM problem_attempts")).toHaveLength(0);
    view = await call("sessions.answer", {
      id: view.id,
      itemId,
      response: { answers: {}, manualCorrect: true },
    });
    expect(view.results.correct).toBe(1);
    expect(view.results.items[0].response.answers.c1).toBe("My proof");
    expect(await rows(db, "SELECT * FROM problem_attempts")).toHaveLength(1);
  });
  it("rolls back both event and schedule when a transaction fails", async () => {
    const c = await course(1);
    await call("cards.introduce", { unitId: c.unitId, count: 1 });
    let view = await call("sessions.create", {
      courseId: c.courseId,
      mode: "review",
    });
    view = await answer(view);
    const before = await rows(db, "SELECT * FROM schedules");
    const broken = {
      ...db,
      batch: async (queries: any[]) =>
        db.batch([
          ...queries,
          db.prepare("INSERT INTO table_that_does_not_exist VALUES(1)"),
        ]),
    };
    await expect(
      execute(broken as typeof db, user, "sessions.rate", {
        id: view.id,
        itemId: view.current.id,
      }),
    ).rejects.toThrow();
    expect(await rows(db, "SELECT * FROM reviews")).toHaveLength(0);
    expect(await rows(db, "SELECT * FROM schedules")).toEqual(before);
    await call("sessions.rate", { id: view.id, itemId: view.current.id });
    expect(await rows(db, "SELECT * FROM reviews")).toHaveLength(1);
  });
});

it("updates only supplied settings fields and validates learning steps", async () => {
  await call("settings.update", {
    retention: 0.95,
    timezone: "America/Mexico_City",
  });
  await call("settings.update", { theme: "light" });
  expect(await call("settings.get")).toMatchObject({
    retention: 0.95,
    timezone: "America/Mexico_City",
    theme: "light",
  });
  await expect(
    call("settings.update", { learningSteps: ["0m"] }),
  ).rejects.toThrow();
});
it("rejects malformed history JSON before changing existing data", async () => {
  const c = await course(1);
  await call("cards.introduce", { unitId: c.unitId, count: 1 });
  let view = await call("sessions.create", {
    courseId: c.courseId,
    mode: "review",
  });
  view = await answer(view);
  await call("sessions.rate", { id: view.id, itemId: view.current.id });
  const backup = await call("backup.export");
  for (const [table, column, bad] of [
    ["session_items", "prepared", "{}"],
    ["session_items", "grade", '{"correct":true}'],
    ["session_items", "snapshot", "not json"],
    ["schedules", "fsrs", "{}"],
  ]) {
    const invalid = structuredClone(backup);
    invalid.tables[table][0][column] = bad;
    await expect(
      call("backup.restore", { backup: invalid, confirm: true }),
    ).rejects.toThrow();
    expect((await call("courses.list")).length).toBe(1);
  }
  expect((await call("history.reviews")).total).toBe(1);
});
