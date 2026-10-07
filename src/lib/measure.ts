/**
 * "" clears the field. "2." is an unfinished draft and must not be parsed yet.
 * At most two digits after the decimal. Anything else is rejected.
 */
export function commitMeasure(raw: string): number | null | "draft" | "invalid" {
  const text = raw.trim();
  if (text === "") return null;
  if (!/^\d*\.?\d*$/.test(text)) return "invalid";
  const fraction = text.split(".")[1] ?? "";
  if (fraction.length > 2) return "invalid";
  if (text === "." || text.endsWith(".")) return "draft";
  const value = Number(text);
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : "invalid";
}

export function roundMeasure(value: unknown) {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 10000) / 10000;
}
