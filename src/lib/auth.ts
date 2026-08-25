import { createHash } from "crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

const COOKIE = "chaleur_session";

export function hashPassword(password: string) {
  return createHash("sha256").update(password).digest("hex");
}

export async function login(username: string, password: string) {
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || user.passwordHash !== hashPassword(password)) {
    throw new Error("Invalid username or password");
  }
  (await cookies()).set(COOKIE, user.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  return { id: user.id, username: user.username, name: user.name, role: user.role };
}

export async function logout() {
  (await cookies()).delete(COOKIE);
}

export async function currentUser() {
  const id = (await cookies()).get(COOKIE)?.value;
  if (!id) return null;
  return prisma.user.findUnique({ where: { id } });
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}
