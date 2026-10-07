import { chooseOwnPassword, currentUser, signIn, signOut, updateProfile } from "@/lib/auth";
import { jsonError, jsonOk, readJson } from "@/lib/api";

export async function GET() {
  const me = await currentUser();
  if (!me) return jsonError("Sign in first", 401);
  return jsonOk(me);
}

export async function POST(req: Request) {
  const body = await readJson<{
    action?: "login" | "logout" | "profile" | "password";
    name?: string;
    username?: string;
    password?: string;
    currentPassword?: string;
    remember?: boolean;
  }>(req).catch(() => ({}) as Record<string, never>);
  try {
    if (body.action === "logout") {
      await signOut();
      return jsonOk({ ok: true });
    }
    if (body.action === "profile" || body.action === "password") {
      const me = await currentUser();
      if (!me) return jsonError("Sign in first", 401);
      if (body.action === "password") {
        if (!me.mustChangePassword) return jsonError("Change your password in Settings › Profile.", 400);
        return jsonOk(await chooseOwnPassword(me.id, body.password ?? ""));
      }
      if (me.mustChangePassword) return jsonError("Choose your own password first", 403);
      return jsonOk(await updateProfile(me.id, body));
    }
    return jsonOk(await signIn(body.username ?? "", body.password ?? "", Boolean(body.remember)));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Couldn't sign in";
    return jsonError(message, body.action === "profile" || body.action === "password" ? 400 : 401);
  }
}
