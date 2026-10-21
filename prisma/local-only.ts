import "dotenv/config";
import { databaseUrl } from "../src/lib/database-url";

/** Seeding and resetting wipe the database. They only run against one on this machine. */
export function assertLocalDatabase() {
  const host = (() => {
    try {
      return new URL(databaseUrl()).hostname;
    } catch {
      return "";
    }
  })();
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(host)) {
    console.error(`Refusing: this wipes the database, and ${host || "the configured database"} isn't local.`);
    process.exit(1);
  }
}

if (process.argv[1]?.endsWith("local-only.ts")) assertLocalDatabase();
