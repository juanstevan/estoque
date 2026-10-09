import { createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { FULL_ACCESS, NO_ACCESS, parseAccess, type Access } from "@/lib/access";
import { checkPassword, hashPassword, isLegacyHash } from "@/lib/password";
import { passwordProblem } from "@/lib/password-rules";

export const SESSION_COOKIE = "chaleur_session";

const DAY = 24 * 60 * 60 * 1000;
/** "Keep me signed in" lasts this long. Otherwise the cookie ends with the browser (and a day at most). */
export const REMEMBER_DAYS = 30;
const LOCK_AFTER = 5;
const LOCK_MINUTES = 5;

export type Me = {
  id: string;
  username: string;
  name: string;
  roleId: string | null;
  roleName: string;
  /** The main user: full access, manages people, roles and hidden tabs. */
  main: boolean;
  access: Access;
  mustChangePassword: boolean;
};

type UserWithRole = {
  id: string;
  username: string;
  name: string;
  roleId: string | null;
  mustChangePassword: boolean;
  access: { name: string; access: string; main: boolean } | null;
};

function toMe(user: UserWithRole): Me {
  const main = Boolean(user.access?.main);
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    roleId: user.roleId,
    roleName: user.access?.name ?? "No role",
    main,
    access: main ? FULL_ACCESS : user.access ? parseAccess(user.access.access) : NO_ACCESS,
    mustChangePassword: user.mustChangePassword,
  };
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function cookieOptions(expiresAt: Date | null) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.VERCEL === "1",
    ...(expiresAt ? { expires: expiresAt } : {}),
  };
}

/** Checks the password and opens a session. Five wrong passwords in a row pause the account. */
export async function signIn(usernameRaw: string, password: string, remember: boolean) {
  const username = usernameRaw.trim();
  const user = await prisma.user.findUnique({ where: { username } });
  const wrong = new Error("Wrong username or password");
  if (!user) throw wrong;
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new Error(`Too many wrong passwords. Try again in ${LOCK_MINUTES} minutes.`);
  }
  if (!(await checkPassword(password, user.passwordHash))) {
    const failed = user.failedSignIns + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedSignIns: failed >= LOCK_AFTER ? 0 : failed,
        lockedUntil: failed >= LOCK_AFTER ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000) : null,
      },
    });
    throw wrong;
  }
  if (user.deactivatedAt) throw new Error("This account is turned off. Ask your main user.");
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + (remember ? REMEMBER_DAYS : 1) * DAY);
  await prisma.$transaction([
    prisma.session.create({ data: { id: tokenHash(token), userId: user.id, expiresAt } }),
    prisma.session.deleteMany({ where: { userId: user.id, expiresAt: { lt: new Date() } } }),
    prisma.user.update({
      where: { id: user.id },
      data: {
        lastSignInAt: new Date(),
        failedSignIns: 0,
        lockedUntil: null,
        // Old unsalted hashes are replaced the first time the password is typed again.
        ...(isLegacyHash(user.passwordHash) ? { passwordHash: await hashPassword(password) } : {}),
      },
    }),
  ]);
  (await cookies()).set(SESSION_COOKIE, token, cookieOptions(remember ? expiresAt : null));
  return { mustChangePassword: user.mustChangePassword };
}

export async function signOut() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { id: tokenHash(token) } });
  store.delete(SESSION_COOKIE);
}

/** The signed-in person, or null. Expired sessions and turned-off accounts count as signed out. */
export async function currentUser(): Promise<Me | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { id: tokenHash(token) },
    include: { user: { include: { access: { select: { name: true, access: true, main: true } } } } },
  });
  if (!session || session.expiresAt < new Date() || session.user.deactivatedAt) return null;
  return toMe(session.user);
}

/** Name, username, or password. Being signed in is enough to set a new password. */
export async function updateProfile(
  id: string,
  input: { name?: string; username?: string; password?: string },
) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id } });
  const name = input.name?.trim();
  const username = input.username?.trim();
  if (input.name !== undefined && !name) throw new Error("Enter your name");
  if (input.username !== undefined && !username) throw new Error("Enter a username");
  if (username && username !== user.username && (await prisma.user.findUnique({ where: { username } }))) {
    throw new Error(`${username} is already taken`);
  }
  if (input.password !== undefined) {
    const problem = passwordProblem(input.password);
    if (problem) throw new Error(problem);
  }
  await prisma.user.update({
    where: { id },
    data: {
      name,
      username,
      passwordHash: input.password === undefined ? undefined : await hashPassword(input.password),
    },
  });
  return currentUserById(id);
}

/** First sign-in with a temporary password: they choose their own, no current password asked. */
export async function chooseOwnPassword(id: string, password: string) {
  const problem = passwordProblem(password);
  if (problem) throw new Error(problem);
  await prisma.user.update({
    where: { id },
    data: { passwordHash: await hashPassword(password), mustChangePassword: false },
  });
  return currentUserById(id);
}

async function currentUserById(id: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id },
    include: { access: { select: { name: true, access: true, main: true } } },
  });
  return toMe(user);
}
