/**
 * GEDCOM 5.5 → same normalized model as gramps-parse.mjs.
 * Enough for royal92 and typical public sample files. Read-only.
 */
import fs from "node:fs";
import { addDerived, emptyModel } from "./gramps-parse.mjs";

const EVENT_TYPES = {
  BIRT: "Birth", CHR: "Baptism", DEAT: "Death", BURI: "Burial", CREM: "Cremation",
  MARR: "Marriage", DIV: "Divorce", ENGA: "Engagement", MARC: "Marriage Contract",
  MARB: "Marriage Bann", MARL: "Marriage License", CENS: "Census", IMMI: "Immigration",
  EMIG: "Emigration", NATU: "Naturalization", OCCU: "Occupation", RELI: "Religion",
  EDUC: "Education", GRAD: "Graduation", RETI: "Retirement", PROB: "Probate",
  WILL: "Will", CONF: "Confirmation", BARM: "Bar Mitzvah", BASM: "Bas Mitzvah",
  ADOP: "Adoption", EVEN: "Event", RESI: "Residence",
};

const MONTHS = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};

function ptr(v) {
  if (!v) return null;
  const m = String(v).match(/@([^@]+)@/);
  return m ? m[1] : null;
}

function parseGedDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  const type = /^(ABT|EST|CAL|BEF|AFT|BET|FROM|TO)\b/i.test(s)
    ? ({ ABT: "about", EST: "about", CAL: "calculated", BEF: "before", AFT: "after" }[s.slice(0, 3).toUpperCase()] || "")
    : "";
  const y = s.match(/\b(\d{3,4})\b/);
  const year = y ? Number(y[1]) : null;
  let month = null;
  for (const [k, n] of Object.entries(MONTHS)) {
    if (new RegExp(`\\b${k}\\b`, "i").test(s)) { month = n; break; }
  }
  const d = s.match(/\b(\d{1,2})\b/);
  const day = d && month ? Number(d[1]) : null;
  const mn = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  let text = s;
  if (year && month && day) text = `${type ? `${type} ` : ""}${day} ${mn[month]} ${year}`;
  else if (year && month) text = `${type ? `${type} ` : ""}${mn[month]} ${year}`;
  else if (year) text = `${type ? `${type} ` : ""}${year}`;
  const sort = year ? year * 10000 + (month || 6) * 100 + (day || 15) : null;
  return { kind: "text", text: text.trim(), year, month, day, sort, type, quality: "", val: s };
}

function cleanNamePart(s) {
  return String(s || "").replace(/_/g, " ").replace(/\s+/g, " ").trim();
}

function parseName(raw) {
  const s = String(raw || "").trim();
  const m = s.match(/^(.*?)\/([^/]*)\/(.*)$/);
  if (m) {
    return {
      first: cleanNamePart(m[1]),
      surname: cleanNamePart(m[2]),
      suffix: cleanNamePart(m[3]),
    };
  }
  return { first: cleanNamePart(s), surname: "", suffix: "" };
}

function parseLines(text) {
  const records = [];
  let rec = null;
  const stack = [];
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const m = raw.match(/^(\d+)\s+(?:@([^@]+)@\s+)?([A-Za-z0-9_@]+)(?:\s+(.*))?$/);
    if (!m) continue;
    const level = Number(m[1]);
    const xref = m[2] || "";
    const tag = m[3].toUpperCase();
    let value = m[4] || "";
    if (value.startsWith("@") && value.endsWith("@") && tag !== "NOTE") {
      /* pointer kept as-is */
    }
    const node = { level, tag, xref, value, kids: [] };
    if (level === 0) {
      rec = node;
      records.push(node);
      stack.length = 0;
      stack[0] = node;
      continue;
    }
    if (tag === "CONC") {
      const parent = stack[level - 1];
      if (parent) parent.value = (parent.value || "") + value;
      continue;
    }
    if (tag === "CONT") {
      const parent = stack[level - 1];
      if (parent) parent.value = `${parent.value || ""}\n${value}`;
      continue;
    }
    const parent = stack[level - 1];
    if (!parent) continue;
    parent.kids.push(node);
    stack[level] = node;
    stack.length = level + 1;
  }
  return records;
}

function kid(node, tag) {
  return (node.kids || []).find((k) => k.tag === tag);
}
function kids(node, tag) {
  return (node.kids || []).filter((k) => k.tag === tag);
}

function eventFrom(node, type, id) {
  const dateN = kid(node, "DATE");
  const placN = kid(node, "PLAC");
  const noteN = kid(node, "NOTE");
  const sour = kids(node, "SOUR").map((s) => ptr(s.value)).filter(Boolean);
  return {
    id,
    handle: id,
    change: 0,
    priv: false,
    type,
    date: dateN ? parseGedDate(dateN.value) : null,
    place: placN ? placN.value.trim() : null, // resolved to place id later
    placeText: placN ? placN.value.trim() : "",
    description: type === "Occupation" || type === "Residence" || type === "Event" ? (node.value || "") : "",
    citations: sour,
    notes: noteN ? [noteN.value] : [],
    media: [],
    attributes: [],
    tags: [],
  };
}

export function parseGedcom(text, meta = {}) {
  const records = parseLines(text);
  const model = emptyModel({
    file: meta.file || "",
    mtime: meta.mtime || 0,
    created: "",
    grampsVersion: "",
    researcher: "",
    format: "gedcom",
  });

  const head = records.find((r) => r.tag === "HEAD");
  if (head) {
    const sour = kid(head, "SOUR");
    model.meta.grampsVersion = sour ? `GEDCOM ${kid(head, "GEDC")?.kids?.find((k) => k.tag === "VERS")?.value || "5.5"}` : "GEDCOM";
    const date = kid(head, "DATE");
    if (date) model.meta.created = date.value;
  }

  const placeKey = new Map();
  const internPlace = (title) => {
    const t = String(title || "").trim();
    if (!t) return null;
    const key = t.toLowerCase();
    if (placeKey.has(key)) return placeKey.get(key);
    const id = `P${String(placeKey.size + 1).padStart(4, "0")}`;
    placeKey.set(key, id);
    model.places[id] = {
      id, handle: id, change: 0, priv: false,
      type: "Unknown", title: t, name: t.split(",")[0].trim() || t, names: [{ value: t, lang: "", date: null }],
      coord: null, parents: [], citations: [], notes: [], urls: [], media: [],
    };
    return id;
  };

  let eSeq = 0;
  const addEvent = (node, tag) => {
    const type = EVENT_TYPES[tag] || (node.value ? node.value : tag);
    const id = `E${String(++eSeq).padStart(5, "0")}`;
    const ev = eventFrom(node, type, id);
    ev.place = internPlace(ev.placeText);
    ev.notes = [];
    model.events[id] = ev;
    return id;
  };

  let nSeq = 0;
  const addNote = (raw) => {
    const text = String(raw || "").trim();
    if (!text) return null;
    const id = `N${String(++nSeq).padStart(4, "0")}`;
    model.notes[id] = {
      id, handle: id, change: 0, priv: false, type: "General", format: "0", text,
      urls: (text.match(/https?:\/\/[^\s<>"')\]]+/g) || []).map((u) => u.replace(/[.,;]+$/, "")),
      tags: [],
    };
    return id;
  };

  let cSeq = 0;
  const addCite = (sourId, page) => {
    if (!sourId) return null;
    const id = `C${String(++cSeq).padStart(4, "0")}`;
    model.citations[id] = {
      id, handle: id, change: 0, priv: false,
      page: page || "", confidence: 2, date: null, source: sourId, notes: [], media: [], attributes: [],
    };
    return id;
  };

  for (const rec of records) {
    if (rec.tag === "SOUR" && rec.xref) {
      const id = rec.xref;
      const titl = kid(rec, "TITL")?.value || kid(rec, "ABBR")?.value || "(untitled source)";
      const auth = kid(rec, "AUTH")?.value || "";
      const pub = kid(rec, "PUBL")?.value || "";
      model.sources[id] = {
        id, handle: id, change: 0, priv: false,
        title: titl, author: auth, pubinfo: pub, abbrev: kid(rec, "ABBR")?.value || "",
        notes: [], media: [], attributes: [], repositories: [],
      };
    }
  }

  for (const rec of records) {
    if (rec.tag !== "INDI" || !rec.xref) continue;
    const id = rec.xref;
    const nameN = kid(rec, "NAME") || { value: "", kids: [] };
    const parsed = parseName(nameN.value);
    const nick = kid(nameN, "NICK")?.value || kid(rec, "NICK")?.value || "";
    const sex = (kid(rec, "SEX")?.value || "U").slice(0, 1).toUpperCase();
    const display = [parsed.first, parsed.surname, parsed.suffix].filter(Boolean).join(" ") || "(unnamed)";
    const events = [];
    const citations = [];
    const notes = [];
    const media = [];
    for (const k of rec.kids) {
      if (EVENT_TYPES[k.tag] || k.tag === "EVEN") {
        const eid = addEvent(k, k.tag);
        events.push({ id: eid, role: "Primary" });
        for (const s of kids(k, "SOUR")) {
          const cid = addCite(ptr(s.value) || s.value.replace(/@/g, ""), kid(s, "PAGE")?.value || "");
          if (cid) {
            citations.push(cid);
            model.events[eid].citations.push(cid);
          }
        }
      }
      if (k.tag === "NOTE") {
        const nid = addNote(ptr(k.value) ? "" : k.value);
        if (nid) notes.push(nid);
      }
      if (k.tag === "SOUR") {
        const cid = addCite(ptr(k.value), kid(k, "PAGE")?.value || "");
        if (cid) citations.push(cid);
      }
      if (k.tag === "OBJE" && !ptr(k.value)) {
        const file = kid(k, "FILE")?.value || "";
        if (/\.(png|jpe?g|gif|webp)$/i.test(file)) {
          const mid = `M_${id}_${media.length}`;
          model.media[mid] = {
            id: mid, handle: mid, change: 0, priv: false,
            src: file, mime: "", description: display, checksum: "",
            date: null, citations: [], notes: [], attributes: [], tags: [],
          };
          media.push({ id: mid });
        }
      }
    }
    const famc = kids(rec, "FAMC").map((x) => ptr(x.value)).filter(Boolean);
    const fams = kids(rec, "FAMS").map((x) => ptr(x.value)).filter(Boolean);
    model.people[id] = {
      id, handle: id, change: 0, priv: false,
      gender: sex === "M" || sex === "F" ? sex : "U",
      name: display,
      first: parsed.first,
      surname: parsed.surname,
      suffix: parsed.suffix,
      names: [{
        type: "Birth Name", alt: false, first: parsed.first, surname: parsed.surname,
        surnames: parsed.surname ? [{ value: parsed.surname, prim: true, prefix: "", connector: "", derivation: "" }] : [],
        suffix: parsed.suffix, title: "", call: "", nick: cleanNamePart(nick), date: null, citations: [], notes: [],
      }],
      events,
      parentFamilies: famc,
      families: fams,
      citations,
      notes,
      media,
      attributes: [],
      urls: [],
      associations: [],
      tags: [],
    };
    model.handleToId[id] = id;
  }

  for (const rec of records) {
    if (rec.tag !== "FAM" || !rec.xref) continue;
    const id = rec.xref;
    const events = [];
    const citations = [];
    const notes = [];
    for (const k of rec.kids) {
      if (EVENT_TYPES[k.tag] || k.tag === "EVEN") {
        const eid = addEvent(k, k.tag);
        events.push({ id: eid, role: "Family" });
      }
      if (k.tag === "NOTE") {
        const nid = addNote(ptr(k.value) ? "" : k.value);
        if (nid) notes.push(nid);
      }
      if (k.tag === "SOUR") {
        const cid = addCite(ptr(k.value), kid(k, "PAGE")?.value || "");
        if (cid) citations.push(cid);
      }
    }
    model.families[id] = {
      id, handle: id, change: 0, priv: false,
      relType: kid(rec, "MARR") ? "Married" : "Unknown",
      father: ptr(kid(rec, "HUSB")?.value),
      mother: ptr(kid(rec, "WIFE")?.value),
      children: kids(rec, "CHIL").map((c) => ({ id: ptr(c.value), frel: "Birth", mrel: "Birth" })).filter((c) => c.id),
      events,
      citations,
      notes,
      media: [],
      attributes: [],
      tags: [],
    };
    model.handleToId[id] = id;
  }

  addDerived(model);
  return model;
}

export function loadGedcom(file) {
  const st = fs.statSync(file);
  const text = fs.readFileSync(file, "utf8");
  return parseGedcom(text, { file, mtime: st.mtimeMs });
}
