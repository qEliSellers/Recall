export interface DBResult<T = Record<string, unknown>> {
  results: T[];
  success?: boolean;
  meta?: { changes?: number };
}
export interface Statement {
  bind(...values: unknown[]): Statement;
  first<T = Record<string, unknown>>(column?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<DBResult<T>>;
  run(): Promise<DBResult>;
}
export interface Database {
  prepare(sql: string): Statement;
  batch<T = Record<string, unknown>>(
    statements: Statement[],
  ): Promise<DBResult<T>[]>;
}
export const stmt = (db: Database, sql: string, ...args: unknown[]) =>
  db.prepare(sql).bind(...args);
export const rows = async <T = Record<string, unknown>>(
  db: Database,
  sql: string,
  ...args: unknown[]
) => (await stmt(db, sql, ...args).all<T>()).results;
export const one = async <T = Record<string, unknown>>(
  db: Database,
  sql: string,
  ...args: unknown[]
) => stmt(db, sql, ...args).first<T>();
export const run = async (db: Database, sql: string, ...args: unknown[]) =>
  stmt(db, sql, ...args).run();
export class ServiceError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}
export const fail = (status: number, message: string): never => {
  throw new ServiceError(status, message);
};
export const json = <T = any>(value: unknown, fallback: T = null as T): T => {
  if (value === null || value === undefined) return fallback;
  return typeof value === "string" ? JSON.parse(value) : (value as T);
};
export const uid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export const placeholders = (n: number) =>
  Array.from({ length: n }, () => "?").join(",");
