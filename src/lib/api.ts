import { NextResponse } from "next/server";

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

/**
 * The app's own messages pass through. Database errors (queries, file paths, stack lines) stay in
 * the server log; the answer only says what failed.
 */
export function jsonError(message: string, status = 400) {
  if (/invocation|prisma|\.tsx?:\d+|SELECT |violates|constraint/i.test(message)) {
    console.error(message);
    message = /No record was found|not found/i.test(message) ? "That record no longer exists." : "Something went wrong. Try again.";
  }
  return NextResponse.json({ error: message }, { status });
}

export async function readJson<T>(req: Request): Promise<T> {
  return (await req.json()) as T;
}
