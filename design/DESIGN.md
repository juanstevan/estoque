# Design System — Business Applications

A specification for dense, professional software interfaces: dashboards, CRMs, admin panels, ticketing, catalogs, internal tools.

**Direction:** minimal, clean, professional, light, solid, serious, sharp.

---

## 0. How to use this file

This document is a **contract**, not a mood board. When generating an interface — by hand or with an AI agent — every color, size, and spacing value must come from a token defined here. If a value is not in this file, it does not go in the UI.

**When prompting an agent, paste this alongside the request and add:**

> Follow DESIGN.md exactly. Use only the defined tokens. Do not introduce new colors, radii, shadows, font sizes, or animation durations. If something is missing from the system, use the nearest defined token and flag it.

**Hard rules — never broken:**

1. One accent color. Everything else is neutral gray or a semantic status color.
2. Structure is made with **1px borders**, not shadows. Shadows exist only for floating layers.
3. Maximum border radius anywhere is **10px**.
4. No gradients. No glassmorphism. No blur. No glow. No decorative illustration.
5. No font weight above 600.
6. Every spacing value is a multiple of 4.
7. Color never carries meaning alone — pair it with text or an icon.

---

## 1. Principles

**Neutral by default, color as signal.**
The interface is grayscale. Color appears only where it means something: a primary action, a status, a selected state, a destructive warning. When the screen is 95% neutral, the 5% is read instantly.

**Borders over shadows.**
Panels, cards, tables, and inputs are separated by hairline borders on a near-white canvas. Shadows are reserved for things that genuinely float above the page — menus, popovers, dialogs, toasts. This is what makes the UI read as *solid* rather than soft.

**Density is a feature.**
These are tools used all day by people who already know what they're doing. Prefer 13px text, 32px controls, and 40px table rows over airy consumer spacing. Whitespace is used to group, not to impress.

**Type does the hierarchy work.**
Size, weight, and color separate levels — not boxes, not backgrounds, not dividers. Three levels of hierarchy per screen is usually enough.

**Sharp, not soft.**
Small radii, flat terminals, tight tracking, precise alignment. Nothing rounded, bubbly, or playful. Restraint reads as competence.

**Predictable over clever.**
The same component behaves the same way everywhere. A person should be able to guess where a control is before they look for it.

---

## 2. Color

Two tiers: a **raw palette** (never used directly in components) and **semantic tokens** (always used in components).

### 2.1 Neutral ramp

Cool-leaning gray. This is the backbone of the entire UI.

| Token | Hex | Use |
|---|---|---|
| `gray-0` | `#FFFFFF` | Surfaces, cards, panels, table rows |
| `gray-25` | `#FCFCFD` | Subtle surface (hover on white) |
| `gray-50` | `#F7F8FA` | App canvas, sidebar background |
| `gray-100` | `#F0F2F5` | Table headers, muted fills, skeletons |
| `gray-150` | `#E8EBEF` | Hover on gray fills, dividers inside panels |
| `gray-200` | `#DFE3E8` | **Default border** |
| `gray-300` | `#C9CFD8` | Strong border, disabled control border |
| `gray-400` | `#A2ABB8` | Placeholder text, disabled text, inactive icons |
| `gray-500` | `#7A8494` | Icons, tertiary text |
| `gray-600` | `#5B6472` | **Secondary text**, labels |
| `gray-700` | `#414A57` | Body text on light fills |
| `gray-800` | `#2A313B` | Strong text |
| `gray-900` | `#171B21` | **Primary text**, headings |
| `gray-950` | `#0D1015` | Rare — highest contrast only |

### 2.2 Accent

A deep, saturated blue. Serious, not bright. Used for primary actions, links, selection, and focus.

| Token | Hex | Use |
|---|---|---|
| `accent-50` | `#EEF3FF` | Selected row, active nav item background |
| `accent-100` | `#DCE6FE` | Selected + hover background |
| `accent-200` | `#BFD0FC` | Subtle accent border |
| `accent-300` | `#94AEF8` | Accent border, focus ring on dark fills |
| `accent-500` | `#3B5FE0` | Focus ring, chart primary |
| `accent-600` | `#2A48C4` | **Primary fill, links, active icon** |
| `accent-700` | `#2239A0` | Primary hover |
| `accent-800` | `#1E317F` | Primary active/pressed |

### 2.3 Status

Each status has a *fill*, a *border*, and a *text/icon* value. Always used as a set.

| Status | Fill | Border | Text | Meaning |
|---|---|---|---|---|
| Neutral | `#F0F2F5` | `#DFE3E8` | `#414A57` | Draft, To do, Inactive, Unassigned |
| Info | `#EEF3FF` | `#BFD0FC` | `#2239A0` | In progress, Scheduled, Pending review |
| Success | `#E9F6EF` | `#BDE3CE` | `#147247` | Done, Paid, Succeeded, Active |
| Warning | `#FDF4E3` | `#F0D9A8` | `#8A5A00` | At risk, Overdue soon, Requires attention |
| Danger | `#FDECEA` | `#F5C2BC` | `#B42318` | Failed, Cancelled, Overdue, Error |

### 2.4 Semantic tokens

These are what components reference. See `tokens.css` for the full list.

```
--bg-canvas      gray-50     App background
--bg-surface     gray-0      Cards, panels, table rows, inputs
--bg-sunken      gray-100    Table headers, code blocks, empty wells
--bg-hover       gray-50     Row / item hover on white
--bg-active      gray-100    Pressed state
--bg-selected    accent-50   Selected row, active nav

--text-primary   gray-900    Headings, table values, input text
--text-secondary gray-600    Labels, field names, metadata
--text-tertiary  gray-500    Timestamps, counts, helper text
--text-disabled  gray-400    Disabled, placeholder
--text-onFill    gray-0      Text on accent / dark fills
--text-link      accent-600

--border-subtle  gray-150    Dividers inside a panel
--border-default gray-200    Panel, card, input, table borders
--border-strong  gray-300    Hovered input, drag handles
--border-focus   accent-500
```

### 2.5 Color rules

- Never use pure black (`#000`) or pure saturated red/green. They read cheap next to the neutral ramp.
- Status colors are for **status only** — never for decoration or category coding.
- For category/label colors (tags, projects, teams), use a **dot** in a hue, with the label text in `text-primary`. Do not tint the whole chip. This is what keeps a screen with 20 labels from looking like confetti.
- Body text is never lighter than `gray-600` at 13px and below.

---

## 3. Typography

### 3.1 Faces

| Role | Stack | Why |
|---|---|---|
| UI / body | `"Geist", "Inter", -apple-system, "Segoe UI", system-ui, sans-serif` | Flat terminals and narrow apertures read as engineered rather than friendly. Excellent at 12–14px. |
| Data / identifiers | `"Geist Mono", "JetBrains Mono", ui-monospace, "SF Mono", monospace` | Record IDs, SKUs, amounts, timestamps, API values, card digits. |

One family for everything else. No display face — a business tool doesn't need a voice, it needs clarity.

**Always enable tabular figures on numeric data:** `font-variant-numeric: tabular-nums;` on tables, amounts, counters, and timestamps. Columns of numbers must align on the decimal.

### 3.2 Scale

Compact by design. Base is **13px**, not 16px.

| Token | Size / line-height | Weight | Tracking | Use |
|---|---|---|---|---|
| `text-2xs` | 11 / 16 | 500 | +0.04em, uppercase | Section eyebrows, column groups, meta labels |
| `text-xs` | 12 / 16 | 400–500 | 0 | Timestamps, counts, helper text, badges |
| `text-sm` | 13 / 20 | 400–500 | 0 | **Default UI text** — table cells, nav, inputs, buttons |
| `text-base` | 14 / 20 | 400–500 | 0 | Body copy, detail-panel values, long descriptions |
| `text-md` | 16 / 24 | 500–600 | −0.005em | Panel titles, card headings, dialog titles |
| `text-lg` | 18 / 26 | 600 | −0.01em | Section headings |
| `text-xl` | 22 / 30 | 600 | −0.015em | **Page title** |
| `text-2xl` | 28 / 36 | 600 | −0.02em | Rare — dashboard greeting, empty-state headline |

### 3.3 Weights

Only three: **400** (body), **500** (emphasis, labels, buttons, table headers), **600** (headings).
600 is the ceiling. Bold is not available.

### 3.4 Rules

- Sentence case everywhere except `text-2xs` eyebrows, which are uppercase.
- No italics. No underlines except on hovered links.
- Truncate with ellipsis on a single line; never wrap a table cell to two lines.
- Maximum measure for prose: 72ch. Detail panels: 60ch.
- Labels in detail panels use `text-sm` / 400 / `text-secondary`; their values use `text-sm` / 500 / `text-primary`.

---

## 4. Spacing & layout grid

**Base unit: 4px.** Every margin, padding, and gap is a multiple.

| Token | px | Typical use |
|---|---|---|
| `space-1` | 4 | Icon-to-label, chip padding |
| `space-2` | 8 | Inside compact controls, gap between chips |
| `space-3` | 12 | Input padding-x, tight stack gap |
| `space-4` | 16 | **Default padding** — cards, panels, table cells |
| `space-5` | 20 | Between grouped fields |
| `space-6` | 24 | Panel padding, gap between cards |
| `space-8` | 32 | Between page sections |
| `space-10` | 40 | Page padding-x on wide screens |
| `space-12` | 48 | Between major regions |
| `space-16` | 64 | Empty-state vertical padding |

### 4.1 Fixed dimensions

| Element | Size |
|---|---|
| Icon rail (optional) | 52px |
| Sidebar | 240px (min 200, max 280, resizable) |
| Right detail panel | 360px (min 320, max 480, resizable) |
| Top bar | 52px |
| Page content max-width | 1280px for forms/settings; full-bleed for tables and boards |
| Page gutter | 24px (≤1280) / 40px (>1280) |

### 4.2 Density scale

| Size | Control height | Table row | Padding-x |
|---|---|---|---|
| `xs` | 24px | — | 8px |
| `sm` | 28px | 36px | 10px |
| `md` **(default)** | 32px | 40px | 12px |
| `lg` | 36px | 48px | 14px |

Ship `md` everywhere. Offer `sm`/`lg` as a user-level density preference on data-heavy screens only.

---

## 5. Borders, radius, elevation

### 5.1 Borders

All borders are **1px solid**. There is no 2px border in this system except the focus ring and the active-tab indicator.

- Panel / card / input / table outline → `border-default`
- Divider between rows inside a panel → `border-subtle`
- Hovered input, resize handles → `border-strong`

### 5.2 Radius

| Token | px | Use |
|---|---|---|
| `radius-xs` | 3 | Checkbox, small badge, color dot container |
| `radius-sm` | 4 | Chips, tags, inline code |
| `radius-md` | 6 | **Default** — buttons, inputs, select, menu items |
| `radius-lg` | 8 | Cards, panels, dialogs |
| `radius-xl` | 10 | Ceiling. Large modals, image containers |
| `radius-full` | 9999 | Avatars, status dots, toggle knobs **only** |

Status pills use `radius-sm` (4px), not `radius-full`. Rounded pills read consumer; squared pills read enterprise.

### 5.3 Elevation

Shadows are **never** used to separate static content. Only four exist:

| Token | Value | Use |
|---|---|---|
| `shadow-xs` | `0 1px 2px rgba(13,16,21,0.05)` | Raised buttons, sticky headers on scroll |
| `shadow-sm` | `0 2px 6px rgba(13,16,21,0.06), 0 1px 2px rgba(13,16,21,0.04)` | Dropdowns, tooltips, popovers |
| `shadow-md` | `0 8px 20px rgba(13,16,21,0.10), 0 2px 6px rgba(13,16,21,0.05)` | Dialogs, command palette |
| `shadow-lg` | `0 16px 40px rgba(13,16,21,0.14), 0 4px 10px rgba(13,16,21,0.06)` | Full-screen overlays, drag preview |

Every shadowed surface also carries a 1px `border-default`. Shadow alone is not enough definition on a light canvas.

Overlay scrim: `rgba(13,16,21,0.32)`. No backdrop blur.

---

## 6. Motion

Motion confirms a state change. It never entertains.

| Token | Duration | Easing | Use |
|---|---|---|---|
| `motion-instant` | 80ms | `linear` | Color/background on hover |
| `motion-fast` | 120ms | `cubic-bezier(0.2, 0, 0.2, 1)` | Buttons, checkboxes, chips, tooltips |
| `motion-base` | 180ms | `cubic-bezier(0.2, 0, 0.2, 1)` | Dropdowns, popovers, accordion |
| `motion-slow` | 240ms | `cubic-bezier(0.2, 0, 0, 1)` | Side panels, drawers, dialogs |

**Rules**

- Animate only `opacity`, `transform`, `background-color`, `border-color`, `color`. Never `height`, `width`, or `top/left`.
- No bounce, no spring, no overshoot, no easing that ends slowly (`ease-in`).
- Entry animations move at most 4px. Panels slide in from their own edge.
- Skeletons pulse opacity `1 → 0.55 → 1` over 1.4s. No shimmer sweep.
- Respect `prefers-reduced-motion: reduce` — drop all transforms, keep opacity fades at 80ms.

---

## 7. Iconography

- **Lucide**, 1.5px stroke, no fill.
- Sizes: `14` inline with `text-sm`, `16` default UI, `20` sidebar/empty-state, `24` rare.
- Icon color follows its text: `gray-500` at rest, `gray-700` on hover, `accent-600` when active.
- Icons are never the only label for a non-obvious action. Icon-only buttons require a tooltip.
- One icon set. Never mix in emoji or a second family.

---

## 8. Accessibility floor

Not optional, not a phase two.

- Contrast: 4.5:1 for text under 18px, 3:1 for UI borders and icons. `gray-500` on `gray-0` is the lightest permitted text color, and only for 12px+ metadata.
- **Focus:** 2px `accent-500` ring with a 2px surface-colored offset. Visible on every interactive element, always, including inside tables and menus. Never `outline: none` without a replacement.
- Every input has a real `<label>`. Placeholder is not a label.
- Full keyboard operability: Tab order follows visual order; `Esc` closes every overlay; `Enter`/`Space` activates; arrow keys move within menus, tables, and boards.
- Status is communicated by icon or text in addition to color.
- Minimum hit target 24×24px; 32×32px for anything used repeatedly.
- Table headers use `<th scope="col">`. Sorting state is announced.

---

## 9. Anti-patterns

Things that would break the direction, listed so an agent can't drift into them:

| Don't | Do instead |
|---|---|
| Card shadows to separate content | 1px `border-default` on `bg-surface` |
| Gradient buttons or headers | Solid `accent-600` |
| Fully rounded pills for status | 4px radius pills |
| Multiple accent colors | One accent + neutral + status |
| 16px base text in a data table | 13px with tabular figures |
| Large hero headings inside the app | `text-xl` page title, `text-md` panel titles |
| Colored tinted backgrounds per section | White surfaces on a `gray-50` canvas |
| Emoji in the UI | Lucide icons |
| Animated page transitions | Instant navigation; skeletons for data |
| Centered forms with wide fields | Left-aligned, max 480px field width |
| Placeholder-only inputs | Persistent label above the field |
| "Submit" / "OK" / "Are you sure?" | Verb the action names: "Save changes", "Delete invoice" |

---

## 10. Files

| File | Contents |
|---|---|
| `DESIGN.md` | This file — principles and tokens |
| `COMPONENTS.md` | Per-component anatomy, sizes, states |
| `PATTERNS.md` | App shell, page layouts, states, copy |
| `tokens.css` | Drop-in CSS custom properties + Tailwind v4 `@theme` mapping |
