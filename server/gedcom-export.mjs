/**
 * Normalized model → GEDCOM 5.5.1 (UTF-8).
 * Writes a NEW file under data/exports/. Refuses data.ged / data.gramps.
 * Local FILE/OBJE paths are omitted — Ancestry cannot see them.
 */
import fs from "node:fs";
import path from "node:path";
import { assertSafeExportPath } from "./gramps-export.mjs";

const MONTHS = ["", "JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

const EVENT_TAG = {
  Birth: "BIRT", Baptism: "BAPM", Christening: "CHR", Death: "DEAT", Burial: "BURI",
  Cremation: "CREM", Marriage: "MARR", Divorce: "DIV", Engagement: "ENGA",
  "Marriage Contract": "MARC", "Marriage Bann": "MARB", "Marriage License": "MARL",
  Census: "CENS", Immigration: "IMMI", Emigration: "EMIG", Naturalization: "NATU",
  Occupation: "OCCU", Religion: "RELI", Education: "EDUC", Graduation: "GRAD",
  Retirement: "RETI", Probate: "PROB", Will: "WILL", Confirmation: "CONF",
  "Bar Mitzvah": "BARM", "Bas Mitzvah": "BASM", Adoption: "ADOP", Residence: "RESI",
  Event: "EVEN",
};

const FAMILY_TYPES = new Set(["Marriage", "Divorce", "Engagement", "Marriage Contract", "Marriage Bann", "Marriage License", "Annulment"]);

function xref(id) {
  return `@${String(id || "").replace(/@/g, "")}@`;
}

function isoToGed(val) {
  const m = String(val || "").trim().match(/^(-?\d{1,4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?/);
  if (!m) return String(val || "").trim();
  const year = m[1];
  const month = m[2] ? MONTHS[Number(m[2])] : "";
  const day = m[3] ? String(Number(m[3])) : "";
  if (day && month) return `${day} ${month} ${year}`;
  if (month) return `${month} ${year}`;
  return year;
}

function dateToGed(date) {
  if (!date) return "";
  if (date.kind === "range" && (date.start || date.stop)) {
    return `BET ${isoToGed(date.start)} AND ${isoToGed(date.stop)}`;
  }
  if (date.kind === "span" && (date.start || date.stop)) {
    if (date.start && date.stop) return `FROM ${isoToGed(date.start)} TO ${isoToGed(date.stop)}`;
    if (date.start) return `FROM ${isoToGed(date.start)}`;
    return `TO ${isoToGed(date.stop)}`;
  }
  const prefix = date.type === "about" ? "ABT"
    : date.type === "before" ? "BEF"
      : date.type === "after" ? "AFT"
        : date.quality === "estimated" ? "EST"
          : date.quality === "calculated" ? "CAL"
            : "";
  const core = date.val ? isoToGed(date.val) : (date.text || date.val || "");
  const cleaned = String(core).replace(/^(about|abt\.?|before|bef\.?|after|aft\.?|est\.?|estimated|calc\.?|calculated)\s+/i, "").trim();
  return prefix ? `${prefix} ${cleaned}`.trim() : cleaned;
}

function placeName(model, ev) {
  if (!ev) return "";
  if (ev.placeText) return ev.placeText;
  const id = ev.place;
  if (!id) return "";
  const p = model.places[id];
  return p?.title || p?.name || "";
}

function emitChunked(level, tag, text) {
  const raw = String(text ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!raw) return [`${level} ${tag}`];
  const lines = raw.split("\n");
  const out = [];
  const limit = 240;
  const pushParts = (lvl, t, value) => {
    let rest = value;
    let first = true;
    while (rest.length) {
      const take = rest.slice(0, limit);
      rest = rest.slice(limit);
      if (first) {
        out.push(`${lvl} ${t} ${take}`);
        first = false;
      } else {
        out.push(`${lvl + 1} CONC ${take}`);
      }
    }
    if (first) out.push(`${lvl} ${t}`);
  };
  pushParts(level, tag, lines[0]);
  for (const line of lines.slice(1)) {
    if (!line) {
      out.push(`${level + 1} CONT`);
      continue;
    }
    let rest = line;
    out.push(`${level + 1} CONT ${rest.slice(0, limit)}`);
    rest = rest.slice(limit);
    while (rest.length) {
      out.push(`${level + 1} CONC ${rest.slice(0, limit)}`);
      rest = rest.slice(limit);
    }
  }
  return out;
}

function citeLines(model, ids, level) {
  const out = [];
  for (const cid of ids || []) {
    const c = model.citations[cid];
    if (!c?.source || !model.sources[c.source]) continue;
    out.push(`${level} SOUR ${xref(c.source)}`);
    if (c.page) out.push(...emitChunked(level + 1, "PAGE", c.page));
  }
  return out;
}

function noteLines(model, ids, level) {
  const out = [];
  for (const nid of ids || []) {
    const n = model.notes[nid];
    if (!n?.text) continue;
    out.push(...emitChunked(level, "NOTE", n.text));
  }
  return out;
}

function eventLines(model, ev, level) {
  if (!ev) return [];
  const tag = EVENT_TAG[ev.type] || "EVEN";
  const value = (tag === "OCCU" || tag === "RESI" || tag === "EVEN") ? (ev.description || "") : "";
  const out = [];
  if (value) out.push(...emitChunked(level, tag, value));
  else out.push(`${level} ${tag}`);
  if (tag === "EVEN" && ev.type && ev.type !== "Event") out.push(`${level + 1} TYPE ${ev.type}`);
  const date = dateToGed(ev.date);
  if (date) out.push(`${level + 1} DATE ${date}`);
  const place = placeName(model, ev);
  if (place) out.push(...emitChunked(level + 1, "PLAC", place));
  if (ev.description && tag !== "OCCU" && tag !== "RESI" && tag !== "EVEN") {
    out.push(...emitChunked(level + 1, "NOTE", ev.description));
  }
  out.push(...citeLines(model, ev.citations, level + 1));
  out.push(...noteLines(model, ev.notes, level + 1));
  return out;
}

function nameLine(n) {
  const first = (n.first || "").trim();
  const surname = (n.surname || "").trim();
  const suffix = (n.suffix || "").trim();
  return `${first} /${surname}/${suffix ? ` ${suffix}` : ""}`.replace(/\s+/g, " ").trim();
}

function emitPerson(model, p) {
  const lines = [`0 ${xref(p.id)} INDI`];
  const names = p.names?.length ? p.names : [{ first: p.first, surname: p.surname, suffix: p.suffix }];
  names.forEach((n, i) => {
    lines.push(`1 NAME ${nameLine(n)}`);
    if (n.nick) lines.push(`2 NICK ${n.nick}`);
    if (i > 0 || n.alt) lines.push("2 TYPE aka");
  });
  const sex = p.gender === "M" || p.gender === "F" ? p.gender : "U";
  lines.push(`1 SEX ${sex}`);
  for (const ref of p.events || []) {
    const ev = model.events[ref.id];
    if (!ev || FAMILY_TYPES.has(ev.type) || ref.role === "Family") continue;
    lines.push(...eventLines(model, ev, 1));
  }
  for (const fid of p.parentFamilies || []) lines.push(`1 FAMC ${xref(fid)}`);
  for (const fid of p.families || []) lines.push(`1 FAMS ${xref(fid)}`);
  lines.push(...citeLines(model, p.citations, 1));
  lines.push(...noteLines(model, p.notes, 1));
  return lines;
}

function emitFamily(model, f) {
  const lines = [`0 ${xref(f.id)} FAM`];
  if (f.father) lines.push(`1 HUSB ${xref(f.father)}`);
  if (f.mother) lines.push(`1 WIFE ${xref(f.mother)}`);
  for (const ch of f.children || []) {
    if (ch.id) lines.push(`1 CHIL ${xref(ch.id)}`);
  }
  for (const ref of f.events || []) {
    const ev = model.events[ref.id];
    if (!ev) continue;
    lines.push(...eventLines(model, ev, 1));
  }
  lines.push(...citeLines(model, f.citations, 1));
  lines.push(...noteLines(model, f.notes, 1));
  return lines;
}

function emitSource(s) {
  const lines = [`0 ${xref(s.id)} SOUR`];
  if (s.title) lines.push(...emitChunked(1, "TITL", s.title));
  if (s.author) lines.push(...emitChunked(1, "AUTH", s.author));
  if (s.pubinfo) lines.push(...emitChunked(1, "PUBL", s.pubinfo));
  if (s.abbrev) lines.push(...emitChunked(1, "ABBR", s.abbrev));
  return lines;
}

function todayGed(d = new Date()) {
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth() + 1]} ${d.getUTCFullYear()}`;
}

export function modelToGedcom(model) {
  const people = Object.values(model.people || {}).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const families = Object.values(model.families || {}).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const sources = Object.values(model.sources || {}).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const lines = [
    "0 HEAD",
    "1 SOUR FamilyTree",
    "2 NAME Family Tree",
    "2 VERS 1",
    "1 GEDC",
    "2 VERS 5.5.1",
    "2 FORM LINEAGE-LINKED",
    "1 CHAR UTF-8",
    `1 DATE ${todayGed()}`,
  ];
  if (model.meta?.researcher) lines.push(`1 NOTE Exported from a local Family Tree database. Researcher: ${model.meta.researcher}`);
  for (const p of people) lines.push(...emitPerson(model, p));
  for (const f of families) lines.push(...emitFamily(model, f));
  for (const s of sources) lines.push(...emitSource(s));
  lines.push("0 TRLR");
  return `${lines.join("\n")}\n`;
}

export function exportGedcomStampName(prefix = "tree") {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `${prefix}-${stamp}.ged`;
}

export function writeGedcomExport(model, destPath) {
  assertSafeExportPath(destPath);
  const text = modelToGedcom(model);
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const tmp = `${destPath}.tmp`;
  fs.writeFileSync(tmp, text, "utf8");
  fs.renameSync(tmp, destPath);
  return destPath;
}
