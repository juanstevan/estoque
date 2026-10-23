import "dotenv/config";
import { readFileSync } from "node:fs";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { databaseUrl } from "../src/lib/database-url";

type Description = { family: string; doc: unknown };
type Source = { brand: string; category: string; descriptions: Description[] };
type DoorSource = { brand: string; category: string; doc: unknown };

const grill = JSON.parse(readFileSync(new URL("./notion-family-descriptions.json", import.meta.url), "utf8")) as Source;
const door = JSON.parse(readFileSync(new URL("./notion-door-description.json", import.meta.url), "utf8")) as DoorSource;
const descriptions = [
  ...grill.descriptions.map(({ family, doc }) => ({ brand: grill.brand, category: grill.category, family, doc })),
  { brand: door.brand, category: door.category, family: "", doc: door.doc },
];

function isPlaceholder(content: string) {
  try {
    const doc = JSON.parse(content) as { content?: { type?: string; content?: { text?: string }[] }[] };
    return doc.content?.length === 1 && doc.content[0]?.type === "paragraph" && doc.content[0].content?.length === 1 && doc.content[0].content[0]?.text === "Teste";
  } catch {
    return false;
  }
}

async function main() {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl() }) });
  try {
    for (const { brand, category, family, doc } of descriptions) {
      const scope = family ? "family" : "category";
      const label = `${brand} / ${category}${family ? ` / ${family}` : ""}`;
      const product = await db.product.findFirst({ where: { type: brand, category, ...(family ? { model: family } : {}) }, select: { id: true } });
      if (!product) throw new Error(`No product found for ${label}`);

      const where = { scope_brand_category_family: { scope, brand, category, family } };
      let section = await db.catalogSection.findUnique({ where });
      if (!section) {
        try {
          section = await db.catalogSection.create({ data: { scope, brand, category, family } });
        } catch (error) {
          if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
          section = await db.catalogSection.findUniqueOrThrow({ where });
        }
      }

      const content = JSON.stringify(doc);
      const current = await db.catalogText.findUnique({ where: { sectionId: section.id } });
      if (current?.content === content) {
        process.stdout.write(`Already imported: ${label}\n`);
      } else if (current && !isPlaceholder(current.content)) {
        process.stdout.write(`Skipped existing description: ${label}\n`);
      } else if (current) {
        await db.catalogText.update({ where: { id: current.id }, data: { content } });
        process.stdout.write(`Replaced test placeholder: ${label}\n`);
      } else {
        await db.catalogText.create({ data: { sectionId: section.id, brand, category, family: family || null, content } });
        process.stdout.write(`Imported: ${label}\n`);
      }
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
