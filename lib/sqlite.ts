import { DatabaseSync } from "node:sqlite";
import type { Database, Statement, DBResult } from "./db";
export function createDatabase(
  path = ":memory:",
): Database & { close(): void; exec(sql: string): void } {
  const sqlite = new DatabaseSync(path);
  sqlite.exec("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;");
  class Query implements Statement {
    constructor(
      public sql: string,
      public params: any[] = [],
    ) {}
    bind(...values: unknown[]) {
      return new Query(this.sql, values);
    }
    async first<T = any>(column?: string): Promise<T | null> {
      const row = sqlite.prepare(this.sql).get(...this.params) as any;
      return row ? (column ? row[column] : row) : null;
    }
    async all<T = any>(): Promise<DBResult<T>> {
      return {
        success: true,
        results: sqlite.prepare(this.sql).all(...this.params) as T[],
      };
    }
    async run(): Promise<DBResult> {
      const r = sqlite.prepare(this.sql).run(...this.params);
      return {
        success: true,
        results: [],
        meta: { changes: Number(r.changes) },
      };
    }
  }
  return {
    prepare: (sql: string) => new Query(sql),
    async batch<T = any>(queries: Statement[]): Promise<DBResult<T>[]> {
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        const results: DBResult<T>[] = [];
        for (const q of queries) {
          const query = q as Query;
          const raw = sqlite.prepare(query.sql);
          if (/^\s*(SELECT|WITH|PRAGMA)\b/i.test(query.sql))
            results.push({
              success: true,
              results: raw.all(...query.params) as T[],
            });
          else {
            const r = raw.run(...query.params);
            results.push({
              success: true,
              results: [],
              meta: { changes: Number(r.changes) },
            });
          }
        }
        sqlite.exec("COMMIT");
        return results;
      } catch (e) {
        sqlite.exec("ROLLBACK");
        throw e;
      }
    },
    close: () => sqlite.close(),
    exec: (sql: string) => sqlite.exec(sql),
  };
}
