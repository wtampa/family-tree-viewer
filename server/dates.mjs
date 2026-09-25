/**
 * Gramps-style date parse for the editor. Mirrors parseDate() output in gramps-parse.mjs.
 */
const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
  january: 1, february: 2, march: 3, april: 4, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

const MN = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function isoParts(val) {
  if (!val) return null;
  const m = String(val).match(/^(-?\d{1,4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?/);
  if (!m) return null;
  return { year: Number(m[1]), month: m[2] ? Number(m[2]) : null, day: m[3] ? Number(m[3]) : null };
}

export function looseParts(str) {
  if (!str) return null;
  const s = String(str).toLowerCase();
  const y = s.match(/(-?\d{1,4})\b/);
  if (!y) return null;
  const year = Number(y[1]);
  let month = null;
  for (const [k, v] of Object.entries(MONTHS)) {
    if (new RegExp(`\\b${k}\\b`).test(s)) { month = v; break; }
  }
  const d = s.match(/\b(\d{1,2})\b(?!\d)/);
  const day = d && month ? Number(d[1]) : null;
  return { year, month, day };
}

export function fmtParts(p) {
  if (!p) return "";
  if (p.day && p.month) return `${p.day} ${MN[p.month]} ${p.year}`;
  if (p.month) return `${MN[p.month]} ${p.year}`;
  return String(p.year);
}

export function sortKey(p) {
  if (!p) return null;
  return p.year * 10000 + (p.month || 6) * 100 + (p.day || 15);
}

function toIsoVal(p) {
  if (!p?.year && p?.year !== 0) return "";
  const y = String(p.year).padStart(4, "0");
  if (p.month && p.day) return `${y}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  if (p.month) return `${y}-${String(p.month).padStart(2, "0")}`;
  return y;
}

function peel(str, re) {
  const m = String(str).match(re);
  if (!m) return { hit: false, rest: str, cap: "" };
  return { hit: true, rest: str.slice(m[0].length).trim(), cap: m[1] || "" };
}

/** Parse a typed date string into the same shape as Gramps XML parseDate(). */
export function parseDateText(raw) {
  const original = String(raw || "").trim();
  if (!original) return null;
  let quality = "";
  let type = "";
  let rest = original;

  const est = peel(rest, /^(est\.?|estimated)\s+/i);
  if (est.hit) { quality = "estimated"; rest = est.rest; }
  const calc = peel(rest, /^(calc\.?|calculated)\s+/i);
  if (calc.hit) { quality = "calculated"; rest = calc.rest; }
  const abt = peel(rest, /^(about|abt\.?|circa|c\.)\s+/i);
  if (abt.hit) { type = "about"; rest = abt.rest; }
  const bef = peel(rest, /^(before|bef\.?)\s+/i);
  if (bef.hit) { type = "before"; rest = bef.rest; }
  const aft = peel(rest, /^(after|aft\.?)\s+/i);
  if (aft.hit) { type = "after"; rest = aft.rest; }

  const between = rest.match(/^(?:between|bet\.?)\s+(.+?)\s+and\s+(.+)$/i);
  if (between) {
    const a = isoParts(toIsoVal(looseParts(between[1]) || isoParts(between[1]))) || looseParts(between[1]);
    const b = isoParts(toIsoVal(looseParts(between[2]) || isoParts(between[2]))) || looseParts(between[2]);
    return {
      kind: "range",
      text: `between ${fmtParts(a)} and ${fmtParts(b)}`,
      year: a?.year ?? b?.year ?? null,
      month: a?.month ?? null,
      day: a?.day ?? null,
      sort: sortKey(a || b),
      start: toIsoVal(a),
      stop: toIsoVal(b),
      quality,
    };
  }
  const span = rest.match(/^(?:from)\s+(.+?)\s+to\s+(.+)$/i);
  if (span) {
    const a = isoParts(span[1]) || looseParts(span[1]);
    const b = isoParts(span[2]) || looseParts(span[2]);
    return {
      kind: "span",
      text: `from ${fmtParts(a)} to ${fmtParts(b)}`,
      year: a?.year ?? b?.year ?? null,
      month: a?.month ?? null,
      day: a?.day ?? null,
      sort: sortKey(a || b),
      start: toIsoVal(a),
      stop: toIsoVal(b),
      quality,
    };
  }

  const iso = isoParts(rest) && /^\s*-?\d{1,4}(?:-\d{1,2})?(?:-\d{1,2})?\s*$/.test(rest) ? isoParts(rest) : looseParts(rest);
  if (iso?.year != null) {
    const prefix = type ? `${type} ` : quality === "estimated" ? "est. " : quality === "calculated" ? "calc. " : "";
    return {
      kind: "value",
      text: `${prefix}${fmtParts(iso)}`.trim(),
      year: iso.year,
      month: iso.month ?? null,
      day: iso.day ?? null,
      sort: sortKey(iso),
      type,
      quality,
      val: toIsoVal(iso),
    };
  }
  const p = looseParts(original);
  return { kind: "text", text: original, year: p?.year ?? null, month: p?.month ?? null, day: p?.day ?? null, sort: sortKey(p), uncertain: /\?/.test(original) };
}

export const EVENT_TYPES = [
  "Birth", "Baptism", "Christening", "Death", "Burial", "Cremation",
  "Marriage", "Divorce", "Census", "Residence", "Occupation", "Immigration",
  "Emigration", "Naturalization", "Military Service", "Probate", "Will",
  "Education", "Graduation", "Religion", "Election", "Other",
];
