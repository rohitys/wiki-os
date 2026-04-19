/* ── Category → design type mapping (shared by homepage + wiki route) ── */

export const CAT_TYPES = ["Project", "Knowledge", "Insights", "Tooling"] as const;
export type CatType = (typeof CAT_TYPES)[number];

export function getCatType(name: string): CatType {
  const n = name.toLowerCase();
  if (n.includes("karpster") || n.includes("project") || n.includes("ripster")) return "Project";
  if (n.includes("io fund") || n.includes("market") || n.includes("research") || n.includes("fund")) return "Knowledge";
  if (n.includes("insight") || n.includes("misc") || n.includes("up next") || n.includes("idea")) return "Insights";
  if (n.includes("tool") || n.includes("automation")) return "Tooling";
  // fallback: deterministic hash
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return CAT_TYPES[h % CAT_TYPES.length] as CatType;
}

// Derive category type from file path (e.g. "Karpster/foo.md" → "Project")
export function getCatTypeFromFile(file: string): CatType {
  const folder = file.split("/")[0] ?? "";
  return getCatType(folder);
}
