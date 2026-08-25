import { login, logout, currentUser } from "@/lib/auth";
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
      await logout();
      return jsonOk({ ok: true });
    }
    const user = await login(body.username ?? "", body.password ?? "");
    return jsonOk(user);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Auth error", 401);
  }
}
