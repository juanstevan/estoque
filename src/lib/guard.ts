import { jsonError } from "@/lib/api";
import { can, type Area } from "@/lib/access";
import { currentUser, type Me } from "@/lib/auth";

/**
 * For API routes: the signed-in person when their role reaches `need` on any of `area`,
 * otherwise the error response to return. `area: null` only needs someone signed in.
 *
 *   const me = await guard("delivery", "edit");
 *   if (me instanceof Response) return me;
 */
export async function guard(area: Area | Area[] | null, need: "view" | "edit" = "view"): Promise<Me | Response> {
  const me = await currentUser();
  if (!me) return jsonError("Sign in first", 401);
  if (me.mustChangePassword) return jsonError("Choose your own password first", 403);
  if (area && !can(me.access, area, need)) {
    return jsonError(
      need === "edit"
        ? "Your role can only view this. Ask your main user for edit access."
        : "Your role doesn't include this. Ask your main user for access.",
      403,
    );
  }
  return me;
}

/** The error response when access is missing, else null. For routes that don't need the person. */
export async function deny(area: Area | Area[] | null, need: "view" | "edit" = "view") {
  const me = await guard(area, need);
  return me instanceof Response ? me : null;
}

/** Only the main user manages people, roles and hidden tabs. */
export async function guardMain(): Promise<Me | Response> {
  const me = await guard(null);
  if (me instanceof Response) return me;
  return me.main ? me : jsonError("Only the main user can do this.", 403);
}
