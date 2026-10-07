import "dotenv/config";
import { prisma } from "../src/lib/db";
import { FULL_ACCESS } from "../src/lib/access";
import { hashPassword } from "../src/lib/password";

/** Runs on every build: the settings row, the main role, and a first account on an empty install. */
async function main() {
  await prisma.appSettings.upsert({
    where: { id: "default" },
    create: { id: "default" },
    update: {},
  });
  await prisma.role.upsert({
    where: { id: "main" },
    create: { id: "main", name: "Main user", description: "Full access, always", main: true, access: JSON.stringify(FULL_ACCESS) },
    update: {},
  });
  if (await prisma.user.count()) return;
  // Only on an empty install. The temporary password must be replaced at the first sign-in.
  await prisma.user.create({
    data: {
      username: "admin",
      name: "Admin",
      passwordHash: await hashPassword("chaleur"),
      roleId: "main",
      mustChangePassword: true,
    },
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
