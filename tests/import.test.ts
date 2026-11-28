import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { one, rows, run } from "../lib/db";
import { MAX_IMPORT_ITEM_BYTES } from "../lib/import-limits";
import { execute } from "../lib/service";
import { createDatabase } from "../lib/sqlite";
import { importExample } from "../src/import-example";
import { buildImportInput } from "../src/import-file";
import type { QuestionPresentation } from "../lib/types";

const owner = "synthetic-import-owner";
const question = {
  type: "multiple_choice",
  prompt: "Synthetic: which equals 2 + 2?",
  options: [
    { id: "a", text: "4" },
    { id: "b", text: "5" },
  ],
  correctOptionIds: ["a"],
};
const card = (externalId: string, unitName?: string) => ({
  externalId,
  unitName,
  content: question,
});
const files = readdirSync("drizzle")
  .filter((name) => name.endsWith(".sql"))
  .sort();
let db: ReturnType<typeof createDatabase>;

beforeEach(() => {
  db = createDatabase();
  for (const file of files) db.exec(readFileSync(`drizzle/${file}`, "utf8"));
});
afterEach(() => db.close());

const call = (action: string, input: unknown) =>
  execute(db, owner, action, input);
async function mathCourse(units = ["Foundations", "Expressions"]) {
  const c = await call("courses.create", {
    name: "Synthetic importer course",
    isMath: true,
    units,
  });
  return call("courses.get", { id: c.id });
}
async function counts() {
  return one(
    db,
    `SELECT (SELECT COUNT(*) FROM cards) AS cards,
    (SELECT COUNT(*) FROM problems) AS problems,
    (SELECT COUNT(*) FROM import_batches) AS batches,
    (SELECT COUNT(*) FROM schedules) AS schedules,
    (SELECT COUNT(*) FROM reviews) AS reviews`,
  );
}
const none = { cards: 0, problems: 0, batches: 0, schedules: 0, reviews: 0 };
const parse = (
  source: string,
  format: "json" | "csv" = "json",
  kind: "cards" | "problems" = "cards",
) =>
  buildImportInput(source, {
    format,
    kind,
    courseId: "course",
    defaultUnitId: "selected-unit",
  });

describe("file parsing", () => {
  it("keeps explicit JSON destinations and batch identity, including old API envelopes", () => {
    const batch = {
      batchId: "deck",
      courseId: "course",
      unitName: "Foundations",
      cards: [card("one")],
    };
    expect(parse("\uFEFF" + JSON.stringify({ version: 1, ...batch }))).toEqual(
      JSON.parse(JSON.stringify(batch)),
    );
    expect(
      parse(
        JSON.stringify({ action: "cards.import", input: batch }),
        "json",
        "problems",
      ),
    ).toEqual(JSON.parse(JSON.stringify(batch)));
    expect(
      parse(JSON.stringify([card("one")]), "json", "problems"),
    ).toMatchObject({
      unitId: "selected-unit",
      problems: [{ externalId: "one" }],
    });
    expect(() =>
      parse(JSON.stringify({ ...batch, courseId: "elsewhere" })),
    ).toThrow("does not match");
    expect(() => parse('{"version":2,"cards":[]}')).toThrow(
      "Unsupported import version",
    );
    expect(() => parse('{"version":1,"cards":[]}')).toThrow(
      "require a batchId",
    );
    expect(() => parse('{"version":1,"batchId":"x","questions":[]}')).toThrow(
      "Unknown JSON file field",
    );
    expect(() =>
      parse('{"cards":[{"unitId":"first","unit\\u0049d":"second"}]}'),
    ).toThrow("duplicate field");
    expect(() =>
      parse('{"cards":[{"content":{"prompt":"Quoted \\"card\\""}}],}'),
    ).toThrow("Invalid JSON");
  });

  it("imports UTF-8 spreadsheet CSV with CRLF, quoted text, commas, quotes, and line breaks", async () => {
    const { course, units } = await mathCourse();
    const text =
      "\uFEFFexternal_id,unit_name,prompt,option_a,option_b,answer,skills,difficulty,hint,solution\r\n" +
      '0007,Expressions,"Read ""x, y""\r\nthen solve",4,5,4,addition; numbers,3,"Hint, here",Solution\r\n' +
      "0008,Expressions,Next,3,2,3,,1,,\r\n";
    const input = buildImportInput(text, {
      format: "csv",
      kind: "problems",
      courseId: course.id,
      defaultUnitId: units[0].id,
    });
    expect(await call("library.import", input)).toMatchObject({ imported: 2 });
    const list = await call("problems.list", {
      courseId: course.id,
      unitId: units[1].id,
    });
    expect(list.items).toMatchObject([
      {
        externalId: "0007",
        content: { prompt: 'Read "x, y"\nthen solve' },
        skills: ["addition", "numbers"],
        difficulty: 3,
        hint: "Hint, here",
        solution: "Solution",
      },
      { externalId: "0008" },
    ]);
    expect(await call("library.import", input)).toMatchObject({
      replayed: true,
    });
  });

  it.each([
    ['prompt,option_a,option_b,answer\n"unclosed,1,2,1', "unclosed quote"],
    [
      'prompt,option_a,option_b,answer\n"closed"x,1,2,1',
      "after the closing quote",
    ],
    ['prompt,option_a,option_b,answer\nbad"quote,1,2,1', "unquoted field"],
    ["prompt,option_a,option_b,answer\na,1,2", "expected 4 fields, got 3"],
    [
      "prompt,option_a,option_b,answer\na,1,2,1,extra",
      "expected 4 fields, got 5",
    ],
    [
      "prompt,option_a,option_b,answer, Prompt\na,1,2,1,b",
      "column names must be unique",
    ],
    ["prompt,option_a,option_b,answer,units\na,1,2,1,b", "unknown column"],
    [
      "prompt,option_a,option_b,answer\na,1,2,3",
      "answer must match exactly one option",
    ],
    [
      "prompt,option_a,option_b,answer\na,1,1,1",
      "answer must match exactly one option",
    ],
    [
      "prompt,option_a,option_b,answer,unit_id,unit_name\na,1,2,1,id,name",
      "use either unit_id or unit_name",
    ],
  ])(
    "rejects malformed or ambiguous CSV before upload (%s)",
    (file, message) => {
      expect(() => parse(file, "csv")).toThrow(message);
    },
  );
});

describe("import routing, study, and durability", () => {
  it("checks and imports the downloadable mixed example, preserving units and order through study", async () => {
    const { course, units } = await mathCourse();
    const example = importExample({
      courseId: course.id,
      unitId: units[0].id,
      otherUnitId: units[1].id,
      batchId: "synthetic-all-formats",
      isMath: true,
    });
    const raw = {
      ...example,
      problems: [
        ...example.problems!,
        { ...card("practice-choice", "Foundations"), difficulty: 4 },
      ],
    };
    const input = buildImportInput(JSON.stringify(raw), {
      format: "json",
      kind: "cards",
      courseId: course.id,
      defaultUnitId: "",
    });
    const preview = await call("library.previewImport", input);
    expect(preview).toMatchObject({
      imported: 10,
      skipped: 0,
      units: [
        {
          unitId: units[0].id,
          cards: { imported: 4 },
          problems: { imported: 2 },
        },
        {
          unitId: units[1].id,
          cards: { imported: 3 },
          problems: { imported: 1 },
        },
      ],
    });
    expect(await counts()).toEqual(none);
    const saved = await call("library.import", input);
    expect(saved).toMatchObject({
      batchId: example.batchId,
      imported: 10,
      skipped: 0,
      units: preview.units,
    });
    expect(await counts()).toEqual({
      ...none,
      cards: 7,
      problems: 3,
      batches: 1,
    });
    const unitList = await call("cards.list", {
      courseId: course.id,
      unitId: units[0].id,
    });
    expect(unitList.items.map((item: any) => item.content.type)).toEqual([
      "multiple_choice",
      "true_false",
      "matching",
      "typed",
    ]);
    expect(
      unitList.items.every((item: any) => item.status === "unintroduced"),
    ).toBe(true);
    await call("cards.introduce", { unitId: units[0].id, count: 2 });
    const active = await call("cards.list", {
      courseId: course.id,
      status: "active",
    });
    expect(active.items.map((item: any) => item.id)).toEqual(
      unitList.items.slice(0, 2).map((item: any) => item.id),
    );

    const selection = { courseId: course.id, count: 20, selection: "ordered" };
    let quiz = await call("sessions.create", {
      ...selection,
      mode: "quiz",
      includeUnintroduced: true,
    });
    expect(quiz.total).toBe(7);
    const right: Record<string, (string | string[])[]> = {
      multiple_choice: ["2"],
      multiple_select: [["2", "4"]],
      true_false: ["True"],
      cloze: ["4", "6"],
      matching: ["One", "Two"],
      sequencing: [["1", "3", "5"]],
      typed: ["0.50"],
    };
    for (const { content } of example.cards) {
      const item = quiz.current;
      const presentation: QuestionPresentation = item.question;
      expect(presentation.type).toBe(content.type);
      expect(JSON.stringify(item)).not.toContain("correctOptionIds");
      const answers = Object.fromEntries(
        presentation.components.map((component, index) => {
          const choiceId = (value: string) =>
            component.options!.find(({ text }) => text === value)!.id;
          const answer = right[content.type][index];
          return [
            component.id,
            component.kind === "typed"
              ? answer
              : Array.isArray(answer)
                ? answer.map(choiceId)
                : choiceId(answer),
          ];
        }),
      );
      quiz = await call("sessions.answer", {
        id: quiz.id,
        itemId: item.id,
        response: { answers },
      });
      expect(quiz.lastAnswer.grade.correct).toBe(true);
    }
    expect(quiz.results.correct).toBe(7);
    let practice = await call("sessions.create", {
      ...selection,
      mode: "problem",
      scope: "unit",
      unitId: units[0].id,
    });
    expect(practice.total).toBe(2);
    expect(practice.current.hint).toBe("Use a common denominator.");
    practice = await call("sessions.answer", {
      id: practice.id,
      itemId: practice.current.id,
      response: { answers: { c1: "0.75" } },
    });
    expect(practice.lastAnswer).toMatchObject({
      grade: { correct: true },
      solution: "$2/4 + 1/4 = 3/4$.",
    });
    expect(practice.current.question.prompt).toBe(question.prompt);
    const expression = await call("sessions.create", {
      ...selection,
      mode: "problem",
      scope: "unit",
      unitId: units[1].id,
    });
    const answer = await call("sessions.answer", {
      id: expression.id,
      itemId: expression.current.id,
      response: { answers: { c1: "2*(x+1)" } },
    });
    expect(answer.results.correct).toBe(1);
    expect(await counts()).toEqual({
      ...none,
      cards: 7,
      problems: 3,
      schedules: 2,
      batches: 1,
    });
  });

  it("leaves the entire file unsaved for bad destinations, formats, references, or IDs", async () => {
    const { course, units } = await mathCourse([
      "First",
      "Repeated",
      "Repeated",
    ]);
    const other = await mathCourse();
    const base = {
      courseId: course.id,
      unitId: units[0].id,
      batchId: "synthetic-invalid",
    };
    const good = card("good");
    for (const [entry, error] of [
      [
        { ...card("bad"), unitId: other.units[0].id },
        /Card 2.*outside this course/,
      ],
      [card("bad", "Repeated"), /Card 2.*matches more than one unit/],
      [card("bad", "missing"), /Card 2.*not a unit/],
      [
        { ...card("bad", "First"), unitId: units[0].id },
        /Card 2.*both unitId and unitName/,
      ],
      [good, /Card 2.*repeats an externalId/],
      [
        { ...card("bad"), content: { ...question, optionCount: 3 } },
        /Card 2 \(content.optionCount\)/,
      ],
      [
        { ...card("bad"), content: { ...question, prompt: " " } },
        /Card 2 \(content.prompt\)/,
      ],
      [
        {
          ...card("bad"),
          content: { ...question, correctOptionIds: ["typo"] },
        },
        /Card 2 \(content.correctOptionIds\)/,
      ],
      [
        { ...card("bad"), skills: ["fractions", "fractions "] },
        /Card 2 \(skills\)/,
      ],
      [
        {
          ...card("bad"),
          content: {
            ...question,
            imageUrl: "/api/media/other-owner",
            imageAlt: "Synthetic chart",
          },
        },
        /Card 2.*uploaded image/,
      ],
      [
        {
          ...card("bad"),
          content: {
            ...question,
            variants: [
              {
                id: "alt",
                prompt: "Alternate",
                componentPrompts: { typo: "Not a component" },
              },
            ],
          },
        },
        /Card 2.*component ID/,
      ],
    ] as const) {
      await expect(
        call("library.import", { ...base, cards: [good, entry] }),
      ).rejects.toThrow(error);
      expect(await counts()).toEqual(none);
    }
    await expect(
      call("library.previewImport", { courseId: course.id, cards: [good] }),
    ).rejects.toThrow("needs a unit");
    await expect(
      execute(db, "unrelated-owner", "library.previewImport", {
        ...base,
        cards: [good],
      }),
    ).rejects.toThrow("Course not found");
    const general = await call("courses.create", {
      name: "General",
      units: ["One"],
    });
    await expect(
      call("library.import", {
        courseId: general.id,
        unitName: "One",
        problems: [good],
      }),
    ).rejects.toThrow("require a math course");
    await expect(
      call("library.import", {
        ...base,
        cards: Array.from({ length: 1001 }, () => good),
      }),
    ).rejects.toThrow("at most 1000");
    await expect(
      call("library.import", {
        ...base,
        problems: [
          { ...good, template: { value: "x".repeat(MAX_IMPORT_ITEM_BYTES) } },
        ],
      }),
    ).rejects.toThrow("exceeds 256 KiB");
    expect(await counts()).toEqual(none);
  });

  it("accepts owned uploaded images and rejects a real image owned by another account", async () => {
    const { course } = await mathCourse();
    const date = new Date().toISOString();
    await run(
      db,
      "INSERT INTO assets VALUES (?,?,?,?,?,?,?)",
      "own-image",
      owner,
      "own-object",
      "image/png",
      "chart.png",
      30,
      date,
    );
    await run(
      db,
      "INSERT INTO assets VALUES (?,?,?,?,?,?,?)",
      "their-image",
      "other",
      "other-object",
      "image/png",
      "chart.png",
      30,
      date,
    );
    const chart = (id: string) => ({
      content: {
        ...question,
        imageUrl: `/api/media/${id}`,
        imageAlt: "Synthetic chart",
      },
    });
    const batch = { courseId: course.id, unitName: "Foundations" };
    await expect(
      call("library.import", {
        ...batch,
        cards: [chart("own-image"), chart("their-image")],
      }),
    ).rejects.toThrow("Card 2");
    expect(await counts()).toEqual(none);
    const { ids } = await call("library.import", {
      ...batch,
      cards: [chart("own-image")],
    });
    expect(await call("cards.get", { id: ids[0] })).toMatchObject({
      content: {
        imageUrl: "/api/media/own-image",
        imageAlt: "Synthetic chart",
      },
    });
  });

  it("requires a new check if a destination name resolves to another unit before saving", async () => {
    const { course, units } = await mathCourse();
    const batch = {
      courseId: course.id,
      unitName: "Foundations",
      cards: [card("check-route")],
    };
    const checked = await call("library.previewImport", batch);
    await call("units.update", { id: units[0].id, name: "Renamed" });
    await call("units.update", { id: units[1].id, name: "Foundations" });
    await expect(
      call("library.import", { ...batch, previewKey: checked.previewKey }),
    ).rejects.toThrow("unit destinations changed");
    expect(await counts()).toEqual(none);
    const updated = await call("library.previewImport", batch);
    expect(
      (
        await call("library.import", {
          ...batch,
          previewKey: updated.previewKey,
        })
      ).units[0].unitId,
    ).toBe(units[1].id);
  });

  it("retries receipt and external IDs safely, preserving append order under overlapping writes", async () => {
    const { course, units } = await mathCourse();
    const destination = { courseId: course.id, unitId: units[0].id };
    const base = {
      ...destination,
      batchId: "first",
      cards: [card("b"), card("a")],
    };
    const repeats = await Promise.all([
      call("library.import", base),
      call("library.import", base),
    ]);
    expect(repeats.filter((result) => result.replayed)).toHaveLength(1);
    expect(repeats[0].ids).toEqual(repeats[1].ids);
    await expect(
      call("library.import", { ...base, cards: [...base.cards].reverse() }),
    ).rejects.toThrow("different content or order");
    const concurrent = await Promise.all([
      call("library.import", {
        ...destination,
        batchId: "second",
        cards: [card("a"), card("shared"), card("second-last")],
      }),
      call("library.import", {
        ...destination,
        batchId: "third",
        cards: [card("shared"), card("third-last")],
      }),
    ]);
    expect(concurrent.reduce((sum, result) => sum + result.imported, 0)).toBe(
      3,
    );
    expect(concurrent.reduce((sum, result) => sum + result.skipped, 0)).toBe(2);
    const ordered = await rows<{ external_id: string; position: number }>(
      db,
      "SELECT external_id,position FROM cards ORDER BY position",
    );
    expect(ordered.slice(0, 2).map((row) => row.external_id)).toEqual([
      "b",
      "a",
    ]);
    expect(
      ordered
        .slice(2)
        .map((row) => row.external_id)
        .sort(),
    ).toEqual(["second-last", "shared", "third-last"]);
    expect(ordered.map((row) => row.position)).toEqual([0, 1, 2, 3, 4]);
    await expect(
      call("library.import", {
        courseId: course.id,
        unitId: units[1].id,
        cards: [card("a")],
      }),
    ).rejects.toThrow("already belongs");
  });

  it("rolls back saved cards and the receipt when writing the problems fails", async () => {
    const { course } = await mathCourse();
    db.exec(
      "CREATE TRIGGER synthetic_import_failure BEFORE INSERT ON problems BEGIN SELECT RAISE(ABORT, 'synthetic write failure'); END",
    );
    const batch = {
      courseId: course.id,
      unitName: "Foundations",
      batchId: "atomic",
      cards: [card("shared")],
      problems: [card("shared")],
    };
    await expect(call("library.import", batch)).rejects.toThrow(
      "synthetic write failure",
    );
    expect(await counts()).toEqual(none);
    db.exec("DROP TRIGGER synthetic_import_failure");
    expect(await call("library.import", batch)).toMatchObject({ imported: 2 });
  });

  it("keeps legacy receipt replays and restores problem order from old and new backups", async () => {
    const { course, units } = await mathCourse();
    const legacy = {
      courseId: course.id,
      unitId: units[0].id,
      batchId: "old-key",
      cards: [{ externalId: "old-card", content: question, skills: [] }],
    };
    const hash = createHash("sha256")
      .update(JSON.stringify({ kind: "cards", ...legacy }))
      .digest("hex");
    await run(
      db,
      "INSERT INTO import_batches VALUES (?,?,?,?,?,?)",
      "old-batch",
      owner,
      legacy.batchId,
      hash,
      JSON.stringify({
        imported: 1,
        skipped: 0,
        ids: ["old-id"],
        batchId: legacy.batchId,
      }),
      new Date().toISOString(),
    );
    expect(await call("cards.import", legacy)).toMatchObject({
      replayed: true,
      ids: ["old-id"],
    });

    await call("library.import", {
      courseId: course.id,
      unitId: units[0].id,
      problems: [card("z"), card("a")],
    });
    const backup = await call("backup.export", {});
    await call("backup.restore", { backup, confirm: true });
    const list = () => call("problems.list", { courseId: course.id });
    expect((await list()).items.map((item: any) => item.externalId)).toEqual([
      "z",
      "a",
    ]);
    for (const problem of backup.tables.problems) delete problem.position;
    await call("backup.restore", { backup, confirm: true });
    const oldOrder = [...backup.tables.problems]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((row) => row.external_id);
    expect((await list()).items.map((item: any) => item.externalId)).toEqual(
      oldOrder,
    );
  });

  it("backfills the ordering used by pre-upgrade problem libraries and appends new imports after it", async () => {
    const legacyDb = createDatabase();
    try {
      for (const file of files.slice(0, 2))
        legacyDb.exec(readFileSync(`drizzle/${file}`, "utf8"));
      const oldCall = (action: string, input: unknown) =>
        execute(legacyDb, owner, action, input);
      const c = await oldCall("courses.create", {
        name: "Old library",
        isMath: true,
        units: ["Original"],
      });
      const [unit] = await rows<{ id: string }>(
        legacyDb,
        "SELECT id FROM units WHERE course_id=?",
        c.id,
      );
      const date = new Date().toISOString();
      for (const id of ["old-b", "old-a"])
        await run(
          legacyDb,
          "INSERT INTO problems (id,course_id,unit_id,external_id,content,created_at,updated_at) VALUES (?,?,?,?,?,?,?)",
          id,
          c.id,
          unit.id,
          id,
          JSON.stringify(question),
          date,
          date,
        );
      for (const file of files.slice(2))
        legacyDb.exec(readFileSync(`drizzle/${file}`, "utf8"));
      await oldCall("library.import", {
        courseId: c.id,
        unitName: "Original",
        problems: [card("new-b"), card("new-a")],
      });
      const list = await oldCall("problems.list", {
        courseId: c.id,
        unitId: unit.id,
      });
      expect(
        list.items.map((item: any) => [item.externalId, item.position]),
      ).toEqual([
        ["old-a", 0],
        ["old-b", 1],
        ["new-b", 2],
        ["new-a", 3],
      ]);
    } finally {
      legacyDb.close();
    }
  });
});
