# Patterns

Page-level composition. How the primitives in `COMPONENTS.md` assemble into working screens.

---

## 1. App shell

Every screen sits inside the same skeleton. Three variants — pick one per product and never mix.

### A. Sidebar + content (default)

Simple tools, settings-heavy products, single-object workflows.

```
┌────────────┬────────────────────────────────────────────┐
│            │  Page title            [Filter] [+ New]    │ 52
│  Workspace ├────────────────────────────────────────────┤
│            │  Tabs                                      │ 36
│  ▸ Nav     ├────────────────────────────────────────────┤
│  ▸ Nav     │                                            │
│  ▸ Nav     │  content                                   │
│            │                                            │
│  ────────  │                                            │
│  Settings  │                                            │
└────────────┴────────────────────────────────────────────┘
   240px
```

### B. Sidebar + content + detail panel

Records with metadata: tickets, deals, tasks, orders. The panel opens on row selection and does not navigate away — the list stays visible and keyboard-navigable.

```
┌────────────┬──────────────────────────┬──────────────────┐
│  Workspace │  Page title      [+ New] │  ID-1042      ✕  │
│            ├──────────────────────────┼──────────────────┤
│  ▸ Nav     │  ▢ Row                   │  Title           │
│  ▸ Nav     │  ▣ Row      ← selected   │  Description     │
│  ▸ Nav     │  ▢ Row                   │  ──────────────  │
│            │  ▢ Row                   │  Status    ● To do│
│            │                          │  Assignee  ◐ J.L.│
│            │                          │  Created   2h ago│
└────────────┴──────────────────────────┴──────────────────┘
   240px                                     360px
```

### C. Icon rail + sidebar + content

Multi-product suites where the rail switches context (Support / Sales / Analytics) and the sidebar re-populates.

```
┌────┬────────────┬───────────────────────────────────────┐
│ ▣  │  Support   │  ...                                  │
│ ◇  │            │                                       │
│ ◈  │  ▸ Nav     │                                       │
│    │  ▸ Nav     │                                       │
│ ⚙  │            │                                       │
└────┴────────────┴───────────────────────────────────────┘
  52      240px
```

**Shell rules**

- Sidebar and detail panel are resizable by drag, persisted per user, collapsible to 0 with `⌘\` / `⌘.`.
- The top bar belongs to the page, not the app: it holds the page title, view controls, and the primary action. Global search and account live in the sidebar footer or the rail.
- Only the content region scrolls. The shell never scrolls.
- Below 1024px: detail panel becomes an overlay drawer. Below 768px: sidebar becomes a drawer, tables become stacked rows.

---

## 2. Page header

```
Page title                          [⌕ Search] [Filter ▾] [+ New item]
12 items · Updated 4m ago
```

- Title `text-xl`/600. Optional subtitle line in `text-xs`/`gray-500` with count and freshness.
- Actions right-aligned, gap `space-2`, exactly one primary.
- Filters sit in a second 44px row when there are more than two, each as a dismissible sm chip with a `Clear all` ghost link at the end. Active filter count appears on the Filter button as a `text-xs` chip.
- Breadcrumb replaces the subtitle when the page is nested more than one level deep.

---

## 3. Page archetypes

### List / table page
Header → view tabs or segmented control → filter row → table → pagination.
Selection turns the filter row into a bulk action bar. Sort, filters, column visibility, and density all persist per user per view.

### Board page
Columns 300px wide, gap `space-4`, header 40px with column name, count, `⋯` and `+`.
Cards: `radius-lg`, border `gray-200`, bg `gray-0`, padding 12, `shadow-xs` while dragging only. Card body = mono ID (`text-xs`/`gray-500`), title (`text-sm`/500, max 2 lines), then a chip row of labels, date, and assignee avatar.
Empty column shows a dashed `gray-300` drop zone at 80px.

### Record / detail page
Two columns: main content (max 720px) and a 320px metadata rail of label/value rows.
Metadata row: 32px, label `text-sm`/`gray-600` at 96px fixed width, value `text-sm`/500/`gray-900`, editable inline on click with a `radius-md` `gray-100` hover fill.
Activity/comment feed at the bottom, newest last, 1px `border-subtle` between entries.

### Form page
Single column, fields max 480px, left-aligned, grouped into cards by concept with a `text-md` card title and a one-line `text-sm`/`gray-600` description.
Vertical gap: 20px between fields, 32px between groups.
Footer action bar sticks to the bottom of the viewport once the form is dirty: `border-top`, bg `gray-0`, `shadow-xs`, `[Cancel] [Save changes]` right-aligned.

### Dashboard page
12-column grid, 24px gutter. Metric cards in a 4-up row: label `text-2xs` uppercase `gray-500`, value `text-2xl`/600 tabular, delta as a `text-xs` status badge.
Charts: single `accent-600` series, `gray-200` axis lines, `gray-500` `text-xs` labels, no gridline fill, no 3D, no donut with more than 5 slices. Multi-series uses `accent-600`, `gray-500`, `gray-300` before reaching for any additional hue.

### Settings page
Sidebar of sections (nav item component) + content max 720px. Each setting is a row: title `text-sm`/500, description `text-xs`/`gray-600`, control right-aligned. 1px `border-subtle` between rows. Destructive settings live in a final card with a `#F5C2BC` border and a Danger button.

---

## 4. State coverage

Every data region ships all five. An interface that only handles the happy path is unfinished.

| State | Treatment |
|---|---|
| **Loading** | Shell renders instantly; skeleton rows matching final row height and count (max 8) |
| **Empty** | Empty-state component, matched to cause (nothing yet / filtered / searched) |
| **Error** | Inline panel: 16px danger icon, `Couldn't load invoices`, one line on what to do, `Try again` secondary button. Never a toast for a region-level failure. |
| **Partial** | Render what loaded; show a `text-xs`/`gray-500` inline note for what didn't, with retry |
| **No permission** | `You don't have access to this` + who to ask. Never a blank screen or a 404. |

---

## 5. Data formatting

Consistency here is what separates a tool that feels engineered from one that feels assembled.

| Type | Rule | Example |
|---|---|---|
| Record ID | Mono, uppercase, `PREFIX-N` | `TASK-2`, `INV-1042` |
| Date, recent | Relative under 7 days | `2h ago`, `Yesterday` |
| Date, older | `D MMM` same year, `D MMM YYYY` otherwise | `14 Feb`, `14 Feb 2025` |
| Date, precise | Absolute + time, in tooltips and audit logs | `14 Feb 2026, 09:12` |
| Currency | Symbol + thousands separator + 2 decimals, right-aligned, tabular | `$1,240.00` |
| Multi-currency | Code after the amount, `gray-500` | `2.00 MYR` |
| Large numbers | Abbreviate above 10,000 in metrics only, full in tables | `12.4k` |
| Percentage | One decimal, sign for deltas | `+3.2%` |
| Null | Em dash `—` in `gray-400` | `—` |
| People | `First L.` in tables, full name in detail panels | `Ana R.` |
| Truncation | Middle-truncate paths and emails, end-truncate names | `ana…@acme.com` |

Timestamps display in the user's timezone, with the zone shown on hover.

---

## 6. Interaction conventions

- **Row click** opens the detail panel. **Title click** navigates to the full record. Both must be available.
- **Inline edit** on click for single fields; `Enter` commits, `Esc` reverts, blur commits. Show a 200ms `gray-100` flash on commit — no toast for field-level saves.
- **Autosave** for detail panels and settings. **Explicit save** for multi-field creation forms. Say which one it is: `Saved` in `text-xs`/`gray-500` next to the field.
- **Destructive actions** are never one click from a list. Menu → confirm dialog. Offer undo via toast where the operation is reversible; if it isn't, say so in the dialog.
- **Keyboard:** `⌘K` command palette, `/` search, `C` create, `Esc` close, `J`/`K` or arrows to move through rows, `X` to select, `Enter` to open. Document them in a `?` shortcut sheet.
- **Optimistic updates** for status, assignment, and reordering. Roll back with a danger toast on failure.

---

## 7. Copy

The interface speaks plainly and takes responsibility.

- **Sentence case** for everything: buttons, headings, labels, menu items, table headers.
- **Verb-first actions** that name the object: `Create invoice`, not `New`. `Save changes`, not `Submit`. The verb stays constant from button to confirmation to toast.
- **Labels are nouns**, 1–3 words, no colons, no "Please".
- **Errors** say what happened and what to do next, in the product's voice, without apology or blame: `Couldn't send the invoice — Acme Corp has no billing email. Add one in Company settings.`
- **Empty states** are an invitation, not a report: `Create your first invoice to start tracking payments.`
- **Never** use "Oops", "Uh oh", exclamation marks, or first-person from the product.
- **Numbers over adjectives:** `3 of 12 tasks done`, not `Almost there`.
- Name things the way the user names them, not the way the database does: `Customer`, not `Entity record`.

---

## 8. Before shipping a screen

- [ ] Zero values outside the token set
- [ ] One primary action, one accent color
- [ ] All five states handled
- [ ] Focus ring visible on every interactive element, tab order matches visual order
- [ ] Numeric columns right-aligned and tabular
- [ ] Longest realistic string tested in every cell, and the shortest
- [ ] Works at 1280px, 1440px, 1920px, and degrades cleanly at 1024px
- [ ] No shadow used to separate static content
- [ ] Reduced-motion respected
- [ ] Every action's verb matches its resulting confirmation
