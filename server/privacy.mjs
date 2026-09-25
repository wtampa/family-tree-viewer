/**
 * Living-privacy (webtrees-style): hide names, dates, notes, and media
 * for people who look still alive. Relationships stay so the tree still draws.
 */
import { likelyLiving } from "./confidence.mjs";

export function livingIdSet(model, confidence) {
  const ids = new Set();
  for (const id of Object.keys(model.people)) {
    if (confidence[id]?.living || likelyLiving(model, id)) ids.add(id);
  }
  return ids;
}

export function defaultHideLiving(treeId) {
  return treeId !== "personal";
}

function eventTouchesLiving(model, ev, living) {
  for (const p of ev.people || []) if (living.has(p.id)) return true;
  for (const fref of ev.families || []) {
    const f = model.families[fref.id];
    if (f && (living.has(f.father) || living.has(f.mother))) return true;
  }
  return false;
}

export function redactModel(model, confidence) {
  const living = livingIdSet(model, confidence);
  if (!living.size) return { model, living, names: [] };

  const names = [...living].map((id) => model.people[id]?.name).filter((n) => n && n.length > 2)
    .sort((a, b) => b.length - a.length);

  const people = { ...model.people };
  for (const id of living) {
    const p = people[id];
    people[id] = {
      ...p,
      name: "Living",
      first: "Living",
      surname: "",
      suffix: "",
      names: [],
      notes: [],
      citations: [],
      media: [],
      urls: [],
      attributes: [],
      privateLiving: true,
    };
  }

  const events = { ...model.events };
  for (const ev of Object.values(model.events)) {
    if (!eventTouchesLiving(model, ev, living)) continue;
    events[ev.id] = {
      ...ev,
      date: null,
      place: null,
      description: "",
      citations: [],
      notes: [],
      media: [],
    };
  }

  return { model: { ...model, people, events }, living, names };
}

function scrub(text, names) {
  let s = String(text || "");
  for (const n of names) {
    const re = new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    s = s.replace(re, "Living");
  }
  return s;
}

export function redactHints(hints, living, names) {
  return (hints || [])
    .filter((h) => !living.has(h.personId) && !living.has(h.otherId))
    .map((h) => ({
      ...h,
      title: scrub(h.title, names),
      why: scrub(h.why, names),
      suggestedRecords: (h.suggestedRecords || []).map((r) => scrub(r, names)),
    }));
}

export function redactCensus(census, living) {
  const out = {};
  for (const [id, row] of Object.entries(census || {})) {
    if (living.has(id)) continue;
    out[id] = row;
  }
  return out;
}

export function redactLinks(links, living) {
  const out = {};
  for (const [id, row] of Object.entries(links || {})) {
    if (living.has(id)) continue;
    out[id] = row;
  }
  return out;
}

export function redactMediaResolved(mediaResolved, model, living) {
  const blocked = new Set();
  for (const id of living) {
    const p = model.people[id];
    if (!p) continue;
    for (const m of p.media || []) if (m.id) blocked.add(m.id);
    for (const e of p.events || []) {
      const ev = model.events[e.id];
      for (const m of ev?.media || []) if (m.id) blocked.add(m.id);
    }
  }
  const out = {};
  for (const [id, m] of Object.entries(mediaResolved || {})) {
    if (!blocked.has(id)) out[id] = m;
  }
  return { mediaResolved: out, blocked };
}

export function mediaTouchesLiving(model, confidence, mediaId) {
  const living = livingIdSet(model, confidence);
  for (const id of living) {
    const p = model.people[id];
    if (!p) continue;
    if ((p.media || []).some((m) => m.id === mediaId)) return true;
    for (const e of p.events || []) {
      const ev = model.events[e.id];
      if ((ev?.media || []).some((m) => m.id === mediaId)) return true;
    }
  }
  return false;
}
