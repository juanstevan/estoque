import { createHash, randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { databaseUrl } from "@/lib/database-url";

const ADMIN_HASH = createHash("sha256").update("chaleur").digest("hex");

const MIGRATIONS = [
  "20260811185313_init",
  "20260825134712_chaleur",
  "20260911162000_import_columns",
] as const;

export function sqliteFile(): string {
  if (process.env.VERCEL) return "/tmp/chaleur.db";
  const raw = databaseUrl().replace(/^file:/, "");
  return path.isAbsolute(raw)
    ? raw
    : path.join(/*turbopackIgnore: true*/ process.cwd(), raw);
}

function migrationSql(name: string) {
  return fs.readFileSync(
    path.join(process.cwd(), "prisma", "migrations", name, "migration.sql"),
    "utf8",
  );
}

export function prepareSqlite(file: string) {
  const db = new Database(file);
  try {
    const hasUser = db
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'User'",
      )
      .get();
    if (!hasUser) {
      for (const name of MIGRATIONS) db.exec(migrationSql(name));
    }
    if (!db.prepare("SELECT 1 FROM User WHERE username = 'admin'").get()) {
      db.prepare(
        `INSERT INTO User (id, username, name, passwordHash, role, createdAt)
         VALUES (?, 'admin', 'Juan Souza', ?, 'admin', datetime('now'))`,
      ).run(randomUUID(), ADMIN_HASH);
    }
    db.prepare("INSERT OR IGNORE INTO AppSettings (id) VALUES ('default')").run();
  } finally {
    db.close();
  }
}
