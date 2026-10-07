import { createHash, randomBytes, scrypt, timingSafeEqual } from "crypto";

function derive(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) =>
    scrypt(password, salt, 32, (error, key) => (error ? reject(error) : resolve(key))),
  );
}

/** `scrypt$<salt hex>$<hash hex>` */
export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("hex")}$${(await derive(password, salt)).toString("hex")}`;
}

/** Also accepts the unsalted SHA-256 hashes from before; those get replaced on sign-in. */
export async function checkPassword(password: string, stored: string) {
  const [kind, salt, hash] = stored.split("$");
  const got = kind === "scrypt" && salt && hash
    ? await derive(password, Buffer.from(salt, "hex"))
    : createHash("sha256").update(password).digest();
  const want = Buffer.from(kind === "scrypt" ? hash ?? "" : stored, "hex");
  return want.length === got.length && timingSafeEqual(want, got);
}

export function isLegacyHash(stored: string) {
  return !stored.startsWith("scrypt$");
}
