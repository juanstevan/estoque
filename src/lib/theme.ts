/** Shades of the accent scale, mixed from the one picked color. 600 is the color itself. */
const SHADES: [string, number, "white" | "black"][] = [
  ["50", 8, "white"],
  ["100", 16, "white"],
  ["200", 30, "white"],
  ["300", 48, "white"],
  ["400", 70, "white"],
  ["500", 88, "white"],
  ["600", 100, "white"],
  ["700", 80, "black"],
  ["800", 64, "black"],
];

/**
 * CSS vars for an accent color. Buttons, the active tab line, focus rings, checkboxes and
 * selected rows read both the raw `--blue-*` scale and Tailwind's `--color-blue-*` copies.
 */
export function accentVars(hex: string) {
  const vars: Record<string, string> = {};
  for (const [shade, pct, base] of SHADES) {
    const value = pct === 100 ? hex : `color-mix(in oklab, ${hex} ${pct}%, ${base})`;
    vars[`--blue-${shade}`] = value;
    vars[`--color-blue-${shade}`] = value;
  }
  vars["--color-selected"] = vars["--blue-50"];
  return vars;
}

export function isDark(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.6;
}

/** The top bar on a brand color. On a dark brand its grays turn light, so nothing inside needs its own classes. */
export function brandVars(hex: string): Record<string, string> {
  if (!isDark(hex)) return { "--color-surface": hex };
  return {
    "--color-surface": hex,
    "--color-border": "transparent",
    "--color-gray-100": "rgb(255 255 255 / 0.14)",
    "--color-gray-150": "rgb(255 255 255 / 0.2)",
    "--color-gray-500": "rgb(255 255 255 / 0.7)",
    "--color-gray-600": "rgb(255 255 255 / 0.72)",
    "--color-gray-700": "rgb(255 255 255 / 0.85)",
    "--color-gray-900": "#ffffff",
    "--primary": "#ffffff",
  };
}
