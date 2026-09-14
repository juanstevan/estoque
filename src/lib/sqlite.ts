import { createHash, randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

const ADMIN_HASH = createHash("sha256").update("chaleur").digest("hex");

export function sqliteFile(): string {
  const raw = (process.env.DATABASE_URL ?? "file:./prisma/dev.db").replace(
    /^file:/,
    "",
  );
  const local = path.isAbsolute(raw) ? raw : path.join(process.cwd(), raw);
  if (process.env.VERCEL) return "/tmp/chaleur.db";
  return local;
}

function migrationsDir(): string | null {
  for (const dir of [
    path.join(process.cwd(), "prisma/migrations"),
    path.join(process.cwd(), "../prisma/migrations"),
  ]) {
    if (fs.existsSync(dir)) return dir;
  }
  return null;
}

export function prepareSqlite(file: string) {
  const bundled = path.join(process.cwd(), "prisma/dev.db");
  if (file !== bundled && fs.existsSync(bundled) && !fs.existsSync(file)) {
    fs.copyFileSync(bundled, file);
  }

  const db = new Database(file);
  try {
    const hasUser = db
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'User'",
      )
      .get();
    if (!hasUser) {
      const dir = migrationsDir();
      if (!dir) {
        throw new Error("prisma/migrations not found; cannot create User table");
      }
      for (const name of fs.readdirSync(dir).sort()) {
        const sqlPath = path.join(dir, name, "migration.sql");
        if (fs.existsSync(sqlPath)) db.exec(fs.readFileSync(sqlPath, "utf8"));
      }
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
