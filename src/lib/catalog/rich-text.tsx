import type { ReactNode } from "react";

/**
 * Catalog descriptions are the editor's ProseMirror JSON, kept to headings 1–3, paragraphs,
 * bulleted and numbered lists, bold and italic. Anything else is dropped when saving, and the
 * renderer below only knows these nodes, so a description never carries markup of its own.
 */
export type RichNode = {
  type: string;
  attrs?: { level?: number; start?: number };
  content?: RichNode[];
  text?: string;
  marks?: { type: "bold" | "italic" }[];
};

const MAX_LENGTH = 200_000;
const MARKS = new Set(["bold", "italic"]);

function cleanNode(value: unknown): RichNode | null {
  if (!value || typeof value !== "object") return null;
  const node = value as Record<string, unknown>;
  const children = () => (Array.isArray(node.content) ? node.content.map(cleanNode).filter((n): n is RichNode => n !== null) : []);
  switch (node.type) {
    case "text": {
      if (typeof node.text !== "string" || !node.text) return null;
      const marks = Array.isArray(node.marks)
        ? node.marks.flatMap((m) => (m && typeof m === "object" && MARKS.has((m as { type?: string }).type ?? "") ? [{ type: (m as { type: "bold" | "italic" }).type }] : []))
        : [];
      return { type: "text", text: node.text, ...(marks.length ? { marks } : {}) };
    }
    case "hardBreak":
      return { type: "hardBreak" };
    case "heading": {
      const level = Number((node.attrs as { level?: unknown } | undefined)?.level);
      return { type: "heading", attrs: { level: level === 1 || level === 2 ? level : 3 }, content: children() };
    }
    case "orderedList": {
      const start = Number((node.attrs as { start?: unknown } | undefined)?.start);
      return { type: "orderedList", ...(Number.isInteger(start) && start > 1 ? { attrs: { start } } : {}), content: children() };
    }
    case "paragraph":
    case "bulletList":
    case "listItem":
      return { type: node.type, content: children() };
    default:
      return null;
  }
}

function hasText(node: RichNode): boolean {
  return Boolean(node.text?.trim()) || (node.content ?? []).some(hasText);
}

/** The document as it is stored, or null when there is nothing to keep. */
export function cleanDoc(value: unknown): RichNode | null {
  const raw = typeof value === "string" ? safeParse(value) : value;
  if (!raw || typeof raw !== "object" || (raw as { type?: unknown }).type !== "doc") return null;
  const content = Array.isArray((raw as RichNode).content) ? (raw as RichNode).content!.map(cleanNode).filter((n): n is RichNode => n !== null) : [];
  // The editor keeps an empty paragraph at the end to type into; it isn't content.
  while (content.length && !hasText(content.at(-1)!)) content.pop();
  const doc: RichNode = { type: "doc", content };
  if (!hasText(doc)) return null;
  if (JSON.stringify(doc).length > MAX_LENGTH) throw new Error("The description is too long");
  return doc;
}

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/** A stored description, ready to show; null when empty or unreadable. */
export function readDoc(json: string | null | undefined): RichNode | null {
  if (!json) return null;
  try {
    return cleanDoc(json);
  } catch {
    return null;
  }
}

function inline(nodes: RichNode[] = []): ReactNode[] {
  return nodes.map((node, i) => {
    if (node.type === "hardBreak") return <br key={i} />;
    let out: ReactNode = node.text ?? "";
    for (const mark of node.marks ?? []) out = mark.type === "bold" ? <strong>{out}</strong> : <em>{out}</em>;
    return <span key={i}>{out}</span>;
  });
}

function block(node: RichNode, key: number): ReactNode {
  switch (node.type) {
    case "heading": {
      const Tag = (`h${node.attrs?.level ?? 3}`) as "h1" | "h2" | "h3";
      return <Tag key={key}>{inline(node.content)}</Tag>;
    }
    case "paragraph":
      return <p key={key}>{inline(node.content)}</p>;
    case "bulletList":
      return <ul key={key}>{node.content?.map(block)}</ul>;
    case "orderedList":
      return (
        <ol key={key} start={node.attrs?.start}>
          {node.content?.map(block)}
        </ol>
      );
    case "listItem":
      return <li key={key}>{node.content?.map(block)}</li>;
    default:
      return null;
  }
}

/** Shows a description. Styling comes from the `rich-text` class. */
export function RichText({ doc, className }: { doc: RichNode; className?: string }) {
  return <div className={className ? `rich-text ${className}` : "rich-text"}>{doc.content?.map(block)}</div>;
}
