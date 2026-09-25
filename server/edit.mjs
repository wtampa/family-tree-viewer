/**
 * Core tree mutations. Never invent given names. Unknown stays empty.
 */
import { parseDateText } from "./dates.mjs";
import { applyPersonDisplayName, newHandle, nextId, nowUnix, tableFor } from "./db.mjs";

export function normalizeName(n = {}) {
  const surnames = Array.isArray(n.surnames) && n.surnames.length
    ? n.surnames.map((s) => ({
      value: s.value || "",
      prim: s.prim !== false,
      prefix: s.prefix || "",
      connector: s.connector || "",
      derivation: s.derivation || "",
    }))
    : (n.surname || n.prefix
      ? [{ value: n.surname || "", prim: true, prefix: n.prefix || "", connector: "", derivation: "" }]
      : []);
  const surname = surnames.map((s) => [s.prefix, s.value].filter(Boolean).join(" ")).join(" ").trim();
  return {
    type: n.type || "Birth Name",
    alt: !!n.alt,
    first: n.first || "",
    surname,
    surnames,
    suffix: n.suffix || "",
    title: n.title || "",
    call: n.call || "",
    nick: n.nick || "",
    date: n.date || null,
    citations: n.citations || [],
    notes: n.notes || [],
  };
}

function bump(obj) {
  obj.change = nowUnix();
  return obj;
}

function requirePerson(model, id) {
  const p = model.people[id];
  if (!p) throw new Error(`person not found: ${id}`);
  return p;
}

function emptyPerson(id, handle) {
  return {
    handle,
    id,
    change: nowUnix(),
    priv: false,
    gender: "U",
    name: "(unnamed)",
    first: "",
    surname: "",
    suffix: "",
    names: [],
    events: [],
    parentFamilies: [],
    families: [],
    citations: [],
    notes: [],
    media: [],
    attributes: [],
    urls: [],
    associations: [],
    tags: [],
  };
}

function emptyFamily(id, handle) {
  return {
    handle,
    id,
    change: nowUnix(),
    priv: false,
    relType: "Unknown",
    father: null,
    mother: null,
    children: [],
    events: [],
    citations: [],
    notes: [],
    media: [],
    attributes: [],
    tags: [],
  };
}

export function createPerson(ctx, { first = "", surname = "", suffix = "", gender = "U", names } = {}) {
  const { model } = ctx;
  const id = nextId(model, "I", "people");
  const handle = newHandle();
  ctx.touch("person", id);
  const p = emptyPerson(id, handle);
  p.gender = gender || "U";
  p.names = (names && names.length ? names : [{ first, surname, suffix, type: "Birth Name" }]).map(normalizeName);
  applyPersonDisplayName(p);
  model.people[id] = p;
  if (handle) model.handleToId[handle] = id;
  return p;
}

export function createFamily(ctx, { father = null, mother = null, relType = "Unknown" } = {}) {
  const { model } = ctx;
  const id = nextId(model, "F", "families");
  const handle = newHandle();
  ctx.touch("family", id);
  const f = emptyFamily(id, handle);
  f.father = father || null;
  f.mother = mother || null;
  f.relType = relType;
  model.families[id] = f;
  if (handle) model.handleToId[handle] = id;
  return f;
}

export function patchPerson(ctx, body) {
  const p = requirePerson(ctx.model, body.id);
  ctx.touch("person", p.id);
  if (body.gender != null) p.gender = body.gender || "U";
  if (Array.isArray(body.names)) p.names = body.names.map(normalizeName);
  else if (body.first != null || body.surname != null || body.suffix != null) {
    const primary = p.names.find((n) => !n.alt) || p.names[0];
    if (primary) {
      if (body.first != null) primary.first = body.first;
      if (body.surname != null) {
        primary.surname = body.surname;
        primary.surnames = [{ value: body.surname, prim: true, prefix: body.prefix || "", connector: "", derivation: "" }];
      }
      if (body.suffix != null) primary.suffix = body.suffix;
    } else {
      p.names = [normalizeName({ first: body.first, surname: body.surname, suffix: body.suffix })];
    }
  }
  if (Array.isArray(body.citations)) p.citations = body.citations;
  if (Array.isArray(body.notes)) p.notes = body.notes;
  applyPersonDisplayName(p);
  bump(p);
  return { id: p.id };
}

function linkSpouseFamily(ctx, personId, familyId) {
  const p = requirePerson(ctx.model, personId);
  ctx.touch("person", personId);
  if (!p.families.includes(familyId)) p.families.push(familyId);
  bump(p);
}

function linkChildFamily(ctx, personId, familyId) {
  const p = requirePerson(ctx.model, personId);
  ctx.touch("person", personId);
  if (!p.parentFamilies.includes(familyId)) p.parentFamilies.push(familyId);
  bump(p);
}

export function addRelative(ctx, body) {
  const p = requirePerson(ctx.model, body.personId);
  const role = body.role;
  if (!["father", "mother", "spouse", "child"].includes(role)) throw new Error("role must be father, mother, spouse, or child");
  const created = createPerson(ctx, {
    first: body.first || "",
    surname: body.surname || "",
    suffix: body.suffix || "",
    gender: body.gender || (role === "father" ? "M" : role === "mother" ? "F" : "U"),
  });

  if (role === "father" || role === "mother") {
    let fam = body.familyId ? ctx.model.families[body.familyId] : ctx.model.families[p.parentFamilies[0]];
    const slot = role === "father" ? "father" : "mother";
    if (fam && fam[slot]) fam = null;
    if (!fam) {
      fam = createFamily(ctx, {});
      ctx.touch("person", p.id);
      p.parentFamilies.push(fam.id);
      bump(p);
    } else ctx.touch("family", fam.id);
    fam[slot] = created.id;
    bump(fam);
    created.families.push(fam.id);
    bump(created);
  } else if (role === "spouse") {
    const relType = body.relType || "Married";
    let father = null;
    let mother = null;
    if (p.gender === "F") { mother = p.id; father = created.id; }
    else { father = p.id; mother = created.id; }
    const fam = createFamily(ctx, { father, mother, relType });
    linkSpouseFamily(ctx, p.id, fam.id);
    created.families.push(fam.id);
    bump(created);
  } else {
    let fam = body.familyId ? ctx.model.families[body.familyId] : ctx.model.families[p.families[0]];
    if (!fam) {
      fam = createFamily(ctx, p.gender === "F" ? { mother: p.id, relType: "Unknown" } : { father: p.id, relType: "Unknown" });
      linkSpouseFamily(ctx, p.id, fam.id);
    } else ctx.touch("family", fam.id);
    fam.children.push({ id: created.id, frel: "Birth", mrel: "Birth" });
    bump(fam);
    created.parentFamilies.push(fam.id);
    bump(created);
  }
  return { id: created.id, familyId: created.families[0] || created.parentFamilies[0] || "" };
}

function findOrCreatePlace(ctx, placeId, placeName) {
  if (placeId && ctx.model.places[placeId]) return placeId;
  const name = String(placeName || "").trim();
  if (!name) return null;
  const hit = Object.values(ctx.model.places).find((p) => p.name === name || p.title === name);
  if (hit) return hit.id;
  const id = nextId(ctx.model, "P", "places");
  const handle = newHandle();
  ctx.touch("place", id);
  ctx.model.places[id] = {
    handle,
    id,
    change: nowUnix(),
    priv: false,
    type: "Unknown",
    title: name,
    name,
    names: [{ value: name, lang: "", date: null }],
    coord: null,
    parents: [],
    citations: [],
    notes: [],
    urls: [],
    media: [],
  };
  ctx.model.handleToId[handle] = id;
  return id;
}

export function upsertEvent(ctx, body) {
  const { model } = ctx;
  const date = body.date && typeof body.date === "object" ? body.date : parseDateText(body.dateText || body.date || "");
  const place = findOrCreatePlace(ctx, body.placeId, body.placeName);
  let ev;
  if (body.id && model.events[body.id]) {
    ev = model.events[body.id];
    ctx.touch("event", ev.id);
  } else {
    const id = nextId(model, "E", "events");
    const handle = newHandle();
    ctx.touch("event", id);
    ev = {
      handle,
      id,
      change: nowUnix(),
      priv: false,
      type: "Unknown",
      date: null,
      place: null,
      description: "",
      citations: [],
      notes: [],
      media: [],
      attributes: [],
      tags: [],
    };
    model.events[id] = ev;
    model.handleToId[handle] = id;
  }
  if (body.type != null) ev.type = body.type || "Unknown";
  if (body.dateText != null || body.date != null) ev.date = date;
  if (body.placeId != null || body.placeName != null) ev.place = place;
  if (body.description != null) ev.description = body.description || "";
  if (Array.isArray(body.citations)) ev.citations = body.citations;
  bump(ev);

  if (body.personId && model.people[body.personId]) {
    const p = model.people[body.personId];
    if (!p.events.some((e) => e.id === ev.id)) {
      ctx.touch("person", p.id);
      p.events.push({ id: ev.id, role: body.role || "Primary" });
      bump(p);
    }
  }
  if (body.familyId && model.families[body.familyId]) {
    const f = model.families[body.familyId];
    if (!f.events.some((e) => e.id === ev.id)) {
      ctx.touch("family", f.id);
      f.events.push({ id: ev.id, role: body.role || "Family" });
      bump(f);
    }
  }
  return { id: ev.id };
}

export function deleteEvent(ctx, { id }) {
  const ev = ctx.model.events[id];
  if (!ev) throw new Error(`event not found: ${id}`);
  ctx.touch("event", id);
  for (const p of Object.values(ctx.model.people)) {
    if (p.events.some((e) => e.id === id)) {
      ctx.touch("person", p.id);
      p.events = p.events.filter((e) => e.id !== id);
      bump(p);
    }
  }
  for (const f of Object.values(ctx.model.families)) {
    if (f.events.some((e) => e.id === id)) {
      ctx.touch("family", f.id);
      f.events = f.events.filter((e) => e.id !== id);
      bump(f);
    }
  }
  delete ctx.model.events[id];
  return { id, deleted: true };
}

export function upsertNote(ctx, body) {
  const { model } = ctx;
  let n;
  if (body.id && model.notes[body.id]) {
    n = model.notes[body.id];
    ctx.touch("note", n.id);
  } else {
    const id = nextId(model, "N", "notes");
    const handle = newHandle();
    ctx.touch("note", id);
    n = { handle, id, change: nowUnix(), priv: false, type: "General", format: "0", text: "", tags: [] };
    model.notes[id] = n;
    model.handleToId[handle] = id;
  }
  if (body.type != null) n.type = body.type || "General";
  if (body.text != null) n.text = body.text;
  bump(n);
  if (body.personId && model.people[body.personId] && !model.people[body.personId].notes.includes(n.id)) {
    ctx.touch("person", body.personId);
    model.people[body.personId].notes.push(n.id);
    bump(model.people[body.personId]);
  }
  if (body.eventId && model.events[body.eventId] && !model.events[body.eventId].notes.includes(n.id)) {
    ctx.touch("event", body.eventId);
    model.events[body.eventId].notes.push(n.id);
    bump(model.events[body.eventId]);
  }
  return { id: n.id };
}

export function upsertSource(ctx, body) {
  const { model } = ctx;
  let s;
  if (body.id && model.sources[body.id]) {
    s = model.sources[body.id];
    ctx.touch("source", s.id);
  } else {
    const id = nextId(model, "S", "sources");
    const handle = newHandle();
    ctx.touch("source", id);
    s = {
      handle, id, change: nowUnix(), priv: false,
      title: "(untitled source)", author: "", pubinfo: "", abbrev: "",
      notes: [], media: [], attributes: [], repositories: [],
    };
    model.sources[id] = s;
    model.handleToId[handle] = id;
  }
  if (body.title != null) s.title = body.title || "(untitled source)";
  if (body.author != null) s.author = body.author;
  if (body.pubinfo != null) s.pubinfo = body.pubinfo;
  if (body.abbrev != null) s.abbrev = body.abbrev;
  bump(s);
  return { id: s.id };
}

export function upsertCitation(ctx, body) {
  const { model } = ctx;
  if (body.source && !model.sources[body.source]) throw new Error(`source not found: ${body.source}`);
  let c;
  if (body.id && model.citations[body.id]) {
    c = model.citations[body.id];
    ctx.touch("citation", c.id);
  } else {
    const id = nextId(model, "C", "citations");
    const handle = newHandle();
    ctx.touch("citation", id);
    c = {
      handle, id, change: nowUnix(), priv: false,
      page: "", confidence: 2, date: null, source: body.source || null,
      notes: [], media: [], attributes: [],
    };
    model.citations[id] = c;
    model.handleToId[handle] = id;
  }
  if (body.page != null) c.page = body.page;
  if (body.confidence != null) c.confidence = Number(body.confidence);
  if (body.source != null) c.source = body.source;
  if (body.dateText != null) c.date = parseDateText(body.dateText);
  bump(c);
  const attach = body.attach;
  if (attach?.kind && attach.id) {
    const table = tableFor(attach.kind === "name" ? "person" : attach.kind);
    if (attach.kind === "name") {
      const p = requirePerson(model, attach.id);
      const idx = Number(attach.nameIndex || 0);
      ctx.touch("person", p.id);
      if (p.names[idx] && !p.names[idx].citations.includes(c.id)) p.names[idx].citations.push(c.id);
      bump(p);
    } else if (model[table]?.[attach.id]) {
      ctx.touch(attach.kind, attach.id);
      const obj = model[table][attach.id];
      if (Array.isArray(obj.citations) && !obj.citations.includes(c.id)) obj.citations.push(c.id);
      bump(obj);
    }
  }
  return { id: c.id };
}

export function dispatchEdit(kind, body, ctx) {
  if (kind === "person") {
    if (body.id && ctx.model.people[body.id]) return patchPerson(ctx, body);
    return { id: createPerson(ctx, body).id };
  }
  if (kind === "relative") return addRelative(ctx, body);
  if (kind === "family") {
    if (body.id && ctx.model.families[body.id]) {
      const f = ctx.model.families[body.id];
      ctx.touch("family", f.id);
      if (body.relType != null) f.relType = body.relType;
      if (body.father !== undefined) f.father = body.father || null;
      if (body.mother !== undefined) f.mother = body.mother || null;
      bump(f);
      return { id: f.id };
    }
    return { id: createFamily(ctx, body).id };
  }
  if (kind === "event") {
    if (body.delete) return deleteEvent(ctx, body);
    return upsertEvent(ctx, body);
  }
  if (kind === "note") return upsertNote(ctx, body);
  if (kind === "source") return upsertSource(ctx, body);
  if (kind === "citation") return upsertCitation(ctx, body);
  if (kind === "media") return editMedia(ctx, body);
  throw new Error(`unknown edit kind: ${kind}`);
}

const MEDIA_TABLES = ["people", "families", "events", "places", "citations", "sources"];

function mediaIdOf(item) {
  return item?.id || item?.ref || "";
}

function baseName(p) {
  return String(p || "").replace(/\\/g, "/").split("/").filter(Boolean).pop() || "file";
}

function mimeFromName(name) {
  const ext = `.${String(name || "").toLowerCase().split(".").pop()}`;
  return {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif",
    ".webp": "image/webp", ".bmp": "image/bmp", ".tif": "image/tiff", ".tiff": "image/tiff",
    ".pdf": "application/pdf",
  }[ext] || "";
}

function normalizeSrc(src) {
  return String(src || "").trim().replace(/\\/g, "/");
}

function findMediaBySrc(model, src) {
  const key = normalizeSrc(src).toLowerCase();
  if (!key) return null;
  return Object.values(model.media).find((m) => normalizeSrc(m.src).toLowerCase() === key) || null;
}

function mediaRefCount(model, mediaId, skipPersonId) {
  let n = 0;
  for (const table of MEDIA_TABLES) {
    for (const obj of Object.values(model[table] || {})) {
      for (const m of obj.media || []) {
        if (mediaIdOf(m) !== mediaId) continue;
        if (skipPersonId && table === "people" && obj.id === skipPersonId) continue;
        n += 1;
      }
    }
  }
  return n;
}

function emptyMedia(id, handle, { src = "", mime = "", description = "" } = {}) {
  return {
    handle,
    id,
    change: nowUnix(),
    priv: false,
    src,
    mime,
    description,
    checksum: "",
    date: null,
    citations: [],
    notes: [],
    attributes: [],
    tags: [],
  };
}

export function attachMedia(ctx, body) {
  const p = requirePerson(ctx.model, body.personId);
  const src = normalizeSrc(body.src || body.path);
  if (!src) throw new Error("media path required");
  const description = String(body.description || "").trim() || baseName(src);
  const mime = body.mime || mimeFromName(src);
  let media = findMediaBySrc(ctx.model, src);
  if (!media) {
    const id = nextId(ctx.model, "O", "media");
    const handle = newHandle();
    ctx.touch("media", id);
    media = emptyMedia(id, handle, { src, mime, description });
    ctx.model.media[id] = media;
    ctx.model.handleToId[handle] = id;
  } else {
    ctx.touch("media", media.id);
    if (description && description !== media.description) media.description = description;
    if (mime && !media.mime) media.mime = mime;
    bump(media);
  }
  ctx.touch("person", p.id);
  p.media = p.media || [];
  if (!p.media.some((m) => mediaIdOf(m) === media.id)) p.media.push({ id: media.id });
  bump(p);
  return { id: media.id, personId: p.id, action: "attach" };
}

export function detachMedia(ctx, body) {
  const p = requirePerson(ctx.model, body.personId);
  const mediaId = body.mediaId || body.id;
  if (!mediaId) throw new Error("mediaId required");
  ctx.touch("person", p.id);
  p.media = (p.media || []).filter((m) => mediaIdOf(m) !== mediaId);
  bump(p);
  if (ctx.model.media[mediaId] && mediaRefCount(ctx.model, mediaId, p.id) === 0) {
    ctx.touch("media", mediaId);
    delete ctx.model.media[mediaId];
  }
  return { id: mediaId, personId: p.id, action: "detach", deleted: !ctx.model.media[mediaId] };
}

export function setPortrait(ctx, body) {
  const p = requirePerson(ctx.model, body.personId);
  const mediaId = body.mediaId || body.id;
  if (!mediaId) throw new Error("mediaId required");
  if (!ctx.model.media[mediaId]) throw new Error(`media not found: ${mediaId}`);
  ctx.touch("person", p.id);
  p.media = (p.media || []).filter((m) => mediaIdOf(m) !== mediaId);
  p.media.unshift({ id: mediaId });
  bump(p);
  return { id: mediaId, personId: p.id, action: "portrait" };
}

export function editMedia(ctx, body) {
  const action = body.action || (body.detach ? "detach" : (body.portrait ? "portrait" : "attach"));
  if (action === "detach") return detachMedia(ctx, body);
  if (action === "portrait") return setPortrait(ctx, body);
  return attachMedia(ctx, body);
}
