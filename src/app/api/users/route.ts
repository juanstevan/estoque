import { jsonError, jsonOk, readJson } from "@/lib/api";
import type { Access } from "@/lib/access";
import { guardMain } from "@/lib/guard";
import {
  addPerson,
  deleteRole,
  listPeople,
  listRoles,
  resetPassword,
  saveRole,
  setActive,
  updatePerson,
} from "@/lib/users";

async function everything() {
  const [people, roles] = await Promise.all([listPeople(), listRoles()]);
  return { people, roles };
}

export async function GET() {
  const me = await guardMain();
  if (me instanceof Response) return me;
  return jsonOk(await everything());
}

export async function POST(req: Request) {
  const me = await guardMain();
  if (me instanceof Response) return me;
  try {
    const body = await readJson<{
      action: "add" | "update" | "reset" | "activate" | "deactivate" | "save-role" | "delete-role";
      id?: string;
      name?: string;
      username?: string;
      roleId?: string;
      password?: string;
      description?: string;
      access?: Partial<Access>;
      moveTo?: string;
    }>(req);
    const id = body.id ?? "";
    if (body.action === "add") await addPerson(body);
    else if (body.action === "update") await updatePerson(id, body, me.id);
    else if (body.action === "reset") await resetPassword(id, body.password ?? "");
    else if (body.action === "activate" || body.action === "deactivate") await setActive(id, body.action === "activate", me.id);
    else if (body.action === "save-role") {
      const role = await saveRole(body);
      return jsonOk({ ...(await everything()), savedRoleId: role.id });
    } else if (body.action === "delete-role") await deleteRole(id, body.moveTo);
    else return jsonError("Unknown action", 400);
    return jsonOk(await everything());
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Couldn't save", 400);
  }
}
