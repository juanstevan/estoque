/** Vercel + Prisma Storage often injects `database_DATABASE_URL`, not `DATABASE_URL`. */
export function databaseUrl(): string {
  const named = [
    "DATABASE_URL",
    "DIRECT_URL",
    "POSTGRES_PRISMA_URL",
    "POSTGRES_URL",
    "PRISMA_DATABASE_URL",
    "database_DATABASE_URL",
    "database_POSTGRES_URL",
    "database_PRISMA_DATABASE_URL",
  ];
  for (const key of named) {
    const value = process.env[key]?.trim();
    if (value?.startsWith("postgres")) return value;
  }
  for (const [key, raw] of Object.entries(process.env)) {
    if (!/DATABASE_URL$/.test(key) && !/POSTGRES_URL$/.test(key)) continue;
    const value = raw?.trim();
    if (value?.startsWith("postgres")) return value;
  }
  return process.env.DATABASE_URL?.trim() || "";
}
