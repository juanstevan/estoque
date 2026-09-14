import { createHash } from "crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

export const SESSION_COOKIE = "chaleur_session";

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.VERCEL === "1",
    maxAge: 60 * 60 * 24 * 30,
  };
}

export function hashPassword(password: string) {
  return createHash("sha256").update(password).digest("hex");
}

export async function login(username: string, password: string) {
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || user.passwordHash !== hashPassword(password)) {
    throw new Error("Invalid username or password");
  }
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
  };
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function currentUser() {
  const id = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!id) return null;
  return prisma.user.findUnique({ where: { id } });
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}
