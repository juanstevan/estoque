import "dotenv/config";
import { createHash } from "crypto";
import { prisma } from "../src/lib/db";

function hashPassword(password: string) {
  return createHash("sha256").update(password).digest("hex");
}

async function main() {
  await prisma.appSettings.upsert({
    where: { id: "default" },
    create: { id: "default" },
    update: {},
  });
  await prisma.user.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      username: "admin",
      name: "Juan Souza",
      passwordHash: hashPassword("chaleur"),
      role: "admin",
    },
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
