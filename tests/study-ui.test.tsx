// @vitest-environment happy-dom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync, readdirSync } from "node:fs";
import { createDatabase } from "../lib/sqlite";
import { execute } from "../lib/service";
import { rows } from "../lib/db";
import { handleApi } from "../worker/api";
import { StudySession } from "../src/StudySession";
import ImportDialog from "../src/ImportDialog";
import type { Env } from "../worker/env";

let db: ReturnType<typeof createDatabase>;
const owner = "ui-test-owner";
const call = (action: string, input: unknown = {}) =>
  execute(db, owner, action, input);
const cloze = {
  type: "cloze",
  prompt: "Synthetic two-part question",
  explanation: "Whole-card explanation",
  components: [
    {
      id: "first",
      prompt: "First blank: 2 + 2 = ___",
      options: [
        { id: "a", text: "4" },
        { id: "b", text: "5" },
      ],
      correctOptionIds: ["a"],
      explanation: "First explanation only",
    },
    {
      id: "second",
      prompt: "Second blank: 3 + 3 = ___",
      options: [
        { id: "a", text: "6" },
        { id: "b", text: "7" },
      ],
      correctOptionIds: ["a"],
      explanation: "Second explanation secret",
    },
  ],
};
beforeEach(() => {
  db = createDatabase();
  for (const file of readdirSync("drizzle")
    .filter((file) => file.endsWith(".sql"))
    .sort())
    db.exec(readFileSync(`drizzle/${file}`, "utf8"));
  const env: Env = {
    DB: db,
    BUCKET: {
      async get() {
        return null;
      },
      async put() {},
      async delete() {},
    },
  };
  // This is an isolated component test transport, never a development or production identity path.
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init?: RequestInit) =>
      handleApi(
        new Request(`https://recall.test${path}`, {
          ...init,
          headers: { ...init?.headers, "oai-authenticated-user-id": owner },
        }),
        env,
      ),
    ),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  db.close();
});

it("uploads a mixed JSON file, previews unit destinations, invalidates edits, then saves", async () => {
  const course = await call("courses.create", {
    name: "Synthetic import UI",
    isMath: true,
    units: ["First", "Second"],
  });
  const { units } = await call("courses.get", { id: course.id });
  const data = JSON.stringify({
    version: 1,
    batchId: "test-import-ui",
    courseId: course.id,
    unitName: "First",
    cards: [{ externalId: "cloze", content: cloze }],
    problems: [
      {
        externalId: "fraction",
        unitName: "Second",
        content: { type: "typed", prompt: "One half", answer: "1/2" },
      },
    ],
  });
  const saved = vi.fn();
  const user = userEvent.setup();
  render(
    <ImportDialog
      course={course}
      units={units}
      kind="cards"
      initialUnitId=""
      onClose={() => {}}
      onSaved={saved}
    />,
  );
  await user.upload(
    screen.getByLabelText("Import file"),
    new File([data], "synthetic.json", { type: "application/json" }),
  );
  await screen.findByText("synthetic.json");
  const check = () =>
    user.click(screen.getByRole("button", { name: "Check batch" }));
  await check();
  const preview = await screen.findByRole("status", { name: "Import preview" });
  expect(
    within(preview).getByRole("row", { name: "First 1 0 0" }),
  ).toBeTruthy();
  expect(
    within(preview).getByRole("row", { name: "Second 0 1 0" }),
  ).toBeTruthy();
  expect((await call("cards.list", { courseId: course.id })).total).toBe(0);

  const field = screen.getByRole("textbox", { name: "Import data" });
  fireEvent.change(field, {
    target: {
      value: data.replace('"unitName":"Second"', '"unitName":"Missing"'),
    },
  });
  expect(screen.queryByRole("button", { name: "Import 2 items" })).toBeNull();
  await check();
  expect((await screen.findByRole("alert")).textContent).toMatch(
    /Problem 1.*Missing/,
  );
  expect(saved).not.toHaveBeenCalled();

  fireEvent.change(field, { target: { value: data } });
  await check();
  await user.click(
    await screen.findByRole("button", { name: "Import 2 items" }),
  );
  await waitFor(() =>
    expect(saved).toHaveBeenCalledWith(
      expect.objectContaining({ imported: 2, skipped: 0 }),
    ),
  );
  expect(
    (await call("cards.list", { courseId: course.id, unitId: units[0].id }))
      .items[0],
  ).toMatchObject({ status: "unintroduced", externalId: "cloze" });
  expect(
    (await call("problems.list", { courseId: course.id, unitId: units[1].id }))
      .items[0],
  ).toMatchObject({ externalId: "fraction" });
});

async function clozeSession(mode = "review", feedback = "immediate") {
  const course = await call("courses.create", {
    name: "Synthetic UI course",
    units: ["Foundations"],
  });
  const detail = await call("courses.get", { id: course.id });
  await call("cards.import", {
    courseId: course.id,
    unitId: detail.units[0].id,
    batchId: "ui-cloze",
    cards: [{ content: cloze, skills: ["addition"] }],
  });
  await call("cards.introduce", { unitId: detail.units[0].id, count: 1 });
  return call("sessions.create", {
    courseId: course.id,
    mode,
    feedback,
    count: 1,
  });
}

describe("study interface through the shared HTTP service", () => {
  it("reveals and persists one blank at a time, resumes after remount, and rates the whole card once", async () => {
    const session = await clozeSession();
    const user = userEvent.setup();
    const firstRender = render(
      <StudySession sessionId={session.id} onClose={() => {}} />,
    );
    await screen.findByText("First blank: 2 + 2 = ___");
    expect(screen.queryByText("Second blank: 3 + 3 = ___")).toBeNull();
    await user.click(screen.getByRole("radio", { name: /\b4\b/ }));
    await user.click(screen.getByRole("button", { name: /Check answer/ }));
    await screen.findByText("First explanation only");
    expect(screen.queryByText("Second explanation secret")).toBeNull();
    expect(screen.queryByText("Whole-card explanation")).toBeNull();
    firstRender.unmount();
    render(<StudySession sessionId={session.id} onClose={() => {}} />);
    await screen.findByText("Second blank: 3 + 3 = ___");
    expect(screen.queryByRole("radio", { name: /\b4\b/ })).toBeNull();
    await user.click(screen.getByRole("radio", { name: /\b7\b/ }));
    await user.click(screen.getByRole("button", { name: /Check answer/ }));
    await screen.findByText("Whole-card explanation");
    expect(await rows(db, "SELECT * FROM reviews")).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: /Again/ }));
    await screen.findByText("Session complete");
    expect(await rows(db, "SELECT * FROM reviews")).toHaveLength(1);
    expect(screen.getByText("Foundations")).toBeTruthy();
  });

  it("honors end-only quiz feedback through the final blank without touching FSRS", async () => {
    const session = await clozeSession("quiz", "end");
    const before = await rows(db, "SELECT * FROM schedules");
    const user = userEvent.setup();
    render(<StudySession sessionId={session.id} onClose={() => {}} />);
    await screen.findByText("First blank: 2 + 2 = ___");
    await user.click(screen.getByRole("radio", { name: /\b4\b/ }));
    await user.click(screen.getByRole("button", { name: /Check answer/ }));
    await screen.findByText("Second blank: 3 + 3 = ___");
    expect(screen.queryByText("First explanation only")).toBeNull();
    await user.click(screen.getByRole("radio", { name: /\b6\b/ }));
    await user.click(screen.getByRole("button", { name: /Check answer/ }));
    await screen.findByText("Session complete");
    expect(await rows(db, "SELECT * FROM schedules")).toEqual(before);
    expect(await rows(db, "SELECT * FROM reviews")).toHaveLength(0);
  });

  it("retains a typed answer through remount and manual grading", async () => {
    const course = await call("courses.create", {
      name: "Synthetic math",
      isMath: true,
      units: ["Proofs"],
    });
    const detail = await call("courses.get", { id: course.id });
    await call("problems.import", {
      courseId: course.id,
      unitId: detail.units[0].id,
      batchId: "proof",
      problems: [
        {
          content: {
            type: "typed",
            prompt: "Give a proof",
            answer: "A proof by induction",
            grading: "manual",
          },
          solution: "A worked proof",
        },
      ],
    });
    const session = await call("sessions.create", {
      courseId: course.id,
      mode: "problem",
      count: 1,
    });
    const user = userEvent.setup();
    const initial = render(
      <StudySession sessionId={session.id} onClose={() => {}} />,
    );
    await user.type(
      await screen.findByRole("textbox", { name: "Your answer" }),
      "My original proof",
    );
    await user.click(screen.getByRole("button", { name: /Check answer/ }));
    await screen.findByText("Does your answer match the solution?");
    initial.unmount();
    render(<StudySession sessionId={session.id} onClose={() => {}} />);
    await screen.findByText("My original proof");
    await user.click(screen.getByRole("button", { name: /I got it right/ }));
    await waitFor(async () =>
      expect(await rows(db, "SELECT * FROM problem_attempts")).toHaveLength(1),
    );
    const saved = await call("sessions.get", { id: session.id });
    expect(saved.results.items[0].response.answers.c1).toBe(
      "My original proof",
    );
    expect(await rows(db, "SELECT * FROM schedules")).toHaveLength(0);
  });
});
