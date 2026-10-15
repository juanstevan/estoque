import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanDoc, readDoc, RichText } from "./rich-text";

const text = (t: string, marks?: string[]) => ({ type: "text", text: t, ...(marks ? { marks: marks.map((type) => ({ type })) } : {}) });
const doc = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 1 }, content: [text("Legend 4")] },
    { type: "heading", attrs: { level: 5 }, content: [text("Too deep")] },
    { type: "paragraph", content: [text("Stainless "), text("304", ["bold"]), text(" body", ["italic", "link", "underline"])] },
    { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [text("Four burners")] }] }] },
    { type: "orderedList", attrs: { start: 3 }, content: [{ type: "listItem", content: [{ type: "paragraph", content: [text("Third")] }] }] },
    { type: "codeBlock", content: [text("rm -rf")] },
    { type: "image", attrs: { src: "https://x/y.png" } },
    { type: "paragraph", content: [text("<script>alert(1)</script>")] },
  ],
};

// Kept: headings 1–3, paragraphs, lists, bold, italic. Dropped: everything else.
const clean = cleanDoc(doc)!;
assert.deepEqual(clean.content!.map((n) => n.type), ["heading", "heading", "paragraph", "bulletList", "orderedList", "paragraph"]);
assert.equal(clean.content![1]!.attrs!.level, 3, "heading levels stop at 3");
assert.deepEqual(clean.content![2]!.content![2]!.marks, [{ type: "italic" }], "only bold and italic marks");
assert.equal(clean.content![4]!.attrs!.start, 3);

// Trailing empty paragraphs (the editor's typing line) aren't stored.
assert.equal(cleanDoc({ type: "doc", content: [{ type: "paragraph", content: [text("Hi")] }, { type: "paragraph" }, { type: "paragraph", content: [] }] })!.content!.length, 1);

// Nothing to keep: no description.
assert.equal(cleanDoc({ type: "doc", content: [{ type: "paragraph" }, { type: "paragraph", content: [text("   ")] }] }), null);
assert.equal(cleanDoc("not json"), null);
assert.equal(readDoc(""), null);
assert.deepEqual(readDoc(JSON.stringify(clean)), clean, "what is stored reads back the same");
assert.throws(() => cleanDoc({ type: "doc", content: [{ type: "paragraph", content: [text("x".repeat(200_001))] }] }), /too long/);

// Rendered as elements, so text never becomes markup.
const html = renderToStaticMarkup(<RichText doc={clean} />);
assert.ok(html.includes("<h1><span>Legend 4</span></h1>"));
assert.ok(html.includes("<strong>304</strong>") && html.includes("<em> body</em>"));
assert.ok(html.includes('<ol start="3">'));
assert.ok(html.includes("&lt;script&gt;") && !html.includes("<script>"), "text is escaped");
assert.ok(!html.includes("rm -rf") && !html.includes("y.png"));
console.log("rich text ok");
