"use client";

import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Heading1, Heading2, Heading3, Italic, List, ListOrdered, Pilcrow } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { RichNode } from "@/lib/catalog/rich-text";
import type { TextOwnerInfo } from "@/lib/catalog/text";
import { cn } from "@/lib/utils";

/** Headings 1–3, paragraphs, lists, bold and italic; nothing else is kept when saving. */
const EXTENSIONS = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    blockquote: false,
    code: false,
    codeBlock: false,
    horizontalRule: false,
    strike: false,
    underline: false,
    link: false,
  }),
];

export type DescriptionOwner = { productId?: string; tagId?: string };

/** Saves a description to its owner (the Tag's when the product has one). */
export async function saveDescription(owner: DescriptionOwner, content: unknown) {
  const res = await fetch("/api/catalog", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "text", ...owner, content }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Couldn't save the description");
  return data as { owner: TextOwnerInfo; doc: RichNode | null };
}

function sharedNote(owner: TextOwnerInfo) {
  if (owner.kind === "tag") {
    return owner.products === 1
      ? `Shared with every product added to ${owner.name}`
      : `Shared by all ${owner.products} products in ${owner.name}`;
  }
  return owner.kind === "product" ? "Only this product (it has no Tag)" : null;
}

/**
 * The catalog description of a product or model: one text per Tag, shared by its products, or per
 * product while it has no Tag. It's always editable. `onChange` hands pending edits to a window
 * that saves with its own button; without it, the text saves when the editor loses focus and Esc
 * puts back the saved one.
 */
export function CatalogDescription({
  owner,
  className,
  aside,
  onChange,
}: {
  owner: DescriptionOwner;
  className?: string;
  aside?: React.ReactNode;
  onChange?: (content: unknown) => void;
}) {
  const [info, setInfo] = useState<TextOwnerInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const saved = useRef<RichNode | null>(null);
  const dirty = useRef(false);
  const query = owner.tagId ? `tagId=${encodeURIComponent(owner.tagId)}` : `productId=${encodeURIComponent(owner.productId ?? "")}`;

  const editor = useEditor({
    extensions: EXTENSIONS,
    immediatelyRender: false,
    editable: false,
    editorProps: {
      attributes: { class: "rich-text min-h-full px-3 py-2 text-sm text-gray-900 outline-none", "aria-label": "Description" },
    },
    onUpdate: ({ editor: e }) => {
      dirty.current = true;
      onChange?.(e.getJSON());
    },
  });

  useEffect(() => {
    if (!editor) return;
    let live = true;
    setInfo(null);
    setError(null);
    editor.setEditable(false);
    fetch(`/api/catalog?${query}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Couldn't load the description");
        if (!live) return;
        saved.current = data.doc;
        dirty.current = false;
        editor.commands.setContent(data.doc ?? "", { emitUpdate: false });
        editor.setEditable(true);
        setInfo(data.owner);
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : "Couldn't load the description"));
    return () => {
      live = false;
    };
  }, [editor, query]);

  async function saveNow() {
    if (!editor || !dirty.current) return;
    dirty.current = false;
    setError(null);
    try {
      const result = await saveDescription(owner, editor.getJSON());
      saved.current = result.doc;
    } catch (e) {
      dirty.current = true;
      setError(e instanceof Error ? e.message : "Couldn't save the description");
    }
  }

  const note = info ? sharedNote(info) : null;
  return (
    <section aria-label="Description" className={cn("flex min-h-0 flex-col gap-2", className)}>
      <div className="flex min-h-7 items-center gap-2">
        <p className="text-2xs font-medium tracking-caps text-gray-500 uppercase">Description</p>
        {note && <p className="min-w-0 truncate text-2xs text-gray-500">· {note}</p>}
        {aside && <div className="ml-auto flex shrink-0 items-center gap-1">{aside}</div>}
      </div>
      {error && <p className="text-xs text-danger-text">{error}</p>}
      <div
        className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[10px] border border-gray-200 bg-surface focus-within:border-gray-400"
        onBlur={(e) => {
          if (!onChange && !e.currentTarget.contains(e.relatedTarget)) void saveNow();
        }}
        onKeyDown={(e) => {
          if (onChange || e.key !== "Escape" || !editor) return;
          e.stopPropagation();
          editor.commands.setContent(saved.current ?? "", { emitUpdate: false });
          dirty.current = false;
          editor.commands.blur();
        }}
      >
        {editor && info && <Toolbar editor={editor} />}
        <div className="no-scrollbar relative min-h-24 flex-1 overflow-y-auto select-text">
          {!info && !error && <p className="absolute top-2 left-3 text-sm text-gray-400">Loading…</p>}
          {info && editor && <EmptyHint editor={editor} />}
          <EditorContent editor={editor} className="h-full" />
        </div>
      </div>
    </section>
  );
}

function EmptyHint({ editor }: { editor: Editor }) {
  const empty = useEditorState({ editor, selector: ({ editor: e }) => e.isEmpty });
  if (!empty) return null;
  return <p className="pointer-events-none absolute top-2 left-3 text-sm text-gray-400">Write what builders should know about this model…</p>;
}

function Toolbar({ editor }: { editor: Editor }) {
  const on = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      paragraph: e.isActive("paragraph"),
      h1: e.isActive("heading", { level: 1 }),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
    }),
  });
  const chain = () => editor.chain().focus();
  const tools = [
    { label: "Paragraph", active: on.paragraph && !on.bullet && !on.ordered, icon: Pilcrow, run: () => chain().setParagraph().run() },
    { label: "Heading 1", active: on.h1, icon: Heading1, run: () => chain().toggleHeading({ level: 1 }).run() },
    { label: "Heading 2", active: on.h2, icon: Heading2, run: () => chain().toggleHeading({ level: 2 }).run() },
    { label: "Heading 3", active: on.h3, icon: Heading3, run: () => chain().toggleHeading({ level: 3 }).run() },
    { label: "Bulleted list", active: on.bullet, icon: List, run: () => chain().toggleBulletList().run() },
    { label: "Numbered list", active: on.ordered, icon: ListOrdered, run: () => chain().toggleOrderedList().run() },
    { label: "Bold", active: on.bold, icon: Bold, run: () => chain().toggleBold().run() },
    { label: "Italic", active: on.italic, icon: Italic, run: () => chain().toggleItalic().run() },
  ];
  return (
    <div role="toolbar" aria-label="Formatting" className="flex shrink-0 flex-wrap items-center gap-0.5 border-b border-gray-150 px-1.5 py-1">
      {tools.map(({ label, active, icon: Icon, run }, i) => (
        <span key={label} className="flex items-center">
          {(i === 1 || i === 4 || i === 6) && <span className="mx-1 h-4 w-px bg-gray-200" aria-hidden />}
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label={label}
                  aria-pressed={active}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={run}
                  className={cn(
                    "inline-flex size-7 items-center justify-center rounded-md text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900",
                    active && "bg-gray-150 text-gray-900",
                  )}
                />
              }
            >
              <Icon className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
          </Tooltip>
        </span>
      ))}
    </div>
  );
}
