import "dotenv/config";
import path from "node:path";
import { defineConfig } from "prisma/config";

// Prisma 7 moved the datasource URL out of schema.prisma. Relative SQLite
// paths used to resolve against the prisma/ folder; keep that behaviour so
// the existing prisma/dev.db keeps working.
function sqliteUrl(): string {
  const raw = process.env.DATABASE_URL ?? "file:./dev.db";
  const p = raw.replace(/^file:/, "");
  if (p === ":memory:" || path.isAbsolute(p)) return `file:${p}`;
  return `file:${path.resolve("prisma", p)}`;
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: sqliteUrl(),
  },
});
