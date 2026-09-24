import { jsonError, jsonOk, readJson } from "@/lib/api";
import { currentUser } from "@/lib/auth";
import {
  assignProducts,
  createGroup,
  deleteGroup,
  listGroups,
  moveGroup,
  renameGroup,
} from "@/lib/photos/groups";

export async function GET() {
  if (!(await currentUser())) return jsonError("Unauthorized", 401);
  return jsonOk(await listGroups());
}

export async function POST(req: Request) {
  if (!(await currentUser())) return jsonError("Unauthorized", 401);
  try {
    const body = await readJson<{
      action?: "create" | "rename" | "move" | "delete" | "assign";
      id?: string;
      name?: string;
      parentId?: string | null;
      groupId?: string | null;
      productIds?: string[];
    }>(req);
    if (body.action === "create") {
      const created = await createGroup(body.name ?? "", body.parentId || null);
      return jsonOk({ ...(await listGroups()), created: created.id });
    }
    if (body.action === "assign") {
      await assignProducts(body.productIds ?? [], body.groupId || null);
      return jsonOk(await listGroups());
    }
    if (!body.id) return jsonError("id is required");
    if (body.action === "rename") await renameGroup(body.id, body.name ?? "");
    else if (body.action === "move") await moveGroup(body.id, body.parentId || null);
    else if (body.action === "delete") await deleteGroup(body.id);
    else return jsonError("Unknown action");
    return jsonOk(await listGroups());
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Group update failed", 400);
  }
}
