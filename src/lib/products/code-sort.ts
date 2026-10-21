const codeCollator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

/** Keep purely numeric product IDs ahead of lettered codes in either direction. */
export function compareProductCodes(a: string, b: string, dir: "asc" | "desc" = "desc") {
  const left = a.trim();
  const right = b.trim();
  const leftNumeric = /^\d+$/.test(left);
  const rightNumeric = /^\d+$/.test(right);

  if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;

  let comparison: number;
  if (leftNumeric) {
    const leftNumber = BigInt(left);
    const rightNumber = BigInt(right);
    comparison = leftNumber < rightNumber ? -1 : leftNumber > rightNumber ? 1 : 0;
  } else {
    comparison = codeCollator.compare(left, right);
  }

  return (dir === "asc" ? comparison : -comparison) || left.localeCompare(right);
}
