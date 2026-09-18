import { jsonError, jsonOk, readJson } from "@/lib/api";
import { currentUser } from "@/lib/auth";
import {
  addAttachment,
  addComment,
  createBoard,
  createList,
  createTask,
  deleteAttachment,
  deleteBoard,
  deleteComment,
  deleteList,
  deleteTask,
  getTaskWorkspace,
  moveTask,
  renameBoard,
  updateList,
  updateTask,
} from "@/lib/tasks";

async function pack(data: Awaited<ReturnType<typeof getTaskWorkspace>>) {
  const me = await currentUser();
  return {
    ...data,
    me: me ? { id: me.id, name: me.name } : null,
  };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    return jsonOk(await pack(await getTaskWorkspace(searchParams.get("boardId"))));
  } catch (e) {
    return jsonError(
      e instanceof Error ? e.message : "Could not load tasks",
      500,
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await readJson<{
      action:
        | "createBoard"
        | "renameBoard"
        | "deleteBoard"
        | "createList"
        | "updateList"
        | "deleteList"
        | "createTask"
        | "updateTask"
        | "moveTask"
        | "deleteTask"
        | "addComment"
        | "deleteComment"
        | "addAttachment"
        | "deleteAttachment";
      id?: string;
      boardId?: string;
      listId?: string;
      taskId?: string;
      beforeId?: string | null;
      name?: string;
      title?: string;
      color?: string;
      description?: string | null;
      dueDate?: string | null;
      done?: boolean;
      priority?: string;
      labels?: { name: string; color: string }[];
      assigneeId?: string | null;
      body?: string;
      url?: string;
      size?: number;
    }>(req);

    if (body.action === "createBoard") {
      return jsonOk(await pack(await createBoard(body.name ?? "Untitled")));
    }
    if (body.action === "renameBoard" && body.id) {
      return jsonOk(await pack(await renameBoard(body.id, body.name ?? "")));
    }
    if (body.action === "deleteBoard" && body.id) {
      return jsonOk(await pack(await deleteBoard(body.id)));
    }
    if (body.action === "createList" && body.boardId) {
      return jsonOk(
        await pack(await createList(body.boardId, body.title ?? "List", body.color)),
      );
    }
    if (body.action === "updateList" && body.id) {
      return jsonOk(
        await pack(await updateList(body.id, { title: body.title, color: body.color })),
      );
    }
    if (body.action === "deleteList" && body.id) {
      return jsonOk(await pack(await deleteList(body.id)));
    }
    if (body.action === "createTask" && body.listId && body.title?.trim()) {
      return jsonOk(await pack(await createTask(body.listId, body.title)));
    }
    if (body.action === "updateTask" && body.id) {
      return jsonOk(
        await pack(
          await updateTask(body.id, {
            title: body.title,
            description: body.description,
            dueDate: body.dueDate,
            done: body.done,
            priority: body.priority,
            labels: body.labels,
            assigneeId: body.assigneeId,
          }),
        ),
      );
    }
    if (body.action === "moveTask" && body.id && body.listId) {
      return jsonOk(await pack(await moveTask(body.id, body.listId, body.beforeId)));
    }
    if (body.action === "deleteTask" && body.id) {
      return jsonOk(await pack(await deleteTask(body.id)));
    }
    if (body.action === "addComment" && body.taskId && body.body?.trim()) {
      const me = await currentUser();
      if (!me) return jsonError("Unauthorized", 401);
      return jsonOk(
        await pack(
          await addComment(body.taskId, body.body, { id: me.id, name: me.name }),
        ),
      );
    }
    if (body.action === "deleteComment" && body.id) {
      return jsonOk(await pack(await deleteComment(body.id)));
    }
    if (body.action === "addAttachment" && body.taskId && body.url && body.name) {
      return jsonOk(
        await pack(
          await addAttachment(body.taskId, {
            name: body.name,
            url: body.url,
            size: body.size ?? 0,
          }),
        ),
      );
    }
    if (body.action === "deleteAttachment" && body.taskId && body.id) {
      return jsonOk(await pack(await deleteAttachment(body.taskId, body.id)));
    }
    return jsonError("Unknown action");
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Task error", 400);
  }
}
