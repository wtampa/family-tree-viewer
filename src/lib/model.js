/**
 * Client-side model over the server payload: fast lookups, walks, generations, kinship, search, f3 adapter.
 */
import { lineColor, genderColor } from "./color.js";
import { fold, matchedAlias, packPerson, scorePackedQuery, visibleAliases } from "./names.js";

const norm = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function isPlaceholder(p) {
  if (!p) return true;
  if (p.privateLiving) return false;
  const f = norm(p.first).trim();
  return !f || /^(unknown|unk|n\.?n\.?|desconocid[oa]|\?+|x+|no name|unnamed|living|private)$/.test(f) || /^\?/.test(p.first || "");
}

export class TreeModel {
  constructor(payload) {
    this.version = payload.version;
    this.settings = payload.settings;
    this.m = payload.model;
    this.confidence = payload.confidence || {};
    this.mediaResolved = payload.mediaResolved || {};
    this.generations = payload.generations || {};
    this.lines = payload.lines || {};
    this.links = payload.links || {};
    this.census = payload.census || {};
    this.homeId = payload.settings?.homeId;
    this.hideLiving = Boolean(payload.settings?.hideLiving);
    this.livingCount = payload.settings?.livingCount ?? 0;
    this.people = this.m.people;
    this.families = this.m.families;
    this.events = this.m.events;
    this.places = this.m.places;
    this.citations = this.m.citations;
    this.sources = this.m.sources;
    this.notes = this.m.notes;
    this.media = this.m.media;
    this._vitals = new Map();
    this._searchIndex = null;
    this.peopleList = Object.values(this.people).sort((a, b) => a.name.localeCompare(b.name));
  }

  person(id) { return this.people[id] || null; }
  family(id) { return this.families[id] || null; }

  // ---------- relations ----------
  parentFamilies(pid) { return (this.people[pid]?.parentFamilies || []).map((f) => this.families[f]).filter(Boolean); }
  spouseFamilies(pid) { return (this.people[pid]?.families || []).map((f) => this.families[f]).filter(Boolean); }
  parents(pid) {
    const out = [];
    for (const f of this.parentFamilies(pid)) { if (f.father) out.push(f.father); if (f.mother) out.push(f.mother); }
    return [...new Set(out)];
  }
  father(pid) { return this.parentFamilies(pid).map((f) => f.father).find(Boolean) || null; }
  mother(pid) { return this.parentFamilies(pid).map((f) => f.mother).find(Boolean) || null; }
  children(pid) {
    const out = [];
    for (const f of this.spouseFamilies(pid)) for (const c of f.children) out.push(c.id);
    return [...new Set(out)];
  }
  spouses(pid) {
    const out = [];
    for (const f of this.spouseFamilies(pid)) { const s = f.father === pid ? f.mother : f.father; if (s) out.push(s); }
    return [...new Set(out)];
  }
  siblings(pid) {
    const out = new Set();
    for (const f of this.parentFamilies(pid)) for (const c of f.children) if (c.id !== pid) out.add(c.id);
    return [...out];
  }

  // ---------- vitals ----------
  vitals(pid) {
    if (this._vitals.has(pid)) return this._vitals.get(pid);
    const p = this.people[pid];
    const evs = (p?.events || []).map((e) => ({ ...this.events[e.id], role: e.role })).filter((e) => e.id);
    const famEvs = [];
    for (const f of this.spouseFamilies(pid)) for (const e of f.events) { const ev = this.events[e.id]; if (ev) famEvs.push({ ...ev, role: "Family", familyId: f.id }); }
    const pick = (types, arr) => arr.filter((e) => types.includes(e.type)).sort((a, b) => (a.date?.sort ?? 9e9) - (b.date?.sort ?? 9e9))[0] || null;
    const birth = pick(["Birth"], evs);
    const baptism = pick(["Baptism", "Christening"], evs);
    const death = pick(["Death"], evs);
    const burial = pick(["Burial", "Cremation"], evs);
    const marriages = famEvs.filter((e) => /Marriage/.test(e.type));
    const all = [...evs, ...famEvs].sort((a, b) => (a.date?.sort ?? 9e9) - (b.date?.sort ?? 9e9));
    const v = {
      birth, baptism, death, burial, marriages, all,
      birthLike: birth || baptism, deathLike: death || burial,
      living: Boolean(this.confidence[pid]?.living),
    };
    this._vitals.set(pid, v);
    return v;
  }
  years(pid) {
    const v = this.vitals(pid);
    const b = v.birthLike?.date?.year, d = v.deathLike?.date?.year;
    if (!b && !d) return v.living ? "living" : "";
    return `${b ?? "?"} – ${d ?? (v.living ? "living" : "?")}`;
  }
  placeName(pidOrEvent) {
    const ev = typeof pidOrEvent === "string" ? this.events[pidOrEvent] : pidOrEvent;
    if (!ev?.place) return "";
    return this.places[ev.place]?.title || this.places[ev.place]?.name || "";
  }
  shortPlace(ev) {
    const t = this.placeName(ev);
    return t.split(",")[0].trim();
  }

  // ---------- media / portraits ----------
  portrait(pid) {
    const p = this.people[pid];
    if (!p) return null;
    for (const m of p.media) {
      const r = this.mediaResolved[m.id];
      if (r && r.kind === "image") return r.url;
    }
    return null;
  }
  mediaFor(pid) {
    const p = this.people[pid];
    if (!p) return [];
    const ids = new Set(p.media.map((m) => m.id));
    for (const e of this.vitals(pid).all) for (const m of e.media || []) ids.add(m.id);
    return [...ids].map((id) => ({ ...this.media[id], resolved: this.mediaResolved[id] || null })).filter((m) => m.id);
  }

  // ---------- color / line ----------
  lineOf(pid) { return this.lines[pid] || null; }
  colorOf(pid) {
    const l = this.lines[pid];
    if (l && l !== "home") return lineColor(l);
    if (l === "home") return lineColor("home");
    return genderColor(this.people[pid]?.gender);
  }
  conf(pid) { return this.confidence[pid] || { score: 0, tier: "none", citations: 0 }; }

  // ---------- walks ----------
  ancestors(pid, maxDepth = 99) {
    const out = new Map(); // id → depth
    const q = [[pid, 0]];
    while (q.length) {
      const [id, d] = q.shift();
      if (d >= maxDepth) continue;
      for (const par of this.parents(id)) if (!out.has(par)) { out.set(par, d + 1); q.push([par, d + 1]); }
    }
    return out;
  }
  descendants(pid, maxDepth = 99) {
    const out = new Map();
    const q = [[pid, 0]];
    while (q.length) {
      const [id, d] = q.shift();
      if (d >= maxDepth) continue;
      for (const ch of this.children(id)) if (!out.has(ch)) { out.set(ch, d + 1); q.push([ch, d + 1]); }
    }
    return out;
  }
  /** Generation relative to a root: ancestors positive, descendants negative, others via nearest link (BFS over all rels). */
  generationsFrom(rootId) {
    const gen = { [rootId]: 0 };
    const q = [rootId];
    while (q.length) {
      const id = q.shift();
      const g = gen[id];
      for (const par of this.parents(id)) if (gen[par] === undefined) { gen[par] = g + 1; q.push(par); }
      for (const ch of this.children(id)) if (gen[ch] === undefined) { gen[ch] = g - 1; q.push(ch); }
      for (const sp of this.spouses(id)) if (gen[sp] === undefined) { gen[sp] = g; q.push(sp); }
      for (const sib of this.siblings(id)) if (gen[sib] === undefined) { gen[sib] = g; q.push(sib); }
    }
    return gen;
  }
  isBrickWall(pid) {
    const p = this.people[pid];
    if (!p || isPlaceholder(p)) return false;
    const real = this.parents(pid).filter((x) => !isPlaceholder(this.people[x]));
    return real.length === 0 && this.generations[pid] !== undefined && this.generations[pid] > 0;
  }

  // ---------- kinship ----------
  /** English label for a blood relationship given generation distances to a shared ancestor. */
  kinshipLabel(da, db, gender) {
    const g = gender;
    const greats = (n) => (n <= 0 ? "" : n === 1 ? "great-" : n === 2 ? "great-great-" : `${n}×great-`);
    if (db === 0) {
      if (da === 0) return "self";
      if (da === 1) return g === "M" ? "father" : g === "F" ? "mother" : "parent";
      const base = g === "M" ? "grandfather" : g === "F" ? "grandmother" : "grandparent";
      return `${greats(da - 2)}${base}`;
    }
    if (da === 0) {
      if (db === 1) return g === "M" ? "son" : g === "F" ? "daughter" : "child";
      const base = g === "M" ? "grandson" : g === "F" ? "granddaughter" : "grandchild";
      return `${greats(db - 2)}${base}`;
    }
    if (da === 1 && db === 1) return g === "M" ? "brother" : g === "F" ? "sister" : "sibling";
    if (da === 1) {
      const base = g === "M" ? "nephew" : g === "F" ? "niece" : "nibling";
      return `${greats(db - 2)}${base}`;
    }
    if (db === 1) {
      const base = g === "M" ? "uncle" : g === "F" ? "aunt" : "pibling";
      return `${greats(da - 2)}${base}`;
    }
    const degree = Math.min(da, db) - 1;
    const removed = Math.abs(da - db);
    const ord = (n) => (n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`);
    return `${ord(degree)} cousin${removed ? ` ${removed === 1 ? "once" : removed === 2 ? "twice" : `${removed}×`} removed` : ""}`;
  }

  /**
   * Every upward path from pid, including self at depth 0.
   * Same ancestor may appear on several paths (pedigree collapse). Cycle-safe; no marriage walks.
   * @returns {Map<string, {depthMin: number, paths: {ids: string[], depth: number}[]}>}
   */
  ancestorPathMap(pid, maxDepth = 18) {
    const map = new Map();
    if (!pid || !this.people[pid]) return map;
    map.set(pid, { depthMin: 0, paths: [{ ids: [pid], depth: 0 }] });
    const stack = [{ id: pid, ids: [pid], depth: 0 }];
    while (stack.length) {
      const cur = stack.pop();
      if (cur.depth >= maxDepth) continue;
      for (const par of this.parents(cur.id)) {
        if (cur.ids.includes(par)) continue;
        const ids = [...cur.ids, par];
        const depth = cur.depth + 1;
        let rec = map.get(par);
        if (!rec) {
          rec = { depthMin: depth, paths: [] };
          map.set(par, rec);
        }
        rec.depthMin = Math.min(rec.depthMin, depth);
        if (rec.paths.length < 8) rec.paths.push({ ids, depth });
        stack.push({ id: par, ids, depth });
      }
    }
    return map;
  }

  /** Most-recent common ancestors of A and B (a CA with no CA descendant). Couples kept as two IDs. */
  mostRecentCommonAncestors(aId, bId) {
    const A = this.ancestorPathMap(aId);
    const B = this.ancestorPathMap(bId);
    const common = [];
    for (const id of A.keys()) if (B.has(id)) common.push(id);
    return common.filter((id) => !common.some((other) => other !== id && this.ancestors(other).has(id)));
  }

  /**
   * Every distinct blood route between A and B.
   * Married MRCAs collapse to one path ("via Pat × Mat"). Same ancestor on 2+ routes → collapse:true.
   */
  bloodRelations(rootId, otherId) {
    if (!rootId || !otherId) return [];
    if (rootId === otherId) return [{ kind: "blood", label: "self", via: [rootId], da: 0, db: 0, collapse: false, routes: 1 }];
    const A = this.ancestorPathMap(rootId);
    const B = this.ancestorPathMap(otherId);
    const mrcas = [];
    for (const id of A.keys()) if (B.has(id)) mrcas.push(id);
    const recent = mrcas.filter((id) => !mrcas.some((other) => other !== id && this.ancestors(other).has(id)));
    if (!recent.length) return [];
    const used = new Set();
    const groups = [];
    for (const id of recent) {
      if (used.has(id)) continue;
      const mates = this.spouses(id).filter((s) => recent.includes(s) && !used.has(s));
      const via = [id, ...mates];
      for (const x of via) used.add(x);
      const da = Math.min(...via.map((x) => A.get(x).depthMin));
      const db = Math.min(...via.map((x) => B.get(x).depthMin));
      const routes = via.reduce((n, x) => n + A.get(x).paths.length * B.get(x).paths.length, 0);
      const collapse = via.some((x) => A.get(x).paths.length > 1 || B.get(x).paths.length > 1);
      groups.push({ via, da, db, collapse, routes: Math.max(1, routes) });
    }
    groups.sort((p, q) => (p.da + p.db) - (q.da + q.db) || p.da - q.da);
    const g = this.people[otherId]?.gender;
    const seen = new Set();
    const out = [];
    for (const grp of groups) {
      const label = this.kinshipLabel(grp.da, grp.db, g);
      const key = `${label}|${grp.via.slice().sort().join(",")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ kind: "blood", label, via: grp.via, da: grp.da, db: grp.db, collapse: grp.collapse, routes: grp.routes });
    }
    return out;
  }

  /**
   * Blood paths, then at most one marriage hop (never spouse-of-spouse).
   * @returns {{ primary: string, collapse: boolean, paths: object[] }}
   */
  kinshipReport(rootId, otherId) {
    if (!rootId || !otherId) return { primary: "not related", collapse: false, paths: [] };
    if (rootId === otherId) return { primary: "self", collapse: false, paths: [{ kind: "blood", label: "self", via: [rootId], da: 0, db: 0, collapse: false, routes: 1 }] };
    const blood = this.bloodRelations(rootId, otherId);
    let paths = blood;
    if (!paths.length) {
      const g = this.people[otherId]?.gender;
      const spouseWord = g === "M" ? "husband" : g === "F" ? "wife" : "spouse";
      if (this.spouses(rootId).includes(otherId)) {
        paths = [{ kind: "marriage", label: spouseWord, via: [rootId, otherId], da: 0, db: 0, collapse: false, routes: 1 }];
      } else {
        const viaRoot = [];
        for (const sp of this.spouses(rootId)) {
          for (const p of this.bloodRelations(sp, otherId)) {
            if (p.label === "self") continue;
            viaRoot.push({ ...p, kind: "marriage", label: `${p.label} (by marriage)`, hop: sp });
          }
        }
        if (viaRoot.length) paths = viaRoot;
        else {
          const viaOther = [];
          for (const sp of this.spouses(otherId)) {
            for (const p of this.bloodRelations(rootId, sp)) {
              if (p.label === "self") continue;
              viaOther.push({ ...p, kind: "marriage", label: `${p.label}'s ${spouseWord}`, hop: sp });
            }
          }
          paths = viaOther;
        }
      }
    }
    const collapse = paths.some((p) => p.collapse);
    const labels = [...new Set(paths.map((p) => p.label))];
    let primary = labels[0] || "not related";
    if (labels.length > 1) primary = labels.join(" · ");
    if (collapse && !/pedigree collapse/i.test(primary)) primary = `${primary} · pedigree collapse`;
    return { primary, collapse, paths };
  }

  /** Blood relationship only (closest common ancestor). Null if they don't share an ancestor. */
  bloodKinship(rootId, otherId) {
    const paths = this.bloodRelations(rootId, otherId);
    return paths[0]?.label || null;
  }

  /** Describe how `other` relates to `root` (English). One marriage hop, never recursive. */
  kinship(rootId, otherId) {
    return this.kinshipReport(rootId, otherId).primary;
  }

  /** Ahnentafel slots from root (index 1 = root; father = 2i; mother = 2i+1). */
  ahnentafelSlots(rootId, maxGens = 12) {
    const out = [];
    const walk = (pid, idx, g) => {
      if (g > maxGens) return;
      if (pid) out.push({ pid, idx, g });
      if (g >= maxGens) return;
      walk(this.father(pid), idx * 2, g + 1);
      walk(this.mother(pid), idx * 2 + 1, g + 1);
    };
    if (rootId) walk(rootId, 1, 0);
    return out;
  }

  /** People who occupy two or more ahnentafel slots of `rootId` (pedigree collapse). */
  collapsedAncestors(rootId, maxGens = 12) {
    const counts = new Map();
    for (const s of this.ahnentafelSlots(rootId, maxGens)) {
      const arr = counts.get(s.pid) || [];
      arr.push(s);
      counts.set(s.pid, arr);
    }
    const collapsed = new Map();
    for (const [pid, slots] of counts) if (slots.length > 1) collapsed.set(pid, slots);
    return collapsed;
  }

  // ---------- search ----------
  search(q, limit = 30) {
    const s = fold(q).trim();
    if (!s) return [];
    if (!this._searchIndex) {
      this._searchIndex = this.peopleList.map((p) => {
        const v = this.vitals(p.id);
        const places = v.all.map((e) => this.placeName(e)).join(" ");
        return {
          id: p.id,
          packed: packPerson(p),
          extra: fold(`${p.id} ${v.birthLike?.date?.year || ""} ${v.deathLike?.date?.year || ""} ${places}`),
          name: fold(p.name),
        };
      });
    }
    const scored = [];
    for (const e of this._searchIndex) {
      const score = scorePackedQuery(s, e.packed, e.extra, e.name);
      if (score) scored.push({ id: e.id, score });
    }
    scored.sort((a, b) => b.score - a.score || this.people[a.id].name.localeCompare(this.people[b.id].name));
    return scored.slice(0, limit).map((x) => x.id);
  }

  /** Indexed variants that differ from the Gramps display name. */
  visibleNameAliases(pid) {
    return visibleAliases(this.people[pid]);
  }

  /** Palette label when the query hit an alias, not the printed name. */
  matchedAlias(pid, q) {
    return matchedAlias(this.people[pid], q);
  }

  // ---------- family-chart adapter ----------
  /** Full dataset in f3 format: [{ id, data:{...}, rels:{ parents, spouses, children } }] */
  toF3() {
    const out = [];
    for (const p of Object.values(this.people)) {
      const v = this.vitals(p.id);
      const c = this.conf(p.id);
      const parents = this.parents(p.id);
      const spouses = this.spouses(p.id);
      const children = this.children(p.id);
      out.push({
        id: p.id,
        data: {
          "first name": p.first || (isPlaceholder(p) ? "?" : ""),
          "last name": p.surname || "",
          gender: p.gender === "M" ? "M" : p.gender === "F" ? "F" : "",
          birthday: v.birthLike?.date?.year ?? "",
          deathday: v.deathLike?.date?.year ?? "",
          birthText: v.birthLike?.date?.text || "",
          deathText: v.deathLike?.date?.text || "",
          birthPlace: this.shortPlace(v.birthLike),
          deathPlace: this.shortPlace(v.deathLike),
          avatar: this.portrait(p.id) || "",
          confidence: c.score,
          tier: c.tier,
          line: this.lines[p.id] || "",
          color: this.colorOf(p.id),
          wall: this.isBrickWall(p.id),
          placeholder: isPlaceholder(p),
          living: v.living,
        },
        rels: { parents, spouses, children },
      });
    }
    return out;
  }
}
