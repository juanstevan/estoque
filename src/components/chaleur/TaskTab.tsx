"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { Check, ChevronLeft, ChevronRight, MessageSquare, Minus, Paperclip, Plus } from "lucide-react";
import { Badge, BadgeDot } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataGrid, type GridCol } from "@/components/chaleur/DataGrid";
import { formatDayMonth, formatSmartDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type LabelChip = { name: string; color: string };
type Priority = "none" | "low" | "medium" | "high";
type View = "board" | "list" | "calendar";
type Person = { id: string; name: string };
type CommentRow = {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
};
type FileRow = { id: string; name: string; url: string; size: number };

type TaskRow = {
  id: string;
  listId: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  done: boolean;
  priority: Priority;
  labels: LabelChip[];
  assigneeId: string | null;
  assignee: Person | null;
  attachments: FileRow[];
  comments: CommentRow[];
  position: number;
};

type ListRow = {
  id: string;
  title: string;
  color: string;
  position: number;
  tasks: TaskRow[];
};

type BoardRow = {
  id: string;
  name: string;
  lists: ListRow[];
};

type Summary = { id: string; name: string };
type TaskFlat = TaskRow & { listTitle: string; listColor: string };

const LIST_COLORS = [
  "#5b6472",
  "#2a48c4",
  "#147247",
  "#8a5a00",
  "#b42318",
  "#2239a0",
];

const PRIORITY_META: Record<
  Priority,
  { label: string; variant: "neutral" | "warning" | "danger" } | null
> = {
  none: null,
  low: { label: "Low", variant: "neutral" },
  medium: { label: "Medium", variant: "warning" },
  high: { label: "High", variant: "danger" },
};

let dragGhost: HTMLElement | null = null;

function startCardDrag(el: HTMLElement, e: React.DragEvent) {
  const ghost = el.cloneNode(true) as HTMLElement;
  ghost.style.cssText = [
    "position:absolute",
    "top:-1000px",
    "left:0",
    `width:${el.offsetWidth}px`,
    "transform:rotate(4deg)",
    "box-shadow:0 8px 20px rgb(13 16 21 / 0.14)",
    "pointer-events:none",
  ].join(";");
  document.body.appendChild(ghost);
  e.dataTransfer.setDragImage(
    ghost,
    e.nativeEvent.offsetX,
    e.nativeEvent.offsetY,
  );
  dragGhost = ghost;
}

function endCardDrag() {
  dragGhost?.remove();
  dragGhost = null;
}

function parseLabels(v: unknown): LabelChip[] {
  let raw: unknown = v;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const o = item as { name?: unknown; color?: unknown };
    if (typeof o.name !== "string" || typeof o.color !== "string") return [];
    const name = o.name.trim();
    return name ? [{ name, color: o.color }] : [];
  });
}

function asPriority(v: unknown): Priority {
  return v === "low" || v === "medium" || v === "high" ? v : "none";
}

function parseAttachments(v: unknown): FileRow[] {
  let raw: unknown = v;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const o = item as Record<string, unknown>;
    if (typeof o.id !== "string" || typeof o.name !== "string" || typeof o.url !== "string") {
      return [];
    }
    return [{ id: o.id, name: o.name, url: o.url, size: Number(o.size) || 0 }];
  });
}

function parseComments(v: unknown): CommentRow[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const o = item as Record<string, unknown>;
    if (typeof o.id !== "string" || typeof o.body !== "string") return [];
    return [
      {
        id: o.id,
        authorId: String(o.authorId ?? ""),
        authorName: String(o.authorName ?? "Someone"),
        body: o.body,
        createdAt: String(o.createdAt ?? ""),
      },
    ];
  });
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function Avatar({ name }: { name: string }) {
  return (
    <span
      title={name}
      className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[10px] font-medium text-gray-700"
    >
      {initials(name)}
    </span>
  );
}

function parseBoard(board: BoardRow): BoardRow {
  return {
    ...board,
    lists: board.lists.map((list) => ({
      ...list,
      tasks: list.tasks.map((task) => ({
        ...task,
        listId: task.listId,
        priority: asPriority(task.priority),
        labels: parseLabels(task.labels),
        assigneeId: task.assigneeId ?? task.assignee?.id ?? null,
        assignee: task.assignee ?? null,
        attachments: parseAttachments(task.attachments),
        comments: parseComments(task.comments),
      })),
    })),
  };
}

function flatten(board: BoardRow): TaskFlat[] {
  return board.lists.flatMap((list) =>
    list.tasks.map((task) => ({
      ...task,
      listTitle: list.title,
      listColor: list.color,
    })),
  );
}

function dueDay(iso: string | null) {
  return iso ? iso.slice(0, 10) : "";
}

function todayDay() {
  return format(new Date(), "yyyy-MM-dd");
}

function dueVariant(iso: string | null, done: boolean) {
  if (!iso) return null;
  if (done) return "success" as const;
  const day = dueDay(iso);
  const today = todayDay();
  if (day < today) return "danger" as const;
  if (day === today) return "warning" as const;
  return "neutral" as const;
}

function monthDays(cursor: Date) {
  const start = startOfWeek(startOfMonth(cursor));
  const end = endOfWeek(endOfMonth(cursor));
  const days: Date[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  return days;
}

function LabelChips({ labels }: { labels: LabelChip[] }) {
  if (!labels.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {labels.map((l) => (
        <Badge key={l.name} variant="tag">
          <BadgeDot style={{ background: l.color }} />
          {l.name}
        </Badge>
      ))}
    </div>
  );
}

function PriorityBadge({ priority }: { priority: Priority }) {
  const meta = PRIORITY_META[priority];
  if (!meta) return null;
  return (
    <Badge variant={meta.variant}>
      <BadgeDot />
      {meta.label}
    </Badge>
  );
}

function DueBadge({ due, done }: { due: string | null; done: boolean }) {
  const variant = dueVariant(due, done);
  if (!due || !variant) return null;
  return <Badge variant={variant}>{formatDayMonth(due)}</Badge>;
}

export function TaskTab() {
  const [boards, setBoards] = useState<Summary[]>([]);
  const [board, setBoard] = useState<BoardRow | null>(null);
  const [open, setOpen] = useState<TaskRow | null>(null);
  const [view, setView] = useState<View>("board");
  const [addingList, setAddingList] = useState(false);
  const [addingCard, setAddingCard] = useState<string | null>(null);
  const [editingList, setEditingList] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState(() => new Date());
  const [users, setUsers] = useState<Person[]>([]);
  const dragged = useRef(false);

  function apply(data: {
    boards?: Summary[];
    board?: BoardRow;
    users?: Person[];
    error?: string;
  }) {
    if (data.error || !data.board || !data.boards) return;
    const next = parseBoard(data.board);
    setBoards(data.boards);
    setBoard(next);
    if (data.users) setUsers(data.users);
    setOpen((prev) => {
      if (!prev) return null;
      for (const list of next.lists) {
        const t = list.tasks.find((x) => x.id === prev.id);
        if (t) return t;
      }
      return prev;
    });
  }

  async function load(id?: string | null) {
    const q = id ? `?boardId=${id}` : "";
    const res = await fetch(`/api/tasks${q}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      setError(data.error ?? "Could not load tasks");
      return;
    }
    setError(null);
    apply(data);
  }

  async function post(body: Record<string, unknown>) {
    const data = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => r.json());
    if (data.error) return false;
    apply(data);
    return true;
  }

  useEffect(() => {
    void load();
  }, []);

  const rows = useMemo(() => (board ? flatten(board) : []), [board]);
  const boardLabels = useMemo(() => {
    const seen = new Map<string, LabelChip>();
    for (const row of rows) {
      for (const label of row.labels) {
        if (!seen.has(label.name.toLowerCase())) seen.set(label.name.toLowerCase(), label);
      }
    }
    return [...seen.values()];
  }, [rows]);

  function dropOnList(listId: string, beforeId: string | null, e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    const id = e.dataTransfer.getData("text/plain");
    endCardDrag();
    setDragId(null);
    if (!id || id === beforeId) return;
    void post({ action: "moveTask", id, listId, beforeId });
  }

  if (error) {
    return <p className="text-sm text-danger-text">{error}</p>;
  }
  if (!board) return null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex min-h-10 shrink-0 flex-wrap items-center gap-2">
        {boards.length > 1 && (
          <Select
            value={board.id}
            onValueChange={(v) => void load(String(v))}
          >
            <SelectTrigger className="w-44" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {boards.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Input
          className="h-control-sm max-w-60"
          value={board.name}
          onChange={(e) => setBoard({ ...board, name: e.target.value })}
          onBlur={() =>
            void post({
              action: "renameBoard",
              id: board.id,
              name: board.name,
            })
          }
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
        />
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            void post({ action: "createBoard", name: "New board" })
          }
        >
          <Plus /> Board
        </Button>
        {boards.length > 1 && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void post({ action: "deleteBoard", id: board.id })}
          >
            Delete board
          </Button>
        )}
        <Tabs
          value={view}
          onValueChange={(v) => setView(v as View)}
          className="ml-auto gap-0 self-center shrink-0"
        >
          <TabsList>
            <TabsTrigger value="board">Board</TabsTrigger>
            <TabsTrigger value="list">List</TabsTrigger>
            <TabsTrigger value="calendar">Calendar</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {view === "board" && (
        <BoardView
          board={board}
          addingList={addingList}
          addingCard={addingCard}
          editingList={editingList}
          dragId={dragId}
          dragged={dragged}
          onAddList={setAddingList}
          onAddCard={setAddingCard}
          onEditList={setEditingList}
          onDragId={setDragId}
          onOpen={setOpen}
          onDrop={dropOnList}
          onPost={post}
        />
      )}
      {view === "list" && (
        <ListView
          rows={rows}
          selectedId={open?.id}
          onOpen={setOpen}
          onToggleDone={(task) =>
            void post({ action: "updateTask", id: task.id, done: !task.done })
          }
        />
      )}
      {view === "calendar" && (
        <CalendarView
          rows={rows}
          month={month}
          onMonth={setMonth}
          onOpen={setOpen}
        />
      )}

      <TaskDrawer
        task={open}
        lists={board.lists}
        users={users}
        boardLabels={boardLabels}
        onClose={() => setOpen(null)}
        onSave={(patch, listId) => {
          if (!open) return;
          if (listId && listId !== open.listId) {
            void post({
              action: "moveTask",
              id: open.id,
              listId,
              beforeId: null,
            }).then((ok) => {
              if (ok) void post({ action: "updateTask", id: open.id, ...patch });
            });
            return;
          }
          void post({ action: "updateTask", id: open.id, ...patch });
        }}
        onComment={(body) => {
          if (!open) return;
          void post({ action: "addComment", taskId: open.id, body });
        }}
        onDeleteComment={(id) => void post({ action: "deleteComment", id })}
        onAttach={async (file) => {
          if (!open) return;
          const form = new FormData();
          form.append("file", file);
          const res = await fetch("/api/uploads", { method: "POST", body: form });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) return;
          void post({
            action: "addAttachment",
            taskId: open.id,
            name: data.name ?? file.name,
            url: data.url,
            size: data.size ?? file.size,
          });
        }}
        onDetach={(id) => {
          if (!open) return;
          void post({ action: "deleteAttachment", taskId: open.id, id });
        }}
        onDelete={() => {
          if (!open) return;
          const id = open.id;
          setOpen(null);
          void post({ action: "deleteTask", id });
        }}
      />
    </div>
  );
}

function BoardView({
  board,
  addingList,
  addingCard,
  editingList,
  dragId,
  dragged,
  onAddList,
  onAddCard,
  onEditList,
  onDragId,
  onOpen,
  onDrop,
  onPost,
}: {
  board: BoardRow;
  addingList: boolean;
  addingCard: string | null;
  editingList: string | null;
  dragId: string | null;
  dragged: { current: boolean };
  onAddList: (v: boolean) => void;
  onAddCard: (id: string | null) => void;
  onEditList: (id: string | null) => void;
  onDragId: (id: string | null) => void;
  onOpen: (task: TaskRow) => void;
  onDrop: (listId: string, beforeId: string | null, e: React.DragEvent) => void;
  onPost: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  return (
    <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto">
      {board.lists.map((list) => (
        <div
          key={list.id}
          className="flex w-[264px] shrink-0 flex-col gap-1.5 rounded-xl p-1.5"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => onDrop(list.id, null, e)}
        >
          {editingList === list.id ? (
            <ListEditor
              list={list}
              onDone={(title, color) => {
                onEditList(null);
                if (!title.trim()) return;
                void onPost({
                  action: "updateList",
                  id: list.id,
                  title,
                  color,
                });
              }}
              onRemove={() => {
                onEditList(null);
                void onPost({ action: "deleteList", id: list.id });
              }}
            />
          ) : (
            <button
              type="button"
              className="flex h-10 items-center gap-3 rounded-md px-3 text-left"
              style={{
                color: list.color,
                backgroundColor: `color-mix(in srgb, ${list.color} 5%, transparent)`,
              }}
              onClick={() => onEditList(list.id)}
            >
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {list.title}
              </span>
              <span className="text-xs text-gray-500 tabular-nums">
                {list.tasks.length}
              </span>
            </button>
          )}
          <div className="flex min-h-20 flex-1 flex-col gap-1.5 overflow-y-auto p-1.5">
            {list.tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                dragging={dragId === task.id}
                onOpen={() => {
                  if (dragged.current) {
                    dragged.current = false;
                    return;
                  }
                  onOpen(task);
                }}
                onToggleDone={() =>
                  void onPost({
                    action: "updateTask",
                    id: task.id,
                    done: !task.done,
                  })
                }
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/plain", task.id);
                  e.dataTransfer.effectAllowed = "move";
                  startCardDrag(e.currentTarget, e);
                  onDragId(task.id);
                  dragged.current = true;
                }}
                onDragEnd={() => {
                  endCardDrag();
                  onDragId(null);
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => onDrop(list.id, task.id, e)}
              />
            ))}
            {addingCard === list.id ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const title = String(
                    new FormData(e.currentTarget).get("title") ?? "",
                  ).trim();
                  onAddCard(null);
                  if (title)
                    void onPost({
                      action: "createTask",
                      listId: list.id,
                      title,
                    });
                }}
              >
                <Input
                  autoFocus
                  name="title"
                  className="h-control-sm"
                  placeholder="Task title"
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        e.preventDefault();
                        onAddCard(null);
                      }
                      if (e.key === "Enter") {
                        e.currentTarget.form?.requestSubmit();
                      }
                    }}
                  onBlur={(e) => {
                    const title = e.currentTarget.value.trim();
                    const form = e.currentTarget.form;
                    if (form && title) form.requestSubmit();
                    else onAddCard(null);
                  }}
                />
              </form>
            ) : (
              <button
                type="button"
                className="flex h-8 items-center gap-1.5 px-1 text-xs text-gray-500 hover:text-gray-700"
                onClick={() => onAddCard(list.id)}
              >
                <Plus className="size-3.5" /> Add a card
              </button>
            )}
          </div>
        </div>
      ))}

      {addingList ? (
        <div className="flex w-[264px] shrink-0 flex-col gap-1.5 rounded-xl p-1.5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const title = String(
                new FormData(e.currentTarget).get("title") ?? "",
              ).trim();
              onAddList(false);
              if (!title) return;
              void onPost({
                action: "createList",
                boardId: board.id,
                title,
                color: LIST_COLORS[board.lists.length % LIST_COLORS.length],
              });
            }}
          >
            <Input
              autoFocus
              name="title"
              className="h-10"
              placeholder="List title"
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  onAddList(false);
                }
              }}
              onBlur={(e) => {
                if (e.currentTarget.value.trim())
                  e.currentTarget.form?.requestSubmit();
                else onAddList(false);
              }}
            />
          </form>
        </div>
      ) : (
        <button
          type="button"
          className="flex h-10 w-32 shrink-0 items-center justify-center gap-1.5 text-xs text-gray-500 hover:text-gray-700"
          onClick={() => onAddList(true)}
        >
          <Plus className="size-3.5" /> Add list
        </button>
      )}
    </div>
  );
}

function TaskCard({
  task,
  dragging,
  onOpen,
  onToggleDone,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: {
  task: TaskRow;
  dragging: boolean;
  onOpen: () => void;
  onToggleDone: () => void;
  onDragStart: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  const snippet = task.description?.trim();
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        "cursor-pointer rounded-lg border border-border bg-surface p-3 transition-colors duration-[80ms] hover:border-gray-300",
        dragging && "opacity-35",
        task.done && "opacity-70",
      )}
      role="button"
      tabIndex={0}
    >
      <LabelChips labels={task.labels} />
      <p
        className={cn(
          "text-sm font-medium text-gray-900",
          task.labels.length > 0 && "mt-1.5",
          task.done && "text-gray-500 line-through",
        )}
      >
        {task.title}
      </p>
      {snippet && (
        <p className="mt-1 line-clamp-2 text-xs text-gray-600">{snippet}</p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Checkbox
            checked={task.done}
            aria-label={task.done ? "Mark as not done" : "Mark as done"}
            onCheckedChange={() => onToggleDone()}
          />
        </span>
        <PriorityBadge priority={task.priority} />
        <DueBadge due={task.dueDate} done={task.done} />
        <span className="ml-auto flex items-center gap-2 text-xs text-gray-500">
          {task.comments.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="size-3.5" />
              {task.comments.length}
            </span>
          )}
          {task.attachments.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <Paperclip className="size-3.5" />
              {task.attachments.length}
            </span>
          )}
          {task.assignee && <Avatar name={task.assignee.name} />}
        </span>
      </div>
    </div>
  );
}

function ListView({
  rows,
  selectedId,
  onOpen,
  onToggleDone,
}: {
  rows: TaskFlat[];
  selectedId?: string;
  onOpen: (task: TaskRow) => void;
  onToggleDone: (task: TaskRow) => void;
}) {
  const columns: GridCol<TaskFlat>[] = [
    {
      key: "title",
      label: "Task",
      render: (t) => (
        <span
          className={cn(
            "font-medium text-gray-900",
            t.done && "text-gray-500 line-through",
          )}
        >
          {t.title}
        </span>
      ),
    },
    {
      key: "listTitle",
      label: "List",
      width: "140px",
      render: (t) => (
        <Badge variant="tag">
          <BadgeDot style={{ background: t.listColor }} />
          {t.listTitle}
        </Badge>
      ),
    },
    {
      key: "assigneeId",
      label: "Assignee",
      width: "140px",
      filterValue: (t) => t.assignee?.name ?? "",
      sortValue: (t) => t.assignee?.name ?? "",
      render: (t) =>
        t.assignee ? (
          <span className="inline-flex items-center gap-1.5">
            <Avatar name={t.assignee.name} />
            <span className="truncate">{t.assignee.name}</span>
          </span>
        ) : (
          "—"
        ),
    },
    {
      key: "priority",
      label: "Priority",
      width: "120px",
      render: (t) =>
        t.priority === "none" ? "—" : <PriorityBadge priority={t.priority} />,
    },
    {
      key: "labels",
      label: "Labels",
      width: "200px",
      filterValue: (t) => t.labels.map((l) => l.name).join(" "),
      sortValue: (t) => t.labels.map((l) => l.name).join(" "),
      render: (t) => (t.labels.length ? <LabelChips labels={t.labels} /> : "—"),
    },
    {
      key: "dueDate",
      label: "Due",
      width: "112px",
      sortValue: (t) => dueDay(t.dueDate) || "9999-99-99",
      filterValue: (t) => (t.dueDate ? formatDayMonth(t.dueDate) : ""),
      render: (t) =>
        t.dueDate ? <DueBadge due={t.dueDate} done={t.done} /> : "—",
    },
    {
      key: "done",
      label: "Done",
      width: "72px",
      align: "center",
      filterValue: (t) => (t.done ? "yes" : "no"),
      render: (t) => (
        <span
          className="inline-flex justify-center"
          onClick={(e) => {
            e.stopPropagation();
            onToggleDone(t);
          }}
        >
          <Checkbox checked={t.done} aria-label="Done" />
        </span>
      ),
    },
  ];

  return (
    <DataGrid
      rows={rows}
      columns={columns}
      getRowId={(t) => t.id}
      selectedId={selectedId}
      onRowClick={onOpen}
      empty="No tasks yet"
      emptyHint="Add a card on the board to see it here."
    />
  );
}

function CalendarView({
  rows,
  month,
  onMonth,
  onOpen,
}: {
  rows: TaskFlat[];
  month: Date;
  onMonth: (d: Date) => void;
  onOpen: (task: TaskRow) => void;
}) {
  const days = monthDays(month);
  const byDay = new Map<string, TaskFlat[]>();
  const undated: TaskFlat[] = [];
  for (const row of rows) {
    const day = dueDay(row.dueDate);
    if (!day) {
      undated.push(row);
      continue;
    }
    const list = byDay.get(day) ?? [];
    list.push(row);
    byDay.set(day, list);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex h-10 shrink-0 items-center gap-2">
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Previous month"
          onClick={() => onMonth(addMonths(month, -1))}
        >
          <ChevronLeft />
        </Button>
        <p className="w-44 text-center text-sm font-medium text-gray-900">
          {format(month, "MMMM yyyy")}
        </p>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Next month"
          onClick={() => onMonth(addMonths(month, 1))}
        >
          <ChevronRight />
        </Button>
        <Button size="sm" variant="secondary" onClick={() => onMonth(new Date())}>
          Today
        </Button>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-7 overflow-hidden rounded-lg border border-border bg-surface">
        {days.slice(0, 7).map((d) => (
          <div
            key={`h-${d.toISOString()}`}
            className="border-b border-border bg-sunken px-2 py-2 text-xs font-medium text-gray-600"
          >
            {format(d, "EEE")}
          </div>
        ))}
        {days.map((d) => {
          const key = format(d, "yyyy-MM-dd");
          const items = byDay.get(key) ?? [];
          const extra = items.length > 3 ? items.length - 3 : 0;
          const shown = items.slice(0, 3);
          const inMonth = isSameMonth(d, month);
          return (
            <div
              key={key}
              className={cn(
                "flex min-h-24 flex-col gap-1 border-b border-r border-border p-1.5 [&:nth-child(7n)]:border-r-0",
                !inMonth && "bg-gray-50",
                isToday(d) && "bg-selected",
              )}
            >
              <span
                className={cn(
                  "text-xs tabular-nums",
                  inMonth ? "text-gray-700" : "text-gray-400",
                  isToday(d) && "font-medium text-gray-900",
                )}
              >
                {format(d, "d")}
              </span>
              {shown.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  className={cn(
                    "flex items-center gap-1.5 rounded-sm border border-border bg-surface px-1.5 py-0.5 text-left text-xs text-gray-800 hover:border-gray-300",
                    task.done && "text-gray-500 line-through",
                  )}
                  onClick={() => onOpen(task)}
                >
                  <span
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ background: task.listColor }}
                  />
                  <span className="min-w-0 truncate">{task.title}</span>
                </button>
              ))}
              {extra > 0 && (
                <span className="px-1 text-xs text-gray-500">+{extra}</span>
              )}
            </div>
          );
        })}
      </div>
      {undated.length > 0 && (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <span className="text-xs text-gray-500">No due date</span>
          {undated.map((task) => (
            <button
              key={task.id}
              type="button"
              className="rounded-sm border border-border bg-surface px-2 py-1 text-xs text-gray-800 hover:border-gray-300"
              onClick={() => onOpen(task)}
            >
              {task.title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ListEditor({
  list,
  onDone,
  onRemove,
}: {
  list: ListRow;
  onDone: (title: string, color: string) => void;
  onRemove: () => void;
}) {
  const [title, setTitle] = useState(list.title);
  const [color, setColor] = useState(list.color);
  const [swatches, setSwatches] = useState(false);
  const skip = useRef(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function down(e: PointerEvent) {
      if (skip.current || root.current?.contains(e.target as Node)) return;
      skip.current = true;
      onDone(title, color);
    }
    document.addEventListener("pointerdown", down);
    return () => document.removeEventListener("pointerdown", down);
  }, [title, color, onDone]);

  return (
    <div
      ref={root}
      className="relative rounded-md"
      style={{
        color,
        backgroundColor: `color-mix(in srgb, ${color} 5%, transparent)`,
      }}
    >
      <div className="flex items-center gap-3 py-2.5 pr-2.5 pl-3">
        <input
          autoFocus
          aria-label="List title"
          className="min-w-0 flex-1 rounded-none border-0 border-b border-current/40 bg-transparent pb-0.5 text-sm font-medium outline-none placeholder:text-current/50 focus-visible:border-current"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              skip.current = true;
              onDone(title, color);
            }
            if (e.key === "Escape") {
              skip.current = true;
              onDone(list.title, list.color);
            }
          }}
        />
        <button
          type="button"
          aria-label="List color"
          className="size-4 shrink-0 rounded-full outline-none"
          style={{ background: color }}
          onClick={() => setSwatches((v) => !v)}
        />
        <button
          type="button"
          aria-label="Remove list"
          className="flex size-4 shrink-0 items-center justify-center text-gray-400 outline-none hover:text-gray-700"
          onClick={() => {
            skip.current = true;
            onRemove();
          }}
        >
          <Minus className="size-3.5" />
        </button>
      </div>
      {swatches && (
        <div className="absolute top-[calc(100%+6px)] right-0 z-20 flex items-center gap-2.5 rounded-lg border border-border bg-white p-3 shadow-sm">
          {LIST_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={c}
              className="flex size-5 items-center justify-center rounded-full outline-none"
              style={{ background: c }}
              onClick={() => setColor(c)}
            >
              {color === c && (
                <Check className="size-3 text-white drop-shadow" strokeWidth={3} />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PropRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[96px_1fr] items-center gap-3 py-1">
      <span className="text-sm text-gray-500">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function TaskDrawer({
  task,
  lists,
  users,
  boardLabels,
  onClose,
  onSave,
  onComment,
  onDeleteComment,
  onAttach,
  onDetach,
  onDelete,
}: {
  task: TaskRow | null;
  lists: ListRow[];
  users: Person[];
  boardLabels: LabelChip[];
  onClose: () => void;
  onSave: (
    patch: {
      title?: string;
      description?: string | null;
      dueDate?: string | null;
      done?: boolean;
      priority?: Priority;
      labels?: LabelChip[];
      assigneeId?: string | null;
    },
    listId: string,
  ) => void;
  onComment: (body: string) => void;
  onDeleteComment: (id: string) => void;
  onAttach: (file: File) => void;
  onDetach: (id: string) => void;
  onDelete: () => void;
}) {
  const [form, setForm] = useState<TaskRow | null>(task);
  const [draftName, setDraftName] = useState("");
  const [draftColor, setDraftColor] = useState(LIST_COLORS[0]);
  const [note, setNote] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setForm(task);
    setDraftName("");
    setNote("");
  }, [task]);

  function addLabel() {
    if (!form) return;
    const name = draftName.trim();
    if (!name) return;
    if (form.labels.some((l) => l.name.toLowerCase() === name.toLowerCase())) {
      setDraftName("");
      return;
    }
    setForm({
      ...form,
      labels: [...form.labels, { name, color: draftColor }],
    });
    setDraftName("");
  }

  function toggleLabel(label: LabelChip) {
    if (!form) return;
    const has = form.labels.some(
      (l) => l.name.toLowerCase() === label.name.toLowerCase(),
    );
    setForm({
      ...form,
      labels: has
        ? form.labels.filter(
            (l) => l.name.toLowerCase() !== label.name.toLowerCase(),
          )
        : [...form.labels, label],
    });
  }

  const ghostSelect = "h-control-sm w-full justify-start border-0 px-2 shadow-none hover:bg-gray-50";

  return (
    <Sheet open={Boolean(task)} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-[560px] data-[side=right]:sm:max-w-[560px]">
        {form && (
          <>
            <SheetHeader className="shrink-0 border-b border-border px-6 py-4">
              <SheetTitle className="sr-only">Task</SheetTitle>
              <Input
                id="task-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="h-auto border-0 px-0 text-base font-medium shadow-none focus-visible:border-transparent"
                placeholder="Untitled"
              />
            </SheetHeader>
            <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-auto px-6 py-5">
              <div>
                <PropRow label="Assignee">
                  <Select
                    value={form.assigneeId ?? "none"}
                    onValueChange={(v) => {
                      const id = String(v) === "none" ? null : String(v);
                      setForm({
                        ...form,
                        assigneeId: id,
                        assignee: users.find((u) => u.id === id) ?? null,
                      });
                    }}
                  >
                    <SelectTrigger className={ghostSelect}>
                      <SelectValue>
                        {(v) => {
                          const id = String(v);
                          if (id === "none") return "Empty";
                          return users.find((u) => u.id === id)?.name ?? "Empty";
                        }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Empty</SelectItem>
                      {users.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </PropRow>
                <PropRow label="List">
                  <Select
                    value={form.listId}
                    onValueChange={(v) =>
                      setForm({ ...form, listId: String(v) })
                    }
                  >
                    <SelectTrigger className={ghostSelect}>
                      <SelectValue>
                        {(v) => lists.find((l) => l.id === String(v))?.title ?? ""}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {lists.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </PropRow>
                <PropRow label="Due">
                  <Input
                    type="date"
                    className="h-control-sm border-0 px-2 shadow-none hover:bg-gray-50"
                    value={dueDay(form.dueDate)}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        dueDate: e.target.value || null,
                      })
                    }
                  />
                </PropRow>
                <PropRow label="Priority">
                  <Select
                    value={form.priority}
                    onValueChange={(v) =>
                      setForm({ ...form, priority: asPriority(v) })
                    }
                  >
                    <SelectTrigger className={ghostSelect}>
                      <SelectValue>
                        {(v) => PRIORITY_META[asPriority(v)]?.label ?? "Empty"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Empty</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                </PropRow>
                <PropRow label="Done">
                  <label className="flex items-center gap-2 text-sm text-gray-800">
                    <Checkbox
                      checked={form.done}
                      onCheckedChange={(v) =>
                        setForm({ ...form, done: v === true })
                      }
                    />
                    {form.done ? "Yes" : "No"}
                  </label>
                </PropRow>
                <div className="grid grid-cols-[96px_1fr] items-start gap-3 py-1">
                  <span className="pt-1 text-sm text-gray-500">Labels</span>
                  <div className="grid gap-2">
                    {boardLabels.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {boardLabels.map((label) => {
                          const on = form.labels.some(
                            (l) =>
                              l.name.toLowerCase() === label.name.toLowerCase(),
                          );
                          return (
                            <button
                              key={label.name}
                              type="button"
                              onClick={() => toggleLabel(label)}
                              className={cn("rounded-sm", on ? "" : "opacity-50")}
                            >
                              <Badge variant="tag">
                                <BadgeDot style={{ background: label.color }} />
                                {label.name}
                              </Badge>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Input
                        className="h-control-sm"
                        placeholder="New label"
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addLabel();
                          }
                        }}
                      />
                      <div className="flex items-center gap-1.5">
                        {LIST_COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            aria-label={c}
                            className="flex size-4 items-center justify-center rounded-full outline-none"
                            style={{ background: c }}
                            onClick={() => setDraftColor(c)}
                          >
                            {draftColor === c && (
                              <Check
                                className="size-2.5 text-white"
                                strokeWidth={3}
                              />
                            )}
                          </button>
                        ))}
                      </div>
                      <Button size="sm" variant="ghost" onClick={addLabel}>
                        Add
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <Textarea
                value={form.description ?? ""}
                placeholder="Add a description…"
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                className="min-h-24 border-0 px-0 shadow-none focus-visible:border-transparent"
              />

              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Files</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => fileRef.current?.click()}
                  >
                    <Paperclip /> Add
                  </Button>
                  <input
                    ref={fileRef}
                    type="file"
                    className="hidden"
                    accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) onAttach(file);
                    }}
                  />
                </div>
                {form.attachments.length === 0 ? (
                  <p className="text-xs text-gray-400">None yet</p>
                ) : (
                  form.attachments.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center gap-2 rounded-md border border-border px-3 py-2"
                    >
                      <Paperclip className="size-3.5 text-gray-500" />
                      <a
                        href={file.url}
                        target="_blank"
                        rel="noreferrer"
                        className="min-w-0 flex-1 truncate text-sm text-gray-800 hover:text-gray-900"
                      >
                        {file.name}
                      </a>
                      {file.size > 0 && (
                        <span className="text-xs text-gray-500 tabular-nums">
                          {Math.max(1, Math.round(file.size / 1024))} KB
                        </span>
                      )}
                      <button
                        type="button"
                        aria-label="Remove file"
                        className="text-gray-400 hover:text-gray-700"
                        onClick={() => onDetach(file.id)}
                      >
                        <Minus className="size-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="grid gap-3 border-t border-border pt-5">
                <span className="text-sm text-gray-500">Comments</span>
                {form.comments.map((c) => (
                  <div key={c.id} className="flex gap-2">
                    <Avatar name={c.authorName} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-medium text-gray-900">
                          {c.authorName}
                        </span>
                        <span className="text-xs text-gray-500">
                          {c.createdAt ? formatSmartDate(c.createdAt) : ""}
                        </span>
                        <button
                          type="button"
                          aria-label="Delete comment"
                          className="ml-auto text-gray-400 hover:text-gray-700"
                          onClick={() => onDeleteComment(c.id)}
                        >
                          <Minus className="size-3.5" />
                        </button>
                      </div>
                      <p className="text-sm whitespace-pre-wrap text-gray-700">
                        {c.body}
                      </p>
                    </div>
                  </div>
                ))}
                <form
                  className="grid gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const body = note.trim();
                    if (!body) return;
                    onComment(body);
                    setNote("");
                  }}
                >
                  <Textarea
                    value={note}
                    placeholder="Add a comment…"
                    className="min-h-16"
                    onChange={(e) => setNote(e.target.value)}
                  />
                  <div className="flex justify-end">
                    <Button type="submit" size="sm" disabled={!note.trim()}>
                      Comment
                    </Button>
                  </div>
                </form>
              </div>
            </div>
            <div className="flex h-16 shrink-0 items-center justify-end gap-2 border-t border-border px-6">
              <Button variant="ghost" onClick={onDelete}>
                Delete
              </Button>
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  onSave(
                    {
                      title: form.title,
                      description: form.description,
                      dueDate: form.dueDate,
                      done: form.done,
                      priority: form.priority,
                      labels: form.labels,
                      assigneeId: form.assigneeId,
                    },
                    form.listId,
                  );
                  onClose();
                }}
              >
                Save changes
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
