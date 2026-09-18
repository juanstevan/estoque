import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";

const DEFAULT_LISTS = [
  { title: "To do", color: "#5b6472", position: 1000 },
  { title: "Doing", color: "#2a48c4", position: 2000 },
  { title: "Done", color: "#147247", position: 3000 },
];

function between(prev: number | null, next: number | null) {
  if (prev == null && next == null) return 1000;
  if (prev == null) return next! / 2;
  if (next == null) return prev + 1000;
  return (prev + next) / 2;
}

const boardInclude = {
  lists: {
    orderBy: { position: "asc" as const },
    include: {
      tasks: {
        orderBy: { position: "asc" as const },
        include: {
          comments: { orderBy: { createdAt: "asc" as const } },
          assignee: { select: { id: true, name: true } },
        },
      },
    },
  },
};

async function people() {
  return prisma.user.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

async function boardSummaries() {
  return prisma.taskBoard.findMany({
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });
}

async function ensureBoard(boardId?: string | null) {
  const existing = await prisma.taskBoard.findMany({
    orderBy: { createdAt: "asc" },
    include: boardInclude,
  });
  if (existing.length === 0) {
    const created = await prisma.taskBoard.create({
      data: {
        name: "Tasks",
        lists: { create: DEFAULT_LISTS },
      },
      include: boardInclude,
    });
    return created;
  }
  return existing.find((b) => b.id === boardId) ?? existing[0];
}

export async function getTaskWorkspace(boardId?: string | null) {
  const board = await ensureBoard(boardId);
  return { boards: await boardSummaries(), board, users: await people() };
}

export async function createBoard(name: string) {
  const board = await prisma.taskBoard.create({
    data: {
      name: name.trim() || "Untitled",
      lists: { create: DEFAULT_LISTS },
    },
    include: boardInclude,
  });
  return { boards: await boardSummaries(), board, users: await people() };
}

export async function renameBoard(id: string, name: string) {
  const board = await prisma.taskBoard.update({
    where: { id },
    data: { name: name.trim() || "Untitled" },
    include: boardInclude,
  });
  return { boards: await boardSummaries(), board, users: await people() };
}

export async function deleteBoard(id: string) {
  await prisma.taskBoard.delete({ where: { id } });
  const board = await ensureBoard();
  return { boards: await boardSummaries(), board, users: await people() };
}

export async function createList(boardId: string, title: string, color?: string) {
  const last = await prisma.taskList.findFirst({
    where: { boardId },
    orderBy: { position: "desc" },
  });
  await prisma.taskList.create({
    data: {
      boardId,
      title: title.trim() || "List",
      color: color || "#5b6472",
      position: (last?.position ?? 0) + 1000,
    },
  });
  return getTaskWorkspace(boardId);
}

export async function updateList(
  id: string,
  data: { title?: string; color?: string },
) {
  const list = await prisma.taskList.update({
    where: { id },
    data: {
      title: data.title?.trim() || undefined,
      color: data.color,
    },
  });
  return getTaskWorkspace(list.boardId);
}

export async function deleteList(id: string) {
  const list = await prisma.taskList.delete({ where: { id } });
  return getTaskWorkspace(list.boardId);
}

export async function createTask(listId: string, title: string) {
  const last = await prisma.task.findFirst({
    where: { listId },
    orderBy: { position: "desc" },
  });
  const task = await prisma.task.create({
    data: {
      listId,
      title: title.trim(),
      position: (last?.position ?? 0) + 1000,
    },
    include: { list: true },
  });
  return getTaskWorkspace(task.list.boardId);
}

const PRIORITIES = new Set(["none", "low", "medium", "high"]);

function labelsJson(labels: { name: string; color: string }[]) {
  return JSON.stringify(
    labels
      .filter((l) => l.name.trim())
      .map((l) => ({ name: l.name.trim(), color: l.color })),
  );
}

export async function updateTask(
  id: string,
  data: {
    title?: string;
    description?: string | null;
    dueDate?: string | null;
    done?: boolean;
    priority?: string;
    labels?: { name: string; color: string }[];
    assigneeId?: string | null;
  },
) {
  const task = await prisma.task.update({
    where: { id },
    data: {
      title: data.title?.trim() || undefined,
      description: data.description,
      dueDate:
        data.dueDate === undefined
          ? undefined
          : data.dueDate
            ? new Date(data.dueDate)
            : null,
      done: data.done,
      priority:
        data.priority && PRIORITIES.has(data.priority)
          ? data.priority
          : undefined,
      labels: data.labels !== undefined ? labelsJson(data.labels) : undefined,
      assigneeId: data.assigneeId === undefined ? undefined : data.assigneeId,
    },
    include: { list: true },
  });
  return getTaskWorkspace(task.list.boardId);
}

export async function moveTask(
  id: string,
  listId: string,
  beforeId?: string | null,
) {
  const others = await prisma.task.findMany({
    where: { listId, id: { not: id } },
    orderBy: { position: "asc" },
  });
  let prev: number | null = null;
  let next: number | null = null;
  if (!beforeId) {
    prev = others.at(-1)?.position ?? null;
  } else {
    const i = others.findIndex((t) => t.id === beforeId);
    next = i >= 0 ? others[i].position : null;
    prev = i > 0 ? others[i - 1].position : null;
  }
  const task = await prisma.task.update({
    where: { id },
    data: { listId, position: between(prev, next) },
    include: { list: true },
  });
  return getTaskWorkspace(task.list.boardId);
}

export async function deleteTask(id: string) {
  const task = await prisma.task.delete({
    where: { id },
    include: { list: true },
  });
  return getTaskWorkspace(task.list.boardId);
}

type Attachment = { id: string; name: string; url: string; size: number };

function parseAttachments(raw: string): Attachment[] {
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    return v.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const o = item as Record<string, unknown>;
      if (typeof o.id !== "string" || typeof o.name !== "string" || typeof o.url !== "string") {
        return [];
      }
      return [{ id: o.id, name: o.name, url: o.url, size: Number(o.size) || 0 }];
    });
  } catch {
    return [];
  }
}

async function workspaceForTask(id: string) {
  const task = await prisma.task.findUnique({
    where: { id },
    include: { list: true },
  });
  if (!task) throw new Error("Task not found");
  return getTaskWorkspace(task.list.boardId);
}

export async function addComment(
  taskId: string,
  body: string,
  author: { id: string; name: string },
) {
  const text = body.trim();
  if (!text) throw new Error("Comment is empty");
  await prisma.taskComment.create({
    data: {
      taskId,
      body: text,
      authorId: author.id,
      authorName: author.name,
    },
  });
  return workspaceForTask(taskId);
}

export async function deleteComment(id: string) {
  const row = await prisma.taskComment.delete({
    where: { id },
    include: { task: { include: { list: true } } },
  });
  return getTaskWorkspace(row.task.list.boardId);
}

export async function addAttachment(
  taskId: string,
  file: { name: string; url: string; size: number },
) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw new Error("Task not found");
  const attachments = parseAttachments(task.attachments);
  attachments.push({
    id: randomUUID(),
    name: file.name.trim() || "File",
    url: file.url,
    size: file.size || 0,
  });
  await prisma.task.update({
    where: { id: taskId },
    data: { attachments: JSON.stringify(attachments) },
  });
  return workspaceForTask(taskId);
}

export async function deleteAttachment(taskId: string, id: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw new Error("Task not found");
  const attachments = parseAttachments(task.attachments).filter((a) => a.id !== id);
  await prisma.task.update({
    where: { id: taskId },
    data: { attachments: JSON.stringify(attachments) },
  });
  return workspaceForTask(taskId);
}
