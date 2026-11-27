import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { createDatabase } from "../lib/sqlite";
import { execute } from "../lib/service";
import { handleApi } from "../worker/api";
import type { Env } from "../worker/env";

let db: ReturnType<typeof createDatabase>;
let objects: Map<string, Uint8Array<ArrayBuffer>>;
let env: Env;
const origin = "https://recall.test";
const user = "test-owner";
const content = {
  type: "multiple_choice",
  prompt: "Synthetic test question",
  options: [
    { id: "yes", text: "Answer" },
    { id: "no", text: "Distractor" },
  ],
  correctOptionIds: ["yes"],
};
const png = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
    "base64",
  ),
);
function request(
  path: string,
  body?: unknown,
  owner: string | null = user,
  headers: Record<string, string> = {},
) {
  return new Request(`${origin}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(owner ? { "oai-authenticated-user-id": owner } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function action(
  action: string,
  input: unknown = {},
  owner: string | null = user,
) {
  return handleApi(request("/api/action", { action, input }, owner), env);
}
async function rpc(
  name: string,
  args: unknown = {},
  owner: string | null = user,
) {
  return handleApi(
    request(
      "/mcp",
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      },
      owner,
    ),
    env,
  );
}
async function upload(owner = user) {
  const form = new FormData();
  form.set("file", new File([png], "synthetic.png", { type: "image/png" }));
  return handleApi(
    new Request(`${origin}/api/assets`, {
      method: "POST",
      headers: { "oai-authenticated-user-id": owner },
      body: form,
    }),
    env,
  );
}

beforeEach(() => {
  db = createDatabase();
  for (const file of readdirSync("drizzle")
    .filter((file) => file.endsWith(".sql"))
    .sort())
    db.exec(readFileSync(`drizzle/${file}`, "utf8"));
  objects = new Map();
  env = {
    DB: db,
    BUCKET: {
      async get(key) {
        const data = objects.get(key);
        return data
          ? {
              body: new Blob([data]).stream(),
              async arrayBuffer() {
                return data.buffer.slice(0);
              },
            }
          : null;
      },
      async put(key, value) {
        objects.set(key, Uint8Array.from(new Uint8Array(value)));
      },
      async delete(key) {
        objects.delete(key);
      },
    },
  };
});
afterEach(() => db.close());

describe("authenticated HTTP and MCP boundary", () => {
  it("rejects unauthenticated data, writes, media, backups and MCP", async () => {
    for (const path of ["/api/me", "/api/backup", "/api/media/absent"])
      expect(
        (await handleApi(request(path, undefined, null), env)).status,
      ).toBe(401);
    expect((await action("courses.list", {}, null)).status).toBe(401);
    expect((await rpc("list_courses", {}, null)).status).toBe(401);
  });
  it("rejects cross-origin writes, malformed bodies, unknown actions and invalid limits", async () => {
    expect(
      (
        await handleApi(
          request(
            "/api/action",
            { action: "courses.create", input: { name: "No" } },
            user,
            { Origin: "https://unrelated.test" },
          ),
          env,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await handleApi(
          new Request(`${origin}/api/action`, {
            method: "POST",
            headers: {
              "oai-authenticated-user-id": user,
              "Content-Type": "application/json",
            },
            body: "{",
          }),
          env,
        )
      ).status,
    ).toBe(400);
    expect(
      (await action("raw.sql", { query: "SELECT * FROM courses" })).status,
    ).toBe(404);
    const denied: any = await (
      await rpc("search_cards", { courseId: "x", limit: 201 })
    ).json();
    expect(denied.result.isError).toBe(true);
  });
  it("uses the same persisted data and validation for browser and MCP reads/writes", async () => {
    const created: any = await (
      await action("courses.create", {
        name: "Synthetic HTTP course",
        units: ["Unit A"],
      })
    ).json();
    const course = created.data;
    const listed: any = await (await rpc("list_courses")).json();
    expect(JSON.stringify(listed.result.structuredContent.data)).toContain(
      course.id,
    );
    const details: any = await execute(db, user, "courses.get", {
      id: course.id,
    });
    const unitId = details.units[0].id;
    const imported: any = await (
      await rpc("import_cards", {
        courseId: course.id,
        unitId,
        batchId: "http-import",
        cards: [{ externalId: "one", content }],
      })
    ).json();
    expect(imported.result.isError).toBe(false);
    const library: any = await (
      await action("cards.list", { courseId: course.id })
    ).json();
    expect(library.data.items).toHaveLength(1);
    expect(library.data.items[0].status).toBe("unintroduced");
    const foreign: any = await (
      await rpc("get_card", { id: library.data.items[0].id }, "another-owner")
    ).json();
    expect(foreign.result.isError).toBe(true);
    const tools: any = await (
      await handleApi(
        request("/mcp", { jsonrpc: "2.0", id: 2, method: "tools/list" }),
        env,
      )
    ).json();
    expect(tools.result.tools.map((tool: any) => tool.name)).toContain(
      "review_history",
    );
    expect(tools.result.tools.map((tool: any) => tool.name)).toContain(
      "list_units",
    );
    expect(
      tools.result.tools.every(
        (tool: any) => tool.inputSchema && !tool.name.includes("sql"),
      ),
    ).toBe(true);
  });
});

describe("durable media and complete backup", () => {
  it("stores image bytes privately and rejects disguised unsupported uploads", async () => {
    const response = await upload();
    expect(response.status).toBe(201);
    const { data }: any = await response.json();
    const download = await handleApi(request(data.url), env);
    expect(download.status).toBe(200);
    expect(new Uint8Array(await download.arrayBuffer())).toEqual(png);
    expect(
      (await handleApi(request(data.url, undefined, "another-owner"), env))
        .status,
    ).toBe(404);
    const form = new FormData();
    form.set(
      "file",
      new File(["<svg><script>bad</script></svg>"], "fake.png", {
        type: "image/png",
      }),
    );
    expect(
      (
        await handleApi(
          new Request(`${origin}/api/assets`, {
            method: "POST",
            headers: { "oai-authenticated-user-id": user },
            body: form,
          }),
          env,
        )
      ).status,
    ).toBe(400);
    expect(objects.size).toBe(1);
  });
  it("restores database and image bytes atomically and preserves old data after invalid restore", async () => {
    const { data: asset }: any = await (await upload()).json();
    const course: any = await execute(db, user, "courses.create", {
      name: "Backup course",
      units: ["One"],
    });
    const details: any = await execute(db, user, "courses.get", {
      id: course.id,
    });
    await execute(db, user, "cards.import", {
      courseId: course.id,
      unitId: details.units[0].id,
      batchId: "backup-test",
      cards: [
        {
          externalId: "diagram",
          content: {
            ...content,
            imageUrl: asset.url,
            imageAlt: "Synthetic one-pixel diagram",
          },
        },
      ],
    });
    const exported = await handleApi(request("/api/backup"), env);
    expect(exported.status).toBe(200);
    const backup: any = await exported.json();
    expect(backup.media).toHaveLength(1);
    const oldKeys = [...objects.keys()];
    const corrupted = structuredClone(backup);
    corrupted.tables.cards[0].unit_id = "missing-unit";
    expect(
      (
        await handleApi(
          request("/api/backup", { backup: corrupted, confirm: true }),
          env,
        )
      ).status,
    ).toBe(400);
    expect([...objects.keys()]).toEqual(oldKeys);
    expect((await handleApi(request(asset.url), env)).status).toBe(200);
    await execute(db, user, "courses.update", {
      id: course.id,
      name: "Edited after backup",
    });
    const restored = await handleApi(
      request("/api/backup", { backup, confirm: true }),
      env,
    );
    expect(restored.status).toBe(200);
    expect(
      ((await execute(db, user, "courses.get", { id: course.id })) as any)
        .course.name,
    ).toBe("Backup course");
    expect(objects.size).toBe(1);
    expect([...objects.keys()]).not.toEqual(oldKeys);
    expect(
      new Uint8Array(
        await (await handleApi(request(asset.url), env)).arrayBuffer(),
      ),
    ).toEqual(png);
    expect(
      (await handleApi(request("/api/backup", { backup, confirm: false }), env))
        .status,
    ).toBe(400);
  });
});
