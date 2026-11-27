import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { createDatabase } from "../lib/sqlite.ts";
import type { Env } from "../worker/env";

export async function localEnvironment(): Promise<Env & { close(): void }> {
  const directory = path.resolve(".local");
  await mkdir(path.join(directory, "media"), { recursive: true });
  const DB = createDatabase(path.join(directory, "recall.sqlite"));
  DB.exec(
    "CREATE TABLE IF NOT EXISTS _local_migrations (name TEXT PRIMARY KEY, hash TEXT NOT NULL)",
  );
  for (const name of (await readdir("drizzle"))
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    const sql = await readFile(path.join("drizzle", name), "utf8");
    const hash = createHash("sha256").update(sql).digest("hex");
    const prior = await DB.prepare(
      "SELECT hash FROM _local_migrations WHERE name=?",
    )
      .bind(name)
      .first<{ hash: string }>();
    if (prior) {
      if (prior.hash !== hash)
        throw new Error(
          `Applied migration ${name} changed; create a new migration.`,
        );
      continue;
    }
    DB.exec("BEGIN IMMEDIATE");
    try {
      DB.exec(sql);
      await DB.prepare("INSERT INTO _local_migrations(name,hash) VALUES (?,?)")
        .bind(name, hash)
        .run();
      DB.exec("COMMIT");
    } catch (error) {
      DB.exec("ROLLBACK");
      throw error;
    }
  }
  const mediaPath = (key: string) =>
    path.join(
      directory,
      "media",
      createHash("sha256").update(key).digest("hex"),
    );
  return {
    DB,
    close: () => DB.close(),
    BUCKET: {
      async get(key) {
        try {
          const buffer = await readFile(mediaPath(key));
          const data = Uint8Array.from(buffer);
          return {
            body: new Blob([data]).stream(),
            async arrayBuffer() {
              return data.buffer;
            },
          };
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
          throw error;
        }
      },
      async put(key, body) {
        await writeFile(mediaPath(key), new Uint8Array(body));
      },
      async delete(key) {
        try {
          await unlink(mediaPath(key));
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      },
    },
  };
}
