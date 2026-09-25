// Per-line accents (ancestral lines seeded from great-grandparents) + confidence scale.
const PALETTE = [
  "#3dd6ff", // cyan
  "#ff7a59", // coral
  "#ffd34d", // gold
  "#8bff9a", // mint
  "#c58bff", // violet
  "#ff5fa2", // pink
  "#6fa8ff", // blue
  "#ffb86b", // amber
  "#7fe0d4", // teal
  "#e6ff6b", // lime
  "#ff9ad5", // rose
  "#9ad0ff", // sky
];

const cache = new Map();

export function lineColor(label) {
  if (!label) return "#9aa3c7";
  const key = String(label).toLowerCase().trim();
  if (key === "home") return "#f4f6fb";
  if (cache.has(key)) return cache.get(key);
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  const c = PALETTE[h % PALETTE.length];
  cache.set(key, c);
  return c;
}

export function confidenceColor(score) {
  if (score == null) return "#5a6280";
  if (score >= 70) return "#4ade80";
  if (score >= 40) return "#facc15";
  if (score > 0) return "#fb923c";
  return "#f87171";
}

export function genderColor(g) {
  return g === "M" ? "#5eb5ff" : g === "F" ? "#ff7cc2" : "#b9c0d8";
}

export const HINT_COLORS = {
  "brick-wall": "#ff5f6d",
  "missing-birth": "#ffb86b",
  "missing-birthplace": "#ffd34d",
  "missing-death": "#ffb86b",
  "missing-marriage": "#c58bff",
  "missing-spouse": "#c58bff",
  uncited: "#6fa8ff",
  "member-tree-only": "#3dd6ff",
  conflict: "#ff3d8a",
  duplicate: "#8bff9a",
};
