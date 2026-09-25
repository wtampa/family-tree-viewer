/**
 * Per-person evidence confidence (0–100).
 * weight(citation) = (grampsConfidence / 4) × sourceClass
 * sourceClass: member tree 0.3 · index/abstract 0.7 · unknown 0.4 · primary or imaged 1.0
 * An unmatched title is unknown. Primary requires a record-type keyword or an attached image.
 * fact score = 1 − Π(1 − w)   (diminishing returns)
 * person score = weighted mean over facts that apply (birth, parents, death, marriage, identity)
 */

export const SOURCE_CLASS = { MEMBER_TREE: "member-tree", INDEX: "index", PRIMARY: "primary", UNKNOWN: "unknown" };

const CLASS_WEIGHT = { [SOURCE_CLASS.MEMBER_TREE]: 0.3, [SOURCE_CLASS.INDEX]: 0.7, [SOURCE_CLASS.PRIMARY]: 1.0, [SOURCE_CLASS.UNKNOWN]: 0.4 };

const PRIMARY_RE = /\b(certificates?|registers?|registros?|actas?|partidas?|parish|baptisms?|bautismos?|censuses?|census|censos?|manifests?|passengers?|obituaries|obituary|wills?|probates?|deeds?|licen[cs]es?|directories|directory|tombstones?|gravestones?|headstones?)\b|find a grave photo/i;

function hasAttachedMedia(obj) {
  return Array.isArray(obj?.media) && obj.media.length > 0;
}

export function classifySource(src, opts = {}) {
  const imaged = Boolean(opts.hasMedia) || hasAttachedMedia(src);
  const t = src ? `${src.title || ""} ${src.pubinfo || ""} ${src.author || ""}`.toLowerCase() : "";
  if (/family tree|member tree|public member|one world tree|geni|wikitree|myheritage tree|familysearch family tree/.test(t)) return SOURCE_CLASS.MEMBER_TREE;
  if (/\bindex\b|indexes|abstract|transcription|extract|compiled|public records/.test(t)) return SOURCE_CLASS.INDEX;
  if (PRIMARY_RE.test(t)) return SOURCE_CLASS.PRIMARY;
  if (imaged) return SOURCE_CLASS.PRIMARY;
  return SOURCE_CLASS.UNKNOWN;
}

export function citationWeight(model, cid) {
  const c = model.citations[cid];
  if (!c) return 0;
  const src = c.source ? model.sources[c.source] : null;
  const cls = classifySource(src, { hasMedia: hasAttachedMedia(c) || hasAttachedMedia(src) });
  const conf = Math.max(0, Math.min(4, Number.isFinite(c.confidence) ? c.confidence : 2));
  return { w: (conf / 4) * CLASS_WEIGHT[cls], cls, conf, sourceId: c.source, sourceTitle: src?.title || "(no source)" };
}

const FACT_SUBJECT = { birth: "Birth", parents: "Parents", death: "Death", marriage: "Marriage" };
const CLASS_RANK = { [SOURCE_CLASS.PRIMARY]: 4, [SOURCE_CLASS.INDEX]: 3, [SOURCE_CLASS.UNKNOWN]: 2, [SOURCE_CLASS.MEMBER_TREE]: 1 };
const CLASS_PHRASE = {
  [SOURCE_CLASS.PRIMARY]: "a primary record",
  [SOURCE_CLASS.INDEX]: "an index only",
  [SOURCE_CLASS.UNKNOWN]: "an unknown source",
  [SOURCE_CLASS.MEMBER_TREE]: "a member tree only",
};

function bestClass(parts) {
  let best = null;
  for (const part of parts || []) {
    if (!best || (CLASS_RANK[part.cls] || 0) > (CLASS_RANK[best] || 0)) best = part.cls;
  }
  return best;
}

function factClause(f) {
  const subject = FACT_SUBJECT[f.key];
  if (!subject) return null;
  if (!f.has) return f.key === "parents" ? "Parents are not linked" : `${subject} is not recorded`;
  const best = bestClass(f.parts);
  if (!best) return f.key === "parents" ? "Parents have no citation" : `${subject} has no citation`;
  const phrase = CLASS_PHRASE[best];
  if (f.key === "parents") return `Parents rest on ${phrase}`;
  return `${subject} is ${phrase}`;
}

/** One sentence a researcher can act on. Identity is omitted so the line stays about the claims. */
export function evidenceSummary(facts) {
  const clauses = [];
  for (const f of facts || []) {
    const clause = factClause(f);
    if (clause) clauses.push(clause);
  }
  if (!clauses.length) return "";
  return `${clauses.map((c, i) => (i === 0 ? c : `${c.charAt(0).toLowerCase()}${c.slice(1)}`)).join("; ")}.`;
}

function factScore(model, cids) {
  let prod = 1;
  const parts = [];
  for (const cid of new Set(cids)) {
    const { w, cls, sourceTitle } = citationWeight(model, cid);
    prod *= 1 - w;
    parts.push({ cid, w: Number(w.toFixed(2)), cls, sourceTitle });
  }
  return { score: 1 - prod, parts };
}

export function personEvents(model, pid) {
  const p = model.people[pid];
  if (!p) return [];
  return p.events.map((e) => ({ ...model.events[e.id], role: e.role })).filter((e) => e.id);
}

export function familyEvents(model, fid) {
  const f = model.families[fid];
  if (!f) return [];
  return f.events.map((e) => ({ ...model.events[e.id], role: e.role })).filter((e) => e.id);
}

export function vitals(model, pid) {
  const evs = personEvents(model, pid).filter((e) => e.role === "Primary" || e.role === "Family");
  const pick = (types) => evs.filter((e) => types.includes(e.type)).sort((a, b) => (a.date?.sort ?? 9e9) - (b.date?.sort ?? 9e9))[0] || null;
  const birth = pick(["Birth"]);
  const baptism = pick(["Baptism", "Christening"]);
  const death = pick(["Death"]);
  const burial = pick(["Burial", "Cremation"]);
  const birthLike = birth || baptism;
  const deathLike = death || burial;
  return { birth, baptism, death, burial, birthLike, deathLike, all: evs };
}

/** Is this person plausibly still living? (no dated death, born < 100 years ago, or a recent child) */
export function likelyLiving(model, pid, nowYear = new Date().getFullYear()) {
  const v = vitals(model, pid);
  const by = v.birthLike?.date?.year;
  const dy = v.deathLike?.date?.year;
  if (dy) return false;
  // An undated Death event on someone born 100+ years ago (or with no birth) is treated as deceased.
  if (v.deathLike && !(by && nowYear - by < 100)) return false;
  if (by) return nowYear - by < 100;
  const p = model.people[pid];
  for (const fid of p.families) {
    const f = model.families[fid];
    for (const c of f?.children || []) {
      const cy = vitals(model, c.id).birthLike?.date?.year;
      if (cy && nowYear - cy < 80) return true;
    }
  }
  return false;
}

export function computeConfidence(model) {
  const out = {};
  for (const p of Object.values(model.people)) {
    const v = vitals(model, p.id);
    const facts = [];

    // Birth
    const birthCids = [...(v.birth?.citations || []), ...(v.baptism?.citations || [])];
    facts.push({ key: "birth", label: "Birth / baptism", weight: 0.3, has: Boolean(v.birthLike), ...factScore(model, birthCids) });

    // Parents (citations on the parent family, or on the child's birth event count half)
    const parentCids = [];
    for (const fid of p.parentFamilies) parentCids.push(...(model.families[fid]?.citations || []));
    const parentsKnown = p.parentFamilies.some((fid) => model.families[fid]?.father || model.families[fid]?.mother);
    const pf = factScore(model, parentCids);
    const bf = factScore(model, birthCids);
    facts.push({ key: "parents", label: "Parent link", weight: 0.3, has: parentsKnown, score: Math.max(pf.score, bf.score * 0.5), parts: pf.parts });

    // Death (skip if likely living)
    const living = likelyLiving(model, p.id);
    if (!living) {
      const deathCids = [...(v.death?.citations || []), ...(v.burial?.citations || [])];
      facts.push({ key: "death", label: "Death / burial", weight: 0.2, has: Boolean(v.deathLike), ...factScore(model, deathCids) });
    }

    // Marriage (any family this person is a spouse in)
    if (p.families.length) {
      const mCids = [];
      let hasMarriage = false;
      for (const fid of p.families) {
        const f = model.families[fid];
        mCids.push(...(f?.citations || []));
        for (const e of familyEvents(model, fid)) if (/Marriage|Engagement|Marriage License|Marriage Banns/.test(e.type)) { hasMarriage = true; mCids.push(...e.citations); }
      }
      facts.push({ key: "marriage", label: "Marriage", weight: 0.1, has: hasMarriage, ...factScore(model, mCids) });
    }

    // Identity: person-level + name citations
    const idCids = [...p.citations];
    for (const n of p.names) idCids.push(...n.citations);
    facts.push({ key: "identity", label: "Identity / name", weight: 0.1, has: true, ...factScore(model, idCids) });

    const totalW = facts.reduce((s, f) => s + f.weight, 0);
    const score = facts.reduce((s, f) => s + f.weight * (f.has ? f.score : 0), 0) / totalW;

    // Source class summary
    const allCids = new Set([...p.citations, ...birthCids, ...parentCids]);
    for (const e of v.all) for (const c of e.citations) allCids.add(c);
    for (const fid of p.families) for (const c of model.families[fid]?.citations || []) allCids.add(c);
    const classes = { [SOURCE_CLASS.MEMBER_TREE]: 0, [SOURCE_CLASS.INDEX]: 0, [SOURCE_CLASS.PRIMARY]: 0, [SOURCE_CLASS.UNKNOWN]: 0 };
    for (const cid of allCids) classes[citationWeight(model, cid).cls]++;
    const total = allCids.size;
    const memberOnly = total > 0 && classes[SOURCE_CLASS.MEMBER_TREE] === total;
    const factRows = facts.map((f) => ({ key: f.key, label: f.label, has: f.has, score: Math.round((f.has ? f.score : 0) * 100), parts: f.parts }));

    out[p.id] = {
      score: Math.round(score * 100),
      living,
      facts: factRows,
      summary: evidenceSummary(factRows),
      citations: total,
      classes,
      memberOnly,
      tier: score >= 0.7 ? "high" : score >= 0.4 ? "medium" : score > 0 ? "low" : "none",
    };
  }
  return out;
}
