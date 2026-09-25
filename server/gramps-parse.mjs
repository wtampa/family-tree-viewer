/**
 * Gramps XML (1.7.x) → normalized JSON model.
 * Read-only. Handles both plain XML and gzip-compressed .gramps files.
 */
import fs from "node:fs";
import zlib from "node:zlib";
import { XMLParser } from "fast-xml-parser";

const ARRAY_TAGS = new Set([
  "event", "person", "family", "citation", "source", "placeobj", "object", "repository", "note", "tag",
  "name", "surname", "eventref", "childref", "citationref", "noteref", "objref", "attribute", "url",
  "pname", "placeref", "parentin", "childof", "reporef", "srcattribute", "style", "range", "personref",
  "tagref", "address", "lds_ord", "datestr", "dateval", "daterange", "datespan", "alt_name",
]);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  trimValues: true,
  parseTagValue: false,
  parseAttributeValue: false,
  isArray: (name) => ARRAY_TAGS.has(name),
});

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
  january: 1, february: 2, march: 3, april: 4, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

function text(node) {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (typeof node === "object" && "#text" in node) return String(node["#text"]);
  return "";
}
function attr(node, name) {
  if (!node || typeof node !== "object") return undefined;
  return node[`@_${name}`];
}
function list(node, key) {
  const v = node?.[key];
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}
function refs(node, key) {
  return list(node, key).map((r) => attr(r, "hlink")).filter(Boolean);
}

/** Parse "YYYY-MM-DD" | "YYYY-MM" | "YYYY" → {year, month, day} */
function isoParts(val) {
  if (!val) return null;
  const m = String(val).match(/^(-?\d{1,4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?/);
  if (!m) return null;
  return { year: Number(m[1]), month: m[2] ? Number(m[2]) : null, day: m[3] ? Number(m[3]) : null };
}

/** Loose parse of free-text date strings ("14 February 1885", "16 Feb 1891 ??", "abt 1840") */
function looseParts(str) {
  if (!str) return null;
  const s = String(str).toLowerCase();
  const y = s.match(/(\d{4})/);
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

function fmtParts(p) {
  if (!p) return "";
  const mn = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  if (p.day && p.month) return `${p.day} ${mn[p.month]} ${p.year}`;
  if (p.month) return `${mn[p.month]} ${p.year}`;
  return String(p.year);
}

function sortKey(p) {
  if (!p) return null;
  return p.year * 10000 + (p.month || 6) * 100 + (p.day || 15);
}

/** Normalize a Gramps date child element into {text, year, sort, kind, quality, ...} */
function parseDate(node) {
  const dv = list(node, "dateval")[0];
  const dr = list(node, "daterange")[0];
  const ds = list(node, "datespan")[0];
  const dstr = list(node, "datestr")[0];
  if (dv) {
    const p = isoParts(attr(dv, "val"));
    const type = attr(dv, "type") || ""; // before | after | about
    const quality = attr(dv, "quality") || ""; // estimated | calculated
    const prefix = type ? `${type} ` : quality === "estimated" ? "est. " : quality === "calculated" ? "calc. " : "";
    return { kind: "value", text: `${prefix}${fmtParts(p)}`.trim(), year: p?.year ?? null, month: p?.month ?? null, day: p?.day ?? null, sort: sortKey(p), type, quality, val: attr(dv, "val") };
  }
  if (dr || ds) {
    const n = dr || ds;
    const a = isoParts(attr(n, "start"));
    const b = isoParts(attr(n, "stop"));
    const kind = dr ? "range" : "span";
    const text = dr ? `between ${fmtParts(a)} and ${fmtParts(b)}` : `from ${fmtParts(a)} to ${fmtParts(b)}`;
    return { kind, text, year: a?.year ?? b?.year ?? null, month: a?.month ?? null, day: a?.day ?? null, sort: sortKey(a || b), start: attr(n, "start"), stop: attr(n, "stop"), quality: attr(n, "quality") || "" };
  }
  if (dstr) {
    const raw = attr(dstr, "val") || "";
    const p = looseParts(raw);
    return { kind: "text", text: raw, year: p?.year ?? null, month: p?.month ?? null, day: p?.day ?? null, sort: sortKey(p), uncertain: /\?/.test(raw) };
  }
  return null;
}

function parseAttributes(node) {
  return list(node, "attribute").map((a) => ({ type: attr(a, "type"), value: attr(a, "value"), citations: refs(a, "citationref") }));
}

function parseUrls(node) {
  return list(node, "url").map((u) => ({ href: attr(u, "href"), type: attr(u, "type") || "", description: attr(u, "description") || "" }));
}

export function readGrampsFile(file) {
  const buf = fs.readFileSync(file);
  const isGzip = buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b;
  return (isGzip ? zlib.gunzipSync(buf) : buf).toString("utf8");
}

/**
 * @param {string} xml
 * @param {{file?: string, mtime?: number}} meta
 */
export function parseGrampsXml(xml, meta = {}) {
  const doc = parser.parse(xml);
  const db = doc.database || {};
  const header = db.header || {};

  const handleToId = {};
  const model = {
    meta: {
      file: meta.file || "",
      mtime: meta.mtime || 0,
      created: attr(header.created, "date") || "",
      grampsVersion: attr(header.created, "version") || "",
      researcher: text(header.researcher?.resname) || "",
      counts: {},
    },
    people: {},
    families: {},
    events: {},
    places: {},
    citations: {},
    sources: {},
    notes: {},
    media: {},
    repositories: {},
    tags: {},
    handleToId,
  };

  const register = (node, fallbackPrefix, i) => {
    const handle = attr(node, "handle");
    const id = attr(node, "id") || `${fallbackPrefix}${i}`;
    if (handle) handleToId[handle] = id;
    return { handle, id, change: Number(attr(node, "change") || 0), priv: attr(node, "priv") === "1" };
  };

  // --- tags
  list(db.tags, "tag").forEach((t, i) => {
    const b = register(t, "T", i);
    model.tags[b.id] = { ...b, name: attr(t, "name") || "", color: attr(t, "color") || "" };
  });

  // --- events
  list(db.events, "event").forEach((e, i) => {
    const b = register(e, "E", i);
    model.events[b.id] = {
      ...b,
      type: text(e.type) || "Unknown",
      date: parseDate(e),
      place: attr(list(e, "place")[0], "hlink") || null,
      description: text(e.description) || "",
      citations: refs(e, "citationref"),
      notes: refs(e, "noteref"),
      media: list(e, "objref").map((o) => ({ ref: attr(o, "hlink") })),
      attributes: parseAttributes(e),
      tags: refs(e, "tagref"),
    };
  });

  // --- people
  list(db.people, "person").forEach((p, i) => {
    const b = register(p, "I", i);
    const names = list(p, "name").map((n) => {
      const surnames = list(n, "surname").map((s) => ({
        value: text(s),
        prim: attr(s, "prim") !== "0",
        prefix: attr(s, "prefix") || "",
        connector: attr(s, "connector") || "",
        derivation: attr(s, "derivation") || "",
      }));
      return {
        type: attr(n, "type") || "Birth Name",
        alt: attr(n, "alt") === "1",
        first: text(n.first) || "",
        surname: surnames.map((s) => [s.prefix, s.value].filter(Boolean).join(" ")).join(" ").trim(),
        surnames,
        suffix: text(n.suffix) || "",
        title: text(n.title) || "",
        call: text(n.call) || "",
        nick: text(n.nick) || "",
        date: parseDate(n),
        citations: refs(n, "citationref"),
        notes: refs(n, "noteref"),
      };
    });
    // Preferred: the first non-alt name with something in it; else first with a first name; else first.
    const withContent = names.filter((n) => n.first || n.surname);
    const primary = withContent.find((n) => !n.alt && n.type === "Birth Name" && n.first) || withContent.find((n) => !n.alt && n.first) || withContent.find((n) => n.first) || withContent[0] || names[0] || { first: "", surname: "", suffix: "" };
    const display = [primary.first, primary.surname, primary.suffix].filter(Boolean).join(" ").trim() || "(unnamed)";
    model.people[b.id] = {
      ...b,
      gender: text(p.gender) || "U",
      name: display,
      first: primary.first,
      surname: primary.surname,
      suffix: primary.suffix,
      names,
      events: list(p, "eventref").map((r) => ({ ref: attr(r, "hlink"), role: attr(r, "role") || "Primary" })),
      parentFamilies: refs(p, "childof"),
      families: refs(p, "parentin"),
      citations: refs(p, "citationref"),
      notes: refs(p, "noteref"),
      media: list(p, "objref").map((o) => ({ ref: attr(o, "hlink"), region: o.region ? { x1: attr(o.region, "corner1_x"), y1: attr(o.region, "corner1_y"), x2: attr(o.region, "corner2_x"), y2: attr(o.region, "corner2_y") } : null })),
      attributes: parseAttributes(p),
      urls: parseUrls(p),
      associations: list(p, "personref").map((r) => ({ ref: attr(r, "hlink"), rel: attr(r, "rel") || "" })),
      tags: refs(p, "tagref"),
    };
  });

  // --- families
  list(db.families, "family").forEach((f, i) => {
    const b = register(f, "F", i);
    model.families[b.id] = {
      ...b,
      relType: attr(list(f, "rel")[0] || f.rel, "type") || "Unknown",
      father: attr(f.father, "hlink") || null,
      mother: attr(f.mother, "hlink") || null,
      children: list(f, "childref").map((c) => ({ ref: attr(c, "hlink"), frel: attr(c, "frel") || "Birth", mrel: attr(c, "mrel") || "Birth" })),
      events: list(f, "eventref").map((r) => ({ ref: attr(r, "hlink"), role: attr(r, "role") || "Family" })),
      citations: refs(f, "citationref"),
      notes: refs(f, "noteref"),
      media: list(f, "objref").map((o) => ({ ref: attr(o, "hlink") })),
      attributes: parseAttributes(f),
      tags: refs(f, "tagref"),
    };
  });

  // --- citations
  list(db.citations, "citation").forEach((c, i) => {
    const b = register(c, "C", i);
    model.citations[b.id] = {
      ...b,
      page: text(c.page) || "",
      confidence: Number(text(c.confidence) || 2),
      date: parseDate(c),
      source: attr(c.sourceref, "hlink") || null,
      notes: refs(c, "noteref"),
      media: list(c, "objref").map((o) => ({ ref: attr(o, "hlink") })),
      attributes: list(c, "srcattribute").map((a) => ({ type: attr(a, "type"), value: attr(a, "value") })),
    };
  });

  // --- sources
  list(db.sources, "source").forEach((s, i) => {
    const b = register(s, "S", i);
    model.sources[b.id] = {
      ...b,
      title: text(s.stitle) || "(untitled source)",
      author: text(s.sauthor) || "",
      pubinfo: text(s.spubinfo) || "",
      abbrev: text(s.sabbrev) || "",
      notes: refs(s, "noteref"),
      media: list(s, "objref").map((o) => ({ ref: attr(o, "hlink") })),
      attributes: list(s, "srcattribute").map((a) => ({ type: attr(a, "type"), value: attr(a, "value") })),
      repositories: list(s, "reporef").map((r) => ({ ref: attr(r, "hlink"), medium: attr(r, "medium") || "", callno: text(r.callno) || "" })),
    };
  });

  // --- places
  list(db.places, "placeobj").forEach((p, i) => {
    const b = register(p, "P", i);
    const names = list(p, "pname").map((n) => ({ value: attr(n, "value") || "", lang: attr(n, "lang") || "", date: parseDate(n) }));
    const coord = p.coord ? { lat: Number(attr(p.coord, "lat")), long: Number(attr(p.coord, "long")) } : null;
    model.places[b.id] = {
      ...b,
      type: attr(p, "type") || "Unknown",
      title: text(p.ptitle) || names[0]?.value || "",
      name: names[0]?.value || text(p.ptitle) || "",
      names,
      coord: coord && Number.isFinite(coord.lat) && Number.isFinite(coord.long) ? coord : null,
      parents: refs(p, "placeref"),
      citations: refs(p, "citationref"),
      notes: refs(p, "noteref"),
      urls: parseUrls(p),
      media: list(p, "objref").map((o) => ({ ref: attr(o, "hlink") })),
    };
  });

  // --- media objects
  list(db.objects, "object").forEach((o, i) => {
    const b = register(o, "O", i);
    const f = o.file || {};
    model.media[b.id] = {
      ...b,
      src: attr(f, "src") || "",
      mime: attr(f, "mime") || "",
      description: attr(f, "description") || "",
      checksum: attr(f, "checksum") || "",
      date: parseDate(o),
      citations: refs(o, "citationref"),
      notes: refs(o, "noteref"),
      attributes: parseAttributes(o),
      tags: refs(o, "tagref"),
    };
  });

  // --- repositories
  list(db.repositories, "repository").forEach((r, i) => {
    const b = register(r, "R", i);
    model.repositories[b.id] = {
      ...b,
      type: text(r.rname) ? text(r.type) : text(r.type) || "Unknown",
      name: text(r.rname) || "",
      urls: parseUrls(r),
      notes: refs(r, "noteref"),
    };
  });

  // --- notes
  list(db.notes, "note").forEach((n, i) => {
    const b = register(n, "N", i);
    const t = text(n.text);
    model.notes[b.id] = {
      ...b,
      type: attr(n, "type") || "General",
      format: attr(n, "format") || "0",
      text: t,
      urls: (t.match(/https?:\/\/[^\s<>"')\]]+/g) || []).map((u) => u.replace(/[.,;]+$/, "")),
      tags: refs(n, "tagref"),
    };
  });

  resolveHandles(model);
  addDerived(model);
  return model;
}

/** Map Gramps XML handles → public IDs on every ref. */
export function resolveHandles(model) {
  const handleToId = model.handleToId || {};
  const H = (h) => (h ? handleToId[h] || null : null);
  const HL = (arr) => (arr || []).map(H).filter(Boolean);
  for (const p of Object.values(model.people)) {
    p.events = p.events.map((e) => ({ id: H(e.ref), role: e.role })).filter((e) => e.id);
    p.parentFamilies = HL(p.parentFamilies);
    p.families = HL(p.families);
    p.citations = HL(p.citations);
    p.notes = HL(p.notes);
    p.media = p.media.map((m) => ({ id: H(m.ref), region: m.region })).filter((m) => m.id);
    p.associations = p.associations.map((a) => ({ id: H(a.ref), rel: a.rel })).filter((a) => a.id);
    p.tags = HL(p.tags);
    for (const n of p.names) { n.citations = HL(n.citations); n.notes = HL(n.notes); }
    for (const a of p.attributes) a.citations = HL(a.citations || []);
  }
  for (const f of Object.values(model.families)) {
    f.father = H(f.father);
    f.mother = H(f.mother);
    f.children = f.children.map((c) => ({ id: H(c.ref), frel: c.frel, mrel: c.mrel })).filter((c) => c.id);
    f.events = f.events.map((e) => ({ id: H(e.ref), role: e.role })).filter((e) => e.id);
    f.citations = HL(f.citations);
    f.notes = HL(f.notes);
    f.media = f.media.map((m) => ({ id: H(m.ref) })).filter((m) => m.id);
    f.tags = HL(f.tags);
  }
  for (const e of Object.values(model.events)) {
    e.place = H(e.place);
    e.citations = HL(e.citations);
    e.notes = HL(e.notes);
    e.media = e.media.map((m) => ({ id: H(m.ref) })).filter((m) => m.id);
    e.tags = HL(e.tags);
    for (const a of e.attributes) a.citations = HL(a.citations || []);
  }
  for (const c of Object.values(model.citations)) {
    c.source = H(c.source);
    c.notes = HL(c.notes);
    c.media = c.media.map((m) => ({ id: H(m.ref) })).filter((m) => m.id);
  }
  for (const s of Object.values(model.sources)) {
    s.notes = HL(s.notes);
    s.media = s.media.map((m) => ({ id: H(m.ref) })).filter((m) => m.id);
    s.repositories = s.repositories.map((r) => ({ id: H(r.ref), medium: r.medium, callno: r.callno })).filter((r) => r.id);
  }
  for (const p of Object.values(model.places)) {
    p.parents = HL(p.parents);
    p.citations = HL(p.citations);
    p.notes = HL(p.notes);
    p.media = p.media.map((m) => ({ id: H(m.ref) })).filter((m) => m.id);
  }
  for (const m of Object.values(model.media)) {
    m.citations = HL(m.citations);
    m.notes = HL(m.notes);
    m.tags = HL(m.tags);
  }
  for (const r of Object.values(model.repositories)) r.notes = HL(r.notes);
  for (const n of Object.values(model.notes)) n.tags = HL(n.tags);
}

/** Back-references, place titles, counts. IDs must already be resolved. */
export function addDerived(model) {
  for (const p of Object.values(model.people)) p.eventsBack = [];
  for (const e of Object.values(model.events)) { e.people = []; e.families = []; }
  for (const p of Object.values(model.people)) for (const e of p.events) model.events[e.id]?.people.push({ id: p.id, role: e.role });
  for (const f of Object.values(model.families)) for (const e of f.events) model.events[e.id]?.families.push({ id: f.id, role: e.role });
  for (const c of Object.values(model.citations)) c.usedBy = [];
  const cite = (kind, id, cids) => { for (const c of cids || []) model.citations[c]?.usedBy.push({ kind, id }); };
  for (const p of Object.values(model.people)) { cite("person", p.id, p.citations); for (const n of p.names) cite("name", p.id, n.citations); }
  for (const f of Object.values(model.families)) cite("family", f.id, f.citations);
  for (const e of Object.values(model.events)) cite("event", e.id, e.citations);
  for (const p of Object.values(model.places)) cite("place", p.id, p.citations);
  for (const m of Object.values(model.media)) cite("media", m.id, m.citations);
  for (const s of Object.values(model.sources)) s.citationCount = 0;
  for (const c of Object.values(model.citations)) if (c.source && model.sources[c.source]) model.sources[c.source].citationCount++;

  for (const p of Object.values(model.places)) {
    if (!p.title && p.parents.length) {
      const chain = [p.name];
      let cur = p;
      let guard = 0;
      while (cur.parents.length && guard++ < 10) { cur = model.places[cur.parents[0]]; if (!cur) break; chain.push(cur.name); }
      p.title = chain.filter(Boolean).join(", ");
    }
  }

  model.meta.counts = {
    people: Object.keys(model.people).length,
    families: Object.keys(model.families).length,
    events: Object.keys(model.events).length,
    places: Object.keys(model.places).length,
    citations: Object.keys(model.citations).length,
    sources: Object.keys(model.sources).length,
    notes: Object.keys(model.notes).length,
    media: Object.keys(model.media).length,
    repositories: Object.keys(model.repositories).length,
  };
  return model;
}

export function emptyModel(meta = {}) {
  return {
    meta: { file: "", mtime: 0, created: "", grampsVersion: "", researcher: "", counts: {}, ...meta },
    people: {},
    families: {},
    events: {},
    places: {},
    citations: {},
    sources: {},
    notes: {},
    media: {},
    repositories: {},
    tags: {},
    handleToId: {},
  };
}

export function loadGramps(file) {
  const st = fs.statSync(file);
  const xml = readGrampsFile(file);
  return parseGrampsXml(xml, { file, mtime: st.mtimeMs });
}
