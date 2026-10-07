import { prisma } from "@/lib/db";
import { FULL_ACCESS, parseAccess, type Access } from "@/lib/access";
import { hashPassword } from "@/lib/password";
import { passwordProblem } from "@/lib/password-rules";

/** Settings › Users. Only the main user calls these (the route checks). */

export async function listPeople() {
  const users = await prisma.user.findMany({
    orderBy: [{ deactivatedAt: { sort: "asc", nulls: "first" } }, { name: "asc" }],
    include: { access: true },
  });
  return users.map((user) => ({
    id: user.id,
    name: user.name,
    username: user.username,
    roleId: user.roleId,
    roleName: user.access?.name ?? null,
    main: Boolean(user.access?.main),
    access: user.access?.main ? FULL_ACCESS : parseAccess(user.access?.access),
    status: user.deactivatedAt ? "off" : user.lastSignInAt ? "active" : "invited",
    lastSignInAt: user.lastSignInAt,
  }));
}

export async function listRoles() {
  const roles = await prisma.role.findMany({
    orderBy: [{ main: "desc" }, { position: "asc" }, { createdAt: "asc" }],
    include: { _count: { select: { users: true } } },
  });
  return roles.map((role) => ({
    id: role.id,
    name: role.name,
    description: role.description,
    main: role.main,
    access: role.main ? FULL_ACCESS : parseAccess(role.access),
    people: role._count.users,
  }));
}

function cleanUsername(raw: string | undefined) {
  const username = (raw ?? "").trim().toLowerCase();
  if (!username) throw new Error("Enter a username");
  if (!/^[a-z0-9._-]{2,32}$/.test(username)) throw new Error("Usernames use 2–32 letters, numbers, dots or dashes");
  return username;
}

async function assertRole(roleId: string | undefined) {
  if (!roleId || !(await prisma.role.findUnique({ where: { id: roleId } }))) throw new Error("Choose a role");
  return roleId;
}

/** Someone must stay able to manage people. */
async function assertAnotherMain(userId: string) {
  const others = await prisma.user.count({
    where: { id: { not: userId }, deactivatedAt: null, access: { main: true } },
  });
  if (!others) throw new Error("Keep at least one active main user.");
}

export async function addPerson(input: { name?: string; username?: string; roleId?: string; password?: string }) {
  const name = input.name?.trim();
  if (!name) throw new Error("Enter their name");
  const username = cleanUsername(input.username);
  if (await prisma.user.findUnique({ where: { username } })) throw new Error(`${username} is already taken`);
  const roleId = await assertRole(input.roleId);
  const problem = passwordProblem(input.password ?? "");
  if (problem) throw new Error(problem);
  await prisma.user.create({
    data: { name, username, roleId, passwordHash: await hashPassword(input.password!), mustChangePassword: true },
  });
}

export async function updatePerson(id: string, input: { name?: string; username?: string; roleId?: string }, meId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id }, include: { access: true } });
  const data: { name?: string; username?: string; roleId?: string } = {};
  if (input.name !== undefined) {
    data.name = input.name.trim();
    if (!data.name) throw new Error("Enter their name");
  }
  if (input.username !== undefined) {
    data.username = cleanUsername(input.username);
    if (data.username !== user.username && (await prisma.user.findUnique({ where: { username: data.username } }))) {
      throw new Error(`${data.username} is already taken`);
    }
  }
  if (input.roleId !== undefined && input.roleId !== user.roleId) {
    data.roleId = await assertRole(input.roleId);
    const next = await prisma.role.findUniqueOrThrow({ where: { id: data.roleId } });
    if (user.access?.main && !next.main) {
      if (id === meId) throw new Error("You can't take away your own main role.");
      await assertAnotherMain(id);
    }
  }
  await prisma.user.update({ where: { id }, data });
}

/** A new temporary password: they choose their own at the next sign-in. Signs them out everywhere. */
export async function resetPassword(id: string, password: string) {
  const problem = passwordProblem(password);
  if (problem) throw new Error(problem);
  await prisma.$transaction([
    prisma.user.update({
      where: { id },
      data: { passwordHash: await hashPassword(password), mustChangePassword: true, failedSignIns: 0, lockedUntil: null },
    }),
    prisma.session.deleteMany({ where: { userId: id } }),
  ]);
}

export async function setActive(id: string, active: boolean, meId: string) {
  if (!active) {
    if (id === meId) throw new Error("You can't turn off your own account.");
    const user = await prisma.user.findUniqueOrThrow({ where: { id }, include: { access: true } });
    if (user.access?.main) await assertAnotherMain(id);
  }
  await prisma.$transaction([
    prisma.user.update({ where: { id }, data: { deactivatedAt: active ? null : new Date() } }),
    ...(active ? [] : [prisma.session.deleteMany({ where: { userId: id } })]),
  ]);
}

function cleanAccess(raw: Partial<Access> | undefined) {
  return JSON.stringify(parseAccess(JSON.stringify(raw ?? {})));
}

/** Creates a role (no access to anything until set) or saves one. The main role stays as it is. */
export async function saveRole(input: { id?: string; name?: string; description?: string; access?: Partial<Access> }) {
  const existing = input.id ? await prisma.role.findUniqueOrThrow({ where: { id: input.id } }) : null;
  if (existing?.main) throw new Error("The main user always has full access.");
  const name = input.name?.trim() ?? existing?.name ?? "";
  if (!name) throw new Error("Name the role");
  const clash = await prisma.role.findFirst({ where: { name: { equals: name, mode: "insensitive" }, id: { not: existing?.id } } });
  if (clash) throw new Error(`There is already a role called ${clash.name}`);
  const data = {
    name,
    description: input.description === undefined ? undefined : input.description.trim(),
    access: input.access === undefined ? undefined : cleanAccess(input.access),
  };
  if (existing) return prisma.role.update({ where: { id: existing.id }, data });
  const last = await prisma.role.findFirst({ orderBy: { position: "desc" } });
  return prisma.role.create({ data: { ...data, access: data.access ?? "{}", position: (last?.position ?? 0) + 1 } });
}

/** People on the role move to `moveTo` first. */
export async function deleteRole(id: string, moveTo?: string) {
  const role = await prisma.role.findUniqueOrThrow({ where: { id }, include: { _count: { select: { users: true } } } });
  if (role.main) throw new Error("The main role can't be deleted.");
  if (role._count.users) {
    if (!moveTo || moveTo === id) throw new Error("Choose a role for the people who have this one");
    await assertRole(moveTo);
  }
  await prisma.$transaction([
    prisma.user.updateMany({ where: { roleId: id }, data: { roleId: moveTo } }),
    prisma.role.delete({ where: { id } }),
  ]);
}
