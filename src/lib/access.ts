/** Per-tab access for roles. Shared by the server checks and the UI. */

export const TABS = ["storage", "media", "imports", "delivery", "tasks", "reports"] as const;
export type Tab = (typeof TABS)[number];
/** Settings here means Account, Preferences and Developer. Profile is always yours. */
export type Area = Tab | "settings";
export const AREAS: Area[] = [...TABS, "settings"];
export type Level = "none" | "view" | "edit";
export type Access = Record<Area, Level>;

export const AREA_LABELS: Record<Area, string> = {
  storage: "Storage",
  media: "Media",
  imports: "Imports",
  delivery: "Delivery",
  tasks: "Tasks",
  reports: "Reports",
  settings: "Settings",
};

const RANK: Record<Level, number> = { none: 0, view: 1, edit: 2 };

export const FULL_ACCESS = Object.fromEntries(AREAS.map((area) => [area, "edit"])) as Access;
export const NO_ACCESS = Object.fromEntries(AREAS.map((area) => [area, "none"])) as Access;

export function parseAccess(raw: string | null | undefined): Access {
  let value: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(raw ?? "{}");
    if (parsed && typeof parsed === "object") value = parsed;
  } catch {}
  return Object.fromEntries(
    AREAS.map((area) => [area, value[area] === "view" || value[area] === "edit" ? value[area] : "none"]),
  ) as Access;
}

/** True when any of the areas reaches the level. */
export function can(access: Access, area: Area | Area[], need: Exclude<Level, "none">) {
  return (Array.isArray(area) ? area : [area]).some((a) => RANK[access[a]] >= RANK[need]);
}

/** Tabs hidden for everyone. Storage is the one tab that is always shown. */
export function parseHidden(raw: string | null | undefined): Tab[] {
  try {
    const list = JSON.parse(raw ?? "[]");
    return Array.isArray(list) ? TABS.filter((tab) => tab !== "storage" && list.includes(tab)) : [];
  } catch {
    return [];
  }
}
