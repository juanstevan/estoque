import { prisma } from "@/lib/db";
import { jsonError, jsonOk, readJson } from "@/lib/api";

export async function GET() {
  const settings = await prisma.appSettings.findUnique({ where: { id: "default" } });
  const suppliers = await prisma.supplier.findMany({ orderBy: { name: "asc" } });
  return jsonOk({ settings, suppliers });
}

export async function POST(req: Request) {
  try {
    const body = await readJson<{
      companyName?: string;
      logoUrl?: string | null;
      adjustmentReasons?: string[];
      suppliers?: string[];
    }>(req);
    const settings = await prisma.appSettings.upsert({
      where: { id: "default" },
      update: {
        companyName: body.companyName,
        logoUrl: body.logoUrl,
        adjustmentReasons: body.adjustmentReasons
          ? JSON.stringify(body.adjustmentReasons)
          : undefined,
      },
      create: {
        id: "default",
        companyName: body.companyName ?? "Chaleur Manufacturing Co.",
      },
    });
    if (body.suppliers) {
      await prisma.supplier.deleteMany();
      await prisma.supplier.createMany({
        data: body.suppliers.filter(Boolean).map((name) => ({ name })),
      });
    }
    const suppliers = await prisma.supplier.findMany({ orderBy: { name: "asc" } });
    return jsonOk({ settings, suppliers });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Settings error", 400);
  }
}
