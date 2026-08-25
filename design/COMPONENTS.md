# Components

Specification for every primitive in the system. All values reference tokens defined in `DESIGN.md` / `tokens.css`.

Default size for every control is **md (32px)** unless stated.

---

## Button

**Anatomy:** `[icon 16] label [icon 16]` — `radius-md`, `text-sm`, weight 500, padding-x per size, gap `space-2`.

### Variants

| Variant | Rest | Hover | Active | Use |
|---|---|---|---|---|
| **Primary** | bg `accent-600`, text white, no border | bg `accent-700` | bg `accent-800` | One per view. The single most likely action. |
| **Secondary** | bg `gray-0`, text `gray-800`, border `gray-200`, `shadow-xs` | bg `gray-50`, border `gray-300` | bg `gray-100` | Everything else in a toolbar. |
| **Ghost** | transparent, text `gray-700` | bg `gray-100` | bg `gray-150` | Icon buttons, table row actions, menu triggers. |
| **Danger** | bg `#B42318`, text white | bg `#98200F` | bg `#7E1A0C` | Destructive confirmation only, inside a dialog. |
| **Link** | text `accent-600`, no bg | underline | text `accent-800` | Inline in prose. Never in a toolbar. |

### Sizes

| Size | Height | Padding-x | Icon-only width |
|---|---|---|---|
| xs | 24 | 8 | 24 |
| sm | 28 | 10 | 28 |
| md | 32 | 12 | 32 |
| lg | 36 | 16 | 36 |

### States

- **Disabled:** bg `gray-100`, text `gray-400`, border `gray-200`, `cursor: not-allowed`, no hover. Never hide a disabled button — explain why it's disabled in a tooltip.
- **Loading:** spinner replaces the leading icon, label stays, width does not change, button is inert.
- **Focus:** 2px `accent-500` ring, 2px offset.

**Rules:** sentence case, verb-first, 1–3 words. Icon-only buttons need a tooltip and `aria-label`. Maximum one primary button per screen region.

---

## Input / Textarea / Select

**Anatomy:** label above, control, helper or error text below.

```
Label                       ← text-sm / 500 / text-secondary, mb space-1
┌──────────────────────────┐
│ [icon] value             │ ← 32px, radius-md, border-default, bg-surface
└──────────────────────────┘
Helper text                 ← text-xs / text-tertiary, mt space-1
```

| State | Border | Background | Notes |
|---|---|---|---|
| Rest | `gray-200` | `gray-0` | text `gray-900`, placeholder `gray-400` |
| Hover | `gray-300` | `gray-0` | |
| Focus | `accent-500` | `gray-0` | + 2px `accent-500`/20% ring |
| Error | `#B42318` | `gray-0` | message below in `#B42318`, `text-xs`, with a 14px alert icon |
| Disabled | `gray-200` | `gray-100` | text `gray-400` |
| Read-only | none | transparent | text `gray-900`, no box — used in detail panels |

- Padding-x 12px (10px if a leading icon is present, icon at 12px from edge).
- Textarea: min-height 72px, `resize: vertical`, same paddings.
- Select: chevron-down 16px at `gray-500`, 12px from the right edge.
- Field width follows content type, not the container: 96px for a quantity, 200px for a date, 320px for a name, 480px max for anything.
- Required fields are marked with `*` in `#B42318` after the label. Do not mark optional fields.

---

## Checkbox / Radio / Switch

| Control | Size | Rest | Checked |
|---|---|---|---|
| Checkbox | 16×16, `radius-xs` | border `gray-300`, bg `gray-0` | bg `accent-600`, white check, no border |
| Radio | 16×16, `radius-full` | border `gray-300` | 2px `accent-600` ring + 6px `accent-600` dot |
| Switch | 32×18 track, 14px knob, `radius-full` | track `gray-300` | track `accent-600` |

- Indeterminate checkbox: `accent-600` fill with a white 8px bar. Used in table select-all.
- Label sits to the right, `text-sm`, `gray-900`, gap `space-2`, vertically centered, and is clickable.
- Switch is for settings that apply immediately. Checkbox is for values submitted with a form. Do not mix.

---

## Status badge

The single most important component in a business app. Gets its own strict spec.

```
┌─────────────────┐
│ ● In progress   │   height 20 (sm) / 24 (md)
└─────────────────┘   radius-sm (4px), padding-x 8, gap 6
```

- `text-xs`, weight 500, sentence case.
- Optional 6px dot or 12px icon in the status text color.
- Fill / border / text come as a matched set from the Status table in `DESIGN.md`. Never mix.
- Border is 1px in the status border color — this is what makes them read solid rather than pastel.
- Never invent a status color. Map any new status onto one of the five existing meanings.

---

## Label / Tag chip

For categories, teams, projects, product lines — anything that is *not* a status.

- 20px height, `radius-sm`, bg `gray-0`, border `gray-200`, `text-xs`/500, text `gray-700`.
- Leading 6px color dot carries the category hue. **Only the dot is colored.**
- Removable variant adds a 12px × at `gray-400`, `gray-700` on hover.
- Overflow: show 2 chips, then `+3` in a `gray-100` chip with a tooltip listing the rest.

---

## Avatar

- Sizes: 20, 24 (default in tables), 32 (detail panels), 40 (profile headers).
- `radius-full`. Image, or initials in `text-xs`/500 white on a deterministic hue derived from the name.
- Fallback for unassigned: dashed 1px `gray-300` circle with a 12px user icon at `gray-400`.
- Stacks: −6px overlap, 2px `gray-0` ring, maximum 4 then `+N`.

---

## Card / Panel

```
┌────────────────────────────────────┐
│ Title                     [action] │  header: 44px, padding-x 16, border-bottom subtle
├────────────────────────────────────┤
│                                    │
│  content                           │  padding 16 (compact) / 24 (default)
│                                    │
└────────────────────────────────────┘
```

- bg `gray-0`, border `gray-200`, `radius-lg`, **no shadow**.
- Header title: `text-md`/600/`gray-900`. Optional count in `text-sm`/`gray-500` after it.
- Header actions are ghost buttons at size sm.
- Cards in a grid: gap `space-6`, equal height per row.
- A card is not clickable unless the entire card is a link — in which case add hover bg `gray-25` and border `gray-300`.

---

## Data table

The core surface. Everything about it is deliberate.

```
┌──────────────────────────────────────────────────────────┐
│ [ ] │ Name        │ Status      │ Owner    │ Updated  │⋯ │ ← header 36px, bg-sunken
├──────────────────────────────────────────────────────────┤
│ [ ] │ Acme Corp   │ ● Active    │ ◐ J. Lee │ 2h ago   │⋯ │ ← row 40px
│ [ ] │ Northwind   │ ● Failed    │ ◐ A. Ruiz│ 5h ago   │⋯ │
└──────────────────────────────────────────────────────────┘
```

**Header row** — 36px, bg `gray-100`, `text-xs`/500/`gray-600`, sentence case, sticky on scroll with `shadow-xs` once scrolled. Sortable columns show a 12px chevron on hover and persistently when active.

**Body rows** — 40px, bg `gray-0`, 1px `border-subtle` bottom divider (no vertical rules, no zebra striping). Cell padding-x 12px, first cell 16px.

- Hover: bg `gray-50`, row actions fade in at the right edge.
- Selected: bg `accent-50`, left 2px `accent-600` inset bar.
- Focused row (keyboard): 2px `accent-500` inset ring.

**Column rules**

| Content | Alignment | Font |
|---|---|---|
| Text, names | left | `text-sm`/400, primary column 500 |
| Status, tags | left | badge component |
| Numbers, currency | **right** | `text-sm`, tabular-nums |
| IDs, SKUs, codes | left | mono, `text-xs`, `gray-600` |
| Dates | left | `text-sm`, `gray-600`, relative under 7 days then absolute |
| Actions | right | ghost `⋯` button, 24px, revealed on hover/focus |

- Freeze the first column and the actions column on horizontal scroll.
- Truncate with ellipsis + native tooltip. Never wrap.
- Row density is a user preference (36 / 40 / 48), persisted.
- Bulk selection turns the header into an action bar: `3 selected` + relevant verbs + Cancel.

---

## Tabs

- Underline style only. 36px height, `text-sm`/500, `gray-600` at rest, `gray-900` when active, 2px `accent-600` bottom border on the active tab, 1px `border-default` running under the whole row.
- Gap 24px between tabs. Optional count chip after the label in `text-xs`/`gray-500`.
- Segmented control (a filled `gray-100` track with a white `radius-md` thumb and `shadow-xs`) is used only for switching *view modes* — List / Board / Calendar — never for navigation.

---

## Sidebar navigation

- Sidebar bg `gray-50`, right border `gray-200`.
- Item: 30px height, `radius-md`, padding-x 8, gap `space-2`, 16px icon at `gray-500`, `text-sm`/400/`gray-700`.
- Hover: bg `gray-150`. Active: bg `accent-50`, text `accent-700`/500, icon `accent-600`.
- Section header: `text-2xs` uppercase `gray-500`, padding-x 8, margin-top `space-5`, margin-bottom `space-1`.
- Trailing count in `text-xs`/`gray-500`, right-aligned. Unread indicator is a 6px `accent-600` dot.
- Collapsible groups use a 12px chevron on the left of the section header, rotating 90° over `motion-fast`.
- Nesting stops at two levels. Deeper structures belong in the main area.

---

## Dropdown menu

- `shadow-sm`, border `gray-200`, `radius-lg`, bg `gray-0`, padding `space-1`, min-width 180px, max-height 320px with scroll.
- Item: 30px, `radius-md`, padding-x 8, `text-sm`/`gray-800`, hover bg `gray-100`.
- Optional leading 16px icon (`gray-500`) and trailing shortcut hint in mono `text-xs`/`gray-400`.
- Section label: `text-2xs` uppercase `gray-500`, padding 6px 8px.
- Separator: 1px `border-subtle`, margin-y `space-1`.
- Destructive item: text `#B42318`, hover bg `#FDECEA`. Always last, always after a separator.
- Enter: fade + 4px rise over `motion-base`. Exit: fade only, `motion-fast`.

---

## Dialog

- Widths: 400 (confirm), 560 (default form), 720 (complex), 880 (max). Never full-screen on desktop.
- `radius-xl`, border `gray-200`, `shadow-md`, bg `gray-0`.
- Header 56px: title `text-md`/600, close × ghost button at the right.
- Body padding 24px, max-height `70vh`, scrolls internally with the header and footer pinned.
- Footer 64px, `border-top subtle`, buttons right-aligned: `[Cancel] [Primary]`, gap `space-2`.
- Scrim `rgba(13,16,21,0.32)`, fades in over `motion-base`. Dialog rises 8px.
- `Esc` and scrim click both close — unless there are unsaved changes, which triggers a confirm.

**Destructive confirm:** title states the object (`Delete invoice INV-1042?`), body states the consequence and whether it's reversible, primary button is the Danger variant and repeats the verb (`Delete invoice`).

---

## Toast

- Bottom-right, 360px wide, `radius-lg`, bg `gray-0`, border `gray-200`, `shadow-sm`, padding 12/16.
- 16px status icon + `text-sm` message + optional action link (`accent-600`, 500) + 14px close.
- Auto-dismiss: 5s success/info, 8s warning, never for errors.
- Stack maximum 3, newest on top, 8px gap. Slide 8px up + fade over `motion-base`.
- One sentence, no period, states what happened: `Invoice sent to Acme Corp`.

---

## Tooltip

- bg `gray-900`, text `gray-0`, `text-xs`, `radius-sm`, padding 6/8, `shadow-sm`, max-width 240px.
- 400ms open delay, 0ms close, 120ms fade. No arrow.
- Content: what the control does, or the full value of truncated text. Never essential-only information.

---

## Empty state

Centered in the region, max-width 360px, vertical padding `space-16`.

```
      [ icon 20 in a 40px gray-100 radius-lg square ]
      No invoices yet                    ← text-md / 600 / gray-900
      Create your first invoice to        ← text-sm / gray-600, ≤2 lines
      start tracking payments.
      [ Create invoice ]                  ← primary md
```

Three distinct cases, never conflated:

| Case | Headline | Action |
|---|---|---|
| Nothing created yet | `No invoices yet` | Primary create button |
| Filters return nothing | `No results for these filters` | `Clear filters` secondary |
| Search returns nothing | `No matches for "acme"` | Suggest broadening, no button |

No illustrations. No emoji.

---

## Loading

- **Skeletons** for known layouts: `gray-100` blocks at `radius-sm`, matching the real element's height and roughly 60–80% of its width. Pulse per `DESIGN.md §6`.
- **Spinner** only for actions in progress inside a button or an inline row: 14/16px, 1.5px stroke, `accent-600`, 700ms rotation.
- **Progress bar** for determinate multi-step work: 4px, `radius-full`, track `gray-150`, fill `accent-600`.
- Never show a full-page spinner. Render the shell instantly and skeleton the data.

---

## Pagination

- Right-aligned under the table, 40px tall.
- Left: `1–25 of 340` in `text-xs`/`gray-600`.
- Right: rows-per-page select (sm) + `‹` `›` ghost icon buttons (sm), disabled at the ends.
- Prefer cursor pagination with `‹ ›` over numbered pages in tools with volatile data.

---

## Command palette

- 640px wide, top-anchored at 15vh, `radius-xl`, `shadow-md`.
- Search input 48px, no border, 16px icon, `text-base`.
- Grouped results with `text-2xs` uppercase group labels, 36px rows, selected row bg `gray-100`.
- Trailing mono shortcut hints. `⌘K` opens; arrows navigate; `Enter` runs; `Esc` closes.

---

## Breadcrumb

- `text-sm`/`gray-600`, separator `/` in `gray-300`, current page in `gray-900`/500.
- Collapse the middle into `…` beyond 3 levels.
- Optional 16px leading object icon (workspace, project) matching the sidebar icon.
