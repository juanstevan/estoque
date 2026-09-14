/** Prisma 7 and Vercel both treat "" as a set URL. Never return empty. */
export function databaseUrl(): string {
  return process.env.DATABASE_URL?.trim() || "file:./prisma/dev.db";
}
