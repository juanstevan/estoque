import "dotenv/config";
import { defineConfig } from "prisma/config";
import { databaseUrl } from "./src/lib/database-url";

const url = databaseUrl();
if (!url && process.env.VERCEL) {
  throw new Error(
    "DATABASE_URL is missing. In Vercel, connect Storage → prisma-estoque so DATABASE_URL is the postgres:// URL.",
  );
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: url || "postgresql://postgres:postgres@localhost:5432/postgres",
  },
});
