import {
  login,
  logout,
  currentUser,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth";
import { jsonError, jsonOk, readJson } from "@/lib/api";

export async function GET() {
  const user = await currentUser();
  if (!user) return jsonError("Unauthorized", 401);
  return jsonOk({
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
  });
}

export async function POST(req: Request) {
  try {
    const body = await readJson<{
      action?: "login" | "logout";
      username?: string;
      password?: string;
    }>(req);
    if (body.action === "logout") {
      const res = jsonOk({ ok: true });
      res.cookies.delete(SESSION_COOKIE);
      return res;
    }
    const user = await login(body.username ?? "", body.password ?? "");
    const res = jsonOk(user);
    res.cookies.set(SESSION_COOKIE, user.id, sessionCookieOptions());
    return res;
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Auth error", 401);
  }
}
