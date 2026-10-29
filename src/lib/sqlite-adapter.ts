import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

// Prisma 7 needs a driver adapter. Relative SQLite paths resolve against the
// prisma/ folder (as they did in Prisma 6) so prisma/dev.db keeps working.
export function sqliteDbPath(): string {
  const raw = process.env.DATABASE_URL ?? "file:./dev.db";
  const p = raw.replace(/^file:/, "");
  if (p === ":memory:" || path.isAbsolute(p)) return p;
  return path.resolve(process.cwd(), "prisma", p);
}

export function createSqliteAdapter() {
  return new PrismaBetterSqlite3({ url: sqliteDbPath() });
}
