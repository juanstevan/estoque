/** Prisma CLI + app. Empty Vercel env vars must not win over a real URL. */
export function databaseUrl(): string {
  const url =
    process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim() || "";
  return url;
}
