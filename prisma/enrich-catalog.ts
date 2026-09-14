import "dotenv/config";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { readFileSync } from "fs";

const DEFAULT_HTML =
  "/Users/juanstevan/Downloads/Chaleur_Price_List_Mobile_Full.html";

function decode(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&mdash;/g, "—")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;/g, "'")
    .trim();
}

function money(raw: string) {
  const text = decode(raw).replace(/,/g, "");
  if (!text || /no price/i.test(text)) return null;
  const n = Number(text.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function dims(raw: string) {
  const m = decode(raw).match(
    /([\d.]+)\s*W\s*x\s*([\d.]+)\s*D\s*x\s*([\d.]+)\s*H/i,
  );
  if (!m) return null;
  return {
    width: Number(m[1]),
    length: Number(m[2]),
    height: Number(m[3]),
  };
}

function skuOf(raw: string) {
  const sku = decode(raw);
  if (!sku || sku === "—" || sku === "-") return "";
  return sku;
}

type CatalogItem = {
  sid: string;
  name: string;
  sku: string;
  notes: string;
  overall: ReturnType<typeof dims>;
  cutout: ReturnType<typeof dims>;
  cost: number | null;
  b2b: number | null;
  b2c: number | null;
  image: Buffer | null;
};

function parseCatalog(html: string): CatalogItem[] {
  const items: CatalogItem[] = [];
  const block =
    /<details><summary><span class="sid">([^<]*)<\/span><span class="snm">([^<]*)<\/span><\/summary>(.*?)<\/details>/gs;
  for (const match of html.matchAll(block)) {
    const body = match[3];
    const sku = skuOf(body.match(/<div class="sku">([^<]*)<\/div>/)?.[1] ?? "");
    const notes = decode(body.match(/<div class="ds">([^<]*)<\/div>/)?.[1] ?? "");
    let overall = null;
    let cutout = null;
    for (const row of body.matchAll(
      /<span class="dl">([^<]+)<\/span><span class="dv">([^<]+)<\/span>/g,
    )) {
      const parsed = dims(row[2]);
      if (!parsed) continue;
      if (/overall/i.test(row[1])) overall = parsed;
      if (/cutout/i.test(row[1])) cutout = parsed;
    }
    let cost = null;
    let b2b = null;
    let b2c = null;
    for (const row of body.matchAll(
      /<span class="pl">([^<]+)<\/span><span class="(?:pv[^"]*|zero)">([^<]+)<\/span>/g,
    )) {
      const label = decode(row[1]);
      const amount = money(row[2]);
      if (label === "Cost") cost = amount;
      if (label === "Builder Price") b2b = amount;
      if (label === "Customer Price") b2c = amount;
    }
    const img = body.match(/<img src="data:image\/jpeg;base64,([^"]+)"/)?.[1];
    items.push({
      sid: decode(match[1]),
      name: decode(match[2]),
      sku,
      notes,
      overall,
      cutout,
      cost,
      b2b,
      b2c,
      image: img ? Buffer.from(img, "base64") : null,
    });
  }
  return items;
}

function bareName(name: string) {
  return name.replace(/^\d+\s*[-–]\s*/, "").trim().toLowerCase();
}

function hasSidPrefix(name: string, sid: string) {
  return new RegExp(`^${sid}(?:\\s*-\\s*|\\s+)`).test(name);
}

function pickProduct<T extends { id: string; sku: string; code: string; name: string }>(
  item: CatalogItem,
  products: T[],
) {
  if (item.sku) {
    const bySku = products.filter(
      (p) => p.sku.toLowerCase() === item.sku.toLowerCase(),
    );
    if (bySku.length === 1) return bySku[0];
    if (bySku.length > 1) {
      const bySid = bySku.filter(
        (p) =>
          hasSidPrefix(p.name, item.sid) ||
          bareName(p.name) === item.name.toLowerCase(),
      );
      if (bySid.length === 1) return bySid[0];
    }
  }
  const prefixed = products.filter((p) => hasSidPrefix(p.name, item.sid));
  if (prefixed.length === 1) return prefixed[0];
  const byName = products.filter(
    (p) => bareName(p.name) === item.name.toLowerCase(),
  );
  if (byName.length === 1) return byName[0];
  return null;
}

async function main() {
  if (process.argv.includes("--self-check")) {
    const d = dims("27.55W x 18.5D x 18.58H in");
    if (!d || d.width !== 27.55 || d.length !== 18.5 || d.height !== 18.58) {
      throw new Error("dim parse failed");
    }
    if (money("$1,090.00") !== 1090) throw new Error("money parse failed");
    if (money("no price") !== null) throw new Error("no price should be null");
    console.log("ok");
    return;
  }

  const { prisma } = await import("../src/lib/db");
  const htmlPath = process.argv[2] || DEFAULT_HTML;
  const items = parseCatalog(readFileSync(htmlPath, "utf8"));
  await prisma.product.updateMany({
    data: {
      width: null,
      length: null,
      height: null,
      cutoutWidth: null,
      cutoutLength: null,
      cutoutHeight: null,
      b2bPrice: 0,
      b2cPrice: 0,
      fobCost: 0,
      imageUrl: null,
      notes: "Imported from QuickBooks (qty is owned here after this)",
    },
  });
  const products = await prisma.product.findMany();
  const dir = path.join(process.cwd(), "public", "catalog");
  await mkdir(dir, { recursive: true });

  let updated = 0;
  const unmatched: string[] = [];

  for (const [index, item] of items.entries()) {
    const product = pickProduct(item, products);
    if (!product) {
      unmatched.push(`${item.sid} ${item.sku || "—"} ${item.name}`);
      continue;
    }
    let imageUrl: string | undefined;
    if (item.image) {
      const file = `${item.sid}-${(item.sku || String(index)).replace(/[^A-Za-z0-9_-]+/g, "")}.jpg`;
      await writeFile(path.join(dir, file), item.image);
      imageUrl = `/catalog/${file}`;
    }
    await prisma.product.update({
      where: { id: product.id },
      data: {
        ...(item.overall
          ? {
              width: item.overall.width,
              length: item.overall.length,
              height: item.overall.height,
            }
          : {}),
        ...(item.cutout
          ? {
              cutoutWidth: item.cutout.width,
              cutoutLength: item.cutout.length,
              cutoutHeight: item.cutout.height,
            }
          : {}),
        ...(item.cost != null ? { fobCost: item.cost } : {}),
        ...(item.b2b != null ? { b2bPrice: item.b2b } : {}),
        ...(item.b2c != null ? { b2cPrice: item.b2c } : {}),
        ...(item.notes ? { notes: item.notes } : {}),
        ...(imageUrl ? { imageUrl } : {}),
      },
    });
    updated += 1;
  }

  console.log(
    JSON.stringify(
      {
        catalog: items.length,
        updated,
        unmatched: unmatched.length,
        sampleUnmatched: unmatched.slice(0, 12),
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
