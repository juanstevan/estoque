import { timingSafeEqual } from "crypto";

export function assertQbSecret(req: Request) {
  const secret = process.env.QB_SYNC_SECRET?.trim();
  if (!secret) {
    throw new Error("QB_SYNC_SECRET is not set");
  }
  const got =
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ||
    req.headers.get("x-qb-sync-secret")?.trim() ||
    "";
  const a = Buffer.from(got);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error("Unauthorized");
  }
}
