import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

// Exercise the compiled artifact in workerd, not a browser preview or a live account.
const runtime = new Miniflare(
  convertV4MiniflareOptions({
    modules: true,
    scriptPath: "dist/server/index.js",
    compatibilityDate: "2026-06-01",
    d1Databases: ["DB"],
    r2Buckets: ["BUCKET"],
    port: 0,
  }),
);
const user = "synthetic-worker-test";
async function action(name, input = {}) {
  const response = await runtime.dispatchFetch(
    "https://recall.test/api/action",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "oai-authenticated-user-id": user,
      },
      body: JSON.stringify({ action: name, input }),
    },
  );
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  return body.data;
}
try {
  const db = await runtime.getD1Database("DB");
  for (const file of (await readdir("drizzle"))
    .filter((file) => file.endsWith(".sql"))
    .sort()) {
    for (const sql of (await readFile(`drizzle/${file}`, "utf8"))
      .split("--> statement-breakpoint")
      .map((sql) => sql.trim())
      .filter(Boolean))
      await db.prepare(sql).run();
  }
  const home = await runtime.dispatchFetch("https://recall.test/");
  assert.equal(home.status, 200);
  assert.match(await home.text(), /<div id="root"><\/div>/);
  assert.equal(
    (await runtime.dispatchFetch("https://recall.test/api/me")).status,
    401,
  );
  const course = await action("courses.create", {
    name: "Synthetic Worker verification",
    isMath: true,
    units: ["One", "Two"],
  });
  const { units } = await action("courses.get", { id: course.id });
  const content = {
    type: "multiple_choice",
    prompt: "Synthetic: 2 + 2?",
    options: [
      { id: "a", text: "4" },
      { id: "b", text: "5" },
    ],
    correctOptionIds: ["a"],
  };
  const payload = {
    courseId: course.id,
    unitId: units[0].id,
    batchId: "worker-batch",
    cards: Array.from({ length: 100 }, (_, i) => ({
      externalId: `item-${i}`,
      content,
    })),
  };
  assert.equal((await action("cards.import", payload)).imported, 100);
  assert.equal((await action("cards.import", payload)).replayed, true);
  assert.equal(
    (await action("courses.get", { id: course.id })).course.introducedCards,
    0,
  );
  await action("cards.introduce", { unitId: units[0].id, count: 20 });
  await action("cards.introduce", { unitId: units[0].id, count: 15 });
  assert.equal(
    (await action("courses.get", { id: course.id })).course.introducedCards,
    35,
  );
  let session = await action("sessions.create", {
    courseId: course.id,
    mode: "review",
    count: 1,
  });
  const item = session.current;
  assert.ok(!JSON.stringify(session).includes("correctOptionIds"));
  const choice = item.question.components[0].options.find(
    (option) => option.text === "4",
  );
  await action("sessions.answer", {
    id: session.id,
    itemId: item.id,
    response: { answers: { c1: choice.id } },
    responseMs: 1000,
  });
  await action("sessions.rate", { id: session.id, itemId: item.id, rating: 3 });
  await action("sessions.rate", { id: session.id, itemId: item.id, rating: 1 });
  assert.equal(
    (await action("history.reviews", { courseId: course.id })).total,
    1,
  );
  const before = await db
    .prepare("SELECT * FROM schedules ORDER BY card_id")
    .all();
  const quiz = await action("sessions.create", {
    courseId: course.id,
    mode: "quiz",
    count: 300,
    includeUnintroduced: true,
  });
  assert.equal(quiz.total, 100);
  assert.deepEqual(
    (await db.prepare("SELECT * FROM schedules ORDER BY card_id").all())
      .results,
    before.results,
  );
  const media = new FormData();
  media.set(
    "file",
    new Blob(
      [
        Uint8Array.from(
          Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
            "base64",
          ),
        ),
      ],
      { type: "image/png" },
    ),
    "synthetic.png",
  );
  const uploadRequest = new Request("https://recall.test/api/assets", {
    method: "POST",
    body: media,
  });
  const uploaded = await runtime.dispatchFetch(uploadRequest.url, {
    method: "POST",
    headers: {
      "oai-authenticated-user-id": user,
      "Content-Type": uploadRequest.headers.get("content-type"),
    },
    body: await uploadRequest.arrayBuffer(),
  });
  assert.equal(uploaded.status, 201, await uploaded.clone().text());
  const asset = (await uploaded.json()).data;
  const exportResponse = await runtime.dispatchFetch(
    "https://recall.test/api/backup",
    { headers: { "oai-authenticated-user-id": user } },
  );
  assert.equal(exportResponse.status, 200);
  const backup = await exportResponse.json();
  assert.equal(backup.media.length, 1);
  const restored = await runtime.dispatchFetch(
    "https://recall.test/api/backup",
    {
      method: "POST",
      headers: {
        "oai-authenticated-user-id": user,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ backup, confirm: true }),
    },
  );
  assert.equal(restored.status, 200, await restored.clone().text());
  assert.equal(
    (
      await runtime.dispatchFetch(`https://recall.test${asset.url}`, {
        headers: { "oai-authenticated-user-id": user },
      })
    ).status,
    200,
  );
  assert.equal(
    (await action("history.reviews", { courseId: course.id })).total,
    1,
  );
  console.log(
    "Worker smoke passed: built assets, auth, D1 migrations/import/introduction/atomic FSRS, quiz isolation, R2 media, complete backup restore.",
  );
} finally {
  await runtime.dispose();
}
