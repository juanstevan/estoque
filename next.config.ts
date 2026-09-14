import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "better-sqlite3",
    "@prisma/adapter-better-sqlite3",
  ],
  outputFileTracingIncludes: {
    "/*": ["./prisma/migrations/**/*", "./prisma/dev.db"],
  },
};

export default nextConfig;
