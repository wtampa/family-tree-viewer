export function yearsText(v) {
  const b = v.birthLike?.date?.year;
  const d = v.deathLike?.date?.year;
  if (!b && !d) return "";
  return `${b ?? "?"}–${d ?? (v.living ? "" : "?")}`;
}

export function shortDate(date) {
  return date?.text || "";
}

export function lifespan(v) {
  const b = v.birthLike?.date?.year;
  const d = v.deathLike?.date?.year;
  if (b && d) return d - b;
  return null;
}

export function initials(name) {
  return String(name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0].toUpperCase())
    .join("");
}

export function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many || `${one}s`}`;
}

export const CONFIDENCE_LABEL = ["Very low", "Low", "Normal", "High", "Very high"];
