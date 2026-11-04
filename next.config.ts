import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/adapter-pg", "pg", "prisma"],
  // The Alure outdoor kitchen builder: a standalone page in public/alure, open without signing in.
  async rewrites() {
    return [{ source: "/alure", destination: "/alure/index.html" }];
  },
};

export default nextConfig;
