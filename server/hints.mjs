/**
 * Research hint engine (GenSmarts-style, deterministic).
 * Never proposes names. Suggests record classes + search links + a priority.
 */
import fs from "node:fs";
import { vitals, likelyLiving, familyEvents, citationWeight, SOURCE_CLASS } from "./confidence.mjs";
import { fold, identityKeys, surnameCores } from "../src/lib/names.js";

// ---------- helpers ----------
const enc = encodeURIComponent;
const norm = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const uniq = (arr) => [...new Set(arr)];

function placeTitle(model, ev) {
  if (!ev?.place) return "";
  return model.places[ev.place]?.title || model.places[ev.place]?.name || "";
}

/** Best-guess "where this person lived" places, ordered by date. */
function personPlaces(model, pid) {
  return vitals(model, pid).all
    .map((e) => ({ year: e.date?.year ?? null, place: placeTitle(model, e), type: e.type }))
    .filter((x) => x.place);
}

/** Estimate a birth year when missing: from children (−28), parents (+28), spouse (±3), death (−70). */
export function estimateBirthYear(model, pid) {
  const v = vitals(model, pid);
  if (v.birthLike?.date?.year) return { year: v.birthLike.date.year, est: false };
  const p = model.people[pid];
  const guesses = [];
  for (const fid of p.families) {
    const f = model.families[fid];
    for (const c of f?.children || []) {
      const cy = vitals(model, c.id).birthLike?.date?.year;
      if (cy) guesses.push(cy - 28);
    }
    const sp = f?.father === pid ? f?.mother : f?.father;
    if (sp) {
      const sy = vitals(model, sp).birthLike?.date?.year;
      if (sy) guesses.push(sy + (p.gender === "M" ? 3 : -3));
    }
    for (const e of familyEvents(model, fid)) if (/Marriage/.test(e.type) && e.date?.year) guesses.push(e.date.year - 25);
  }
  for (const fid of p.parentFamilies) {
    const f = model.families[fid];
    for (const par of [f?.father, f?.mother]) {
      if (!par) continue;
      const py = vitals(model, par).birthLike?.date?.year;
      if (py) guesses.push(py + 28);
    }
  }
  if (v.deathLike?.date?.year) guesses.push(v.deathLike.date.year - 65);
  if (!guesses.length) return { year: null, est: true };
  guesses.sort((a, b) => a - b);
  return { year: Math.round(guesses[Math.floor(guesses.length / 2)]), est: true };
}

/** Placeholder stubs like "Unknown Surname" or "???" — never real research targets themselves. */
export function isPlaceholder(p) {
  if (!p) return true;
  if (p.privateLiving) return false;
  const f = norm(p.first);
  return !f || /^(unknown|unk|n n|nn|desconocid[oa]|\?+|x+|no name|unnamed|living|private)$/.test(f) || /^\?/.test(p.first || "");
}

// ---------- ancestry / closeness ----------
export function ancestorGenerations(model, homeId) {
  // Map of personId → smallest generation distance from home (0 = home). Only ancestors + home.
  const gen = {};
  if (!model.people[homeId]) return gen;
  const q = [[homeId, 0]];
  gen[homeId] = 0;
  while (q.length) {
    const [pid, g] = q.shift();
    for (const fid of model.people[pid]?.parentFamilies || []) {
      const f = model.families[fid];
      for (const par of [f?.father, f?.mother]) {
        if (par && (gen[par] === undefined || gen[par] > g + 1)) { gen[par] = g + 1; q.push([par, g + 1]); }
      }
    }
  }
  return gen;
}

export function ancestralLine(model, homeId) {
  // Label each direct ancestor with the surname of the closest great-grandparent-level ancestor (used for colors).
  const gen = ancestorGenerations(model, homeId);
  const line = {};
  const assign = (pid, label) => {
    if (line[pid]) return;
    line[pid] = label;
    for (const fid of model.people[pid]?.parentFamilies || []) {
      const f = model.families[fid];
      for (const par of [f?.father, f?.mother]) if (par) assign(par, label);
    }
  };
  // Generation-3 ancestors (great-grandparents) seed lines; fall back to grandparents if fewer.
  const seeds = Object.entries(gen).filter(([, g]) => g === 3).map(([id]) => id);
  const seedGen = seeds.length >= 4 ? 3 : 2;
  for (const [pid, g] of Object.entries(gen)) {
    if (g === seedGen) assign(pid, model.people[pid].surname || model.people[pid].name);
  }
  for (const [pid, g] of Object.entries(gen)) if (g < seedGen) line[pid] = "home";
  return line;
}

// ---------- record-class rules by place / era ----------
const RULES = [
  {
    id: "cuba-parish", test: (p, y) => /cuba/.test(p) && (y == null || y < 1885),
    records: ["Parish sacramental books (bautismos / matrimonios / defunciones) — partida literal, not just the index", "Cuban Genealogical Club indexes (Matanzas cathedral, Bejucal, Güines, La Salud…)", "Padrones / censos parroquiales", "Spanish military or emigration files (PARES, AGI Ultramar)"],
    links: (n, y) => [fsCatalog("Cuba"), pares(n), ...cgcLocal(n)],
  },
  {
    id: "cuba-civil", test: (p, y) => /cuba/.test(p) && y != null && y >= 1885,
    records: ["Registro Civil (Cuba civil registration began 1885)", "Parish books still kept in parallel", "Spanish consular / emigration records", "Passenger lists Havana → Key West / Tampa"],
    links: (n, y) => [fsCatalog("Cuba"), pares(n), ancestry(n, y, "Cuba")],
  },
  {
    id: "keywest", test: (p, y) => /key west|monroe.*florida/.test(p),
    records: ["US federal census 1870 / 1880 / 1900 / 1910 (Monroe County)", "Key West city directories", "Monroe County marriage licenses", "Key West cigar-worker and Cuban-exile club records (Poyo 1982; Spanish consular files)", "Key West Cemetery burial records"],
    links: (n, y) => [fsSearch(n, y, "Key West, Monroe, Florida"), ancestry(n, y, "Key West, Florida"), findagrave(n, y), chronam(n, y, "Florida")],
  },
  {
    id: "tampa", test: (p, y) => /tampa|hillsborough|ybor|west tampa/.test(p),
    records: ["Tampa Tribune / Tampa Times obituaries (ProQuest Historical Newspapers via HCPLC)", "Hillsborough County marriage records", "Tampa city directories (Polk)", "Florida State Census 1885 / 1935 / 1945", "Florida death certificates (1917+) — name parents", "Myrtle Hill / Centro Asturiano / L'Unione Italiana cemetery records"],
    links: (n, y) => [fsSearch(n, y, "Tampa, Hillsborough, Florida"), ancestry(n, y, "Tampa, Florida"), findagrave(n, y), chronam(n, y, "Florida"), flDeathIndex(n)],
  },
  {
    id: "florida", test: (p, y) => /florida/.test(p),
    records: ["Florida Death Index 1877–1998", "Florida death certificate (1917+) — prints parents", "Florida marriage index 1822–1875 / 1830–1993", "Florida State Census 1885 / 1935 / 1945", "Federal census 1880–1950"],
    links: (n, y) => [fsSearch(n, y, "Florida"), ancestry(n, y, "Florida"), findagrave(n, y), flDeathIndex(n)],
  },
  {
    id: "italy", test: (p) => /italy|italia|penne|pescara|abruzz|sicil|palermo|agrigento|calabria|campania/.test(p),
    records: ["Stato civile atti (nascita / matrimonio / morte) on Antenati (Portale Antenati)", "Allegati al matrimonio (processetti) — name parents and birth parish", "Parish registers (Archivio Diocesano)", "Passenger manifests Naples/Palermo → New York / New Orleans / Tampa"],
    links: (n, y) => [antenati(n), fsCatalog("Italy"), ancestry(n, y, "Italy")],
  },
  {
    id: "spain", test: (p) => /spain|espa[ñn]a|asturias|oviedo|salas|canar|galicia|santander|cantabria/.test(p),
    records: ["Parish libros sacramentales (Archivo Histórico Diocesano de Oviedo for Asturias)", "Registro Civil (Spain, 1871+)", "PARES — emigration, military, consular files", "Padrones municipales"],
    links: (n, y) => [pares(n), fsCatalog("Spain"), ancestry(n, y, "Spain")],
  },
  {
    id: "bahamas", test: (p) => /bahamas|harbour island|green turtle|abaco|nassau|eleuthera/.test(p),
    records: ["Bahamas Registrar General — civil births/marriages/deaths (1850+)", "Methodist and Anglican parish registers (Harbour Island, Green Turtle Cay)", "Loyalist land grants and slave registers (1822–1834)", "Bahamas Department of Archives"],
    links: (n, y) => [fsCatalog("Bahamas"), ancestry(n, y, "Bahamas"), findagrave(n, y)],
  },
  {
    id: "connecticut", test: (p) => /connecticut|new london|noank|groton|stonington/.test(p),
    records: ["Barbour Collection of Connecticut vital records (pre-1850)", "Connecticut town vital records", "Hale Collection of cemetery inscriptions", "US federal census 1790–1880"],
    links: (n, y) => [fsSearch(n, y, "Connecticut"), ancestry(n, y, "Connecticut"), findagrave(n, y)],
  },
  {
    id: "newyork", test: (p) => /new york|queens|brooklyn|manhattan/.test(p),
    records: ["NYC vital records index (Italian Genealogical Group / NYC Municipal Archives)", "NY State census 1892 / 1905 / 1915 / 1925", "Passenger manifests (Castle Garden / Ellis Island)"],
    links: (n, y) => [fsSearch(n, y, "New York"), ancestry(n, y, "New York"), findagrave(n, y)],
  },
  {
    id: "indiana", test: (p) => /indiana|muncie|evansville|delaware county|vanderburgh/.test(p),
    records: ["Indiana Death Certificates 1899–2017", "Indiana Marriages 1811–2019", "County courthouse records", "Federal census 1850–1950"],
    links: (n, y) => [fsSearch(n, y, "Indiana"), ancestry(n, y, "Indiana"), findagrave(n, y)],
  },
  {
    id: "usa", test: (p) => /usa|united states|u\.s\.|florida|georgia|alabama|texas|carolina|virginia|massachusetts|new jersey|pennsylvania|ohio|illinois|louisiana|indiana/.test(p),
    records: ["US federal census decades inside the lifespan", "State vital records / death certificates", "Find a Grave / cemetery records", "Local newspapers (Chronicling America)"],
    links: (n, y) => [fsSearch(n, y, ""), ancestry(n, y, ""), findagrave(n, y), chronam(n, y, "")],
  },
];

/** A recorded year is exact. An estimate widens the window and must not look like a fact in a URL. */
function yearSpan(y) {
  if (y && typeof y === "object") return { year: Number.isFinite(y.year) ? y.year : null, est: !!y.est };
  if (typeof y === "number" && Number.isFinite(y)) return { year: y, est: false };
  return { year: null, est: false };
}

function pinRank(h) {
  if (h.state !== "pinned") return 0;
  return h.wall?.nextRecord ? 2 : 1;
}

/** Pinned walls with a next record come first, then other pinned hints, then priority. */
export function compareHints(a, b) {
  return pinRank(b) - pinRank(a) || b.priority - a.priority || String(a.title).localeCompare(String(b.title));
}

function fsSearch(n, y, place) {
  const { year, est } = yearSpan(y);
  const q = [`q.givenName=${enc(n.first)}`, `q.surname=${enc(n.surname)}`];
  if (year) {
    const pad = est ? 10 : 3;
    q.push(`q.birthLikeDate.from=${year - pad}`, `q.birthLikeDate.to=${year + pad}`);
  }
  if (place) q.push(`q.anyPlace=${enc(place)}`);
  return { label: "FamilySearch records", url: `https://www.familysearch.org/search/record/results?${q.join("&")}` };
}
function fsCatalog(place) {
  return { label: `FamilySearch catalog: ${place}`, url: `https://www.familysearch.org/search/catalog/results?query=%2Bplace%3A%22${enc(place)}%22` };
}
function ancestry(n, y, place) {
  const { year, est } = yearSpan(y);
  const parts = [`name=${enc(n.first)}_${enc(n.surname)}`];
  if (year && !est) parts.push(`birth=${year}${place ? `_${enc(place)}` : ""}`);
  return { label: "Ancestry search", url: `https://www.ancestry.com/search/?${parts.join("&")}` };
}
function findagrave(n, y) {
  const { year, est } = yearSpan(y);
  const q = [`firstname=${enc(n.first)}`, `lastname=${enc(n.surname)}`];
  if (year) q.push(`birthyear=${year}`, `birthyearfilter=${est ? 10 : 5}`);
  return { label: "Find a Grave", url: `https://www.findagrave.com/memorial/search?${q.join("&")}` };
}
function chronam(n, y, state) {
  const { year } = yearSpan(y);
  const q = [`andtext=${enc(`${n.first} ${n.surname}`.trim())}`, "dateFilterType=yearRange"];
  if (year) q.push(`date1=${Math.max(1770, year - 5)}`, `date2=${Math.min(1963, year + 90)}`);
  if (state) q.push(`state=${enc(state)}`);
  return { label: "Chronicling America", url: `https://chroniclingamerica.loc.gov/search/pages/results/?${q.join("&")}` };
}
function pares(n) {
  return { label: "PARES (Spanish archives)", url: `https://pares.mcu.es/ParesBusquedas20/catalogo/find?nm=&texto=${enc(`${n.first} ${n.surname}`.trim())}` };
}
function antenati(n) {
  return { label: "Antenati (Italian civil records)", url: `https://antenati.cultura.gov.it/search-nominative/?cognome=${enc(n.surname)}&nome=${enc(n.first)}` };
}
function flDeathIndex(n) {
  return { label: "Florida Death Index (FamilySearch)", url: `https://www.familysearch.org/search/collection/results?collectionId=1932406&q.givenName=${enc(n.first)}&q.surname=${enc(n.surname)}` };
}
function cgcLocal(n) {
  const letter = (n.surname || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().charAt(0).toUpperCase();
  const out = [];
  if (letter) {
    out.push({ label: `CGC Matanzas baptisms index — ${letter} (books 1–10)`, url: `/api/file?p=${enc(`00_Data_In/cgc_matanzas_baptism_indexes/catedral_matanzas_baptisms_-_${letter}_-_Book_1-10.pdf`)}`, local: true, fuzzy: true });
    out.push({ label: `CGC Matanzas baptisms index — ${letter} (books 11–20)`, url: `/api/file?p=${enc(`00_Data_In/cgc_matanzas_baptism_indexes/catedral_matanzas_baptisms_-_${letter}_-_Book_11-20.pdf`)}`, local: true, fuzzy: true });
  }
  out.push({ label: "CGC Index — Matanzas (overview PDF)", url: `/api/file?p=${enc("00_Data_In/cgc_matanzas_baptism_indexes/Index-Matanzas.pdf")}`, local: true });
  return out;
}

/** US federal census years that survive (1890 mostly destroyed). */
export const FEDERAL_CENSUS_YEARS = (() => {
  const ys = [];
  for (let d = 1790; d <= 1950; d += 10) if (d !== 1890) ys.push(d);
  return ys;
})();
export const FLORIDA_STATE_CENSUS_YEARS = [1885, 1935, 1945];

export function federalCensusYearsInSpan(from, to) {
  return FEDERAL_CENSUS_YEARS.filter((y) => y >= from && y <= to);
}

const US_PLACE_RE = /usa|united states|u\.s\.|florida|georgia|alabama|texas|carolina|virginia|massachusetts|new jersey|pennsylvania|ohio|illinois|louisiana|indiana|connecticut|new york|key west|tampa|ybor|hillsborough|monroe/;
const FL_PLACE_RE = /florida|tampa|ybor|west tampa|key west|hillsborough|monroe/;

export function censusSearchLinks(n, year, place) {
  const qPlace = place ? `&q.anyPlace=${enc(place)}` : "";
  return [
    { label: `FamilySearch ${year} census`, url: `https://www.familysearch.org/search/record/results?q.givenName=${enc(n.first)}&q.surname=${enc(n.surname)}&q.residenceDate.from=${year}&q.residenceDate.to=${year}${qPlace}` },
    { label: `Ancestry ${year} census`, url: `https://www.ancestry.com/search/categories/35/?name=${enc(n.first)}_${enc(n.surname)}&event=${year}${place ? `_${enc(place)}` : ""}` },
  ];
}

function censusHaveYears(model, pid) {
  const have = new Set();
  const v = vitals(model, pid);
  const consider = (text, year) => {
    if (/census|censo/i.test(text || "") && year) have.add(year);
  };
  for (const e of v.all) {
    consider(`${e.type} ${e.description || ""}`, e.date?.year);
    for (const cid of e.citations || []) {
      const cit = model.citations[cid];
      const src = cit ? model.sources[cit.source] : null;
      const blob = `${src?.title || ""} ${cit?.page || ""}`;
      if (/census|censo/i.test(blob)) {
        const y = Number((cit?.page || "").match(/\b(1[7-9]\d{2}|1950)\b/)?.[1] || e.date?.year);
        if (y) have.add(y);
      }
    }
  }
  return have;
}

/**
 * Census-year checklist for the person drawer.
 * Years come from lifespan + US / Florida / Key West / Tampa rules — never invented people.
 */
export function censusChecklist(model, pid) {
  const p = model.people[pid];
  if (!p || isPlaceholder(p)) return { applicable: false, years: [] };
  const places = personPlaces(model, pid);
  const blob = places.map((x) => x.place).join(" ");
  if (!US_PLACE_RE.test(norm(blob))) return { applicable: false, years: [] };
  const v = vitals(model, pid);
  const est = estimateBirthYear(model, pid);
  const living = likelyLiving(model, p.id);
  const by = v.birthLike?.date?.year || est.year;
  const dy = v.deathLike?.date?.year || (living ? Math.min(new Date().getFullYear(), 1950) : (by ? by + 95 : null));
  if (!by && !dy) return { applicable: false, years: [] };
  const usPlaces = places.filter((x) => US_PLACE_RE.test(norm(x.place)));
  const firstUs = usPlaces.map((x) => x.year).filter(Boolean).sort((a, b) => a - b)[0];
  const start = firstUs != null ? firstUs - 2 : (by ? by - 2 : 1790);
  const end = dy ?? 1950;
  const have = censusHaveYears(model, pid);
  const n = { first: p.first || "", surname: p.surname || "" };
  const bestPlace = usPlaces.find((x) => /Residence|Census|Death|Burial|Marriage/.test(x.type))?.place
    || usPlaces[0]?.place
    || places.find((x) => /Birth|Baptism|Residence/.test(x.type))?.place
    || places[0]?.place
    || "";
  const years = [];
  for (const year of federalCensusYearsInSpan(start, end)) {
    years.push({ year, kind: "federal", have: have.has(year), links: censusSearchLinks(n, year, bestPlace) });
  }
  if (FL_PLACE_RE.test(norm(blob))) {
    for (const year of FLORIDA_STATE_CENSUS_YEARS) {
      if (year < start || year > end) continue;
      years.push({ year, kind: "florida", have: have.has(year), links: censusSearchLinks(n, year, bestPlace || "Florida") });
    }
  }
  years.sort((a, b) => a.year - b.year || a.kind.localeCompare(b.kind));
  return { applicable: years.length > 0, years, place: bestPlace };
}

export function allCensusChecklists(model) {
  const out = {};
  for (const pid of Object.keys(model.people)) {
    const row = censusChecklist(model, pid);
    if (row.applicable) out[pid] = row;
  }
  return out;
}

export function recordSuggestions(placeStr, year, n) {
  const span = yearSpan(year);
  const y = span.year;
  const p = norm(placeStr);
  const hits = RULES.filter((r) => r.test(p, y));
  if (!hits.length) {
    return {
      records: ["Civil or church vital records for the place of the event", "Census / population registers inside the lifespan", "Cemetery and obituary records"],
      links: [fsSearch(n, span, placeStr || ""), ancestry(n, span, placeStr || ""), findagrave(n, span)],
      rule: "generic",
    };
  }
  const records = uniq(hits.flatMap((h) => h.records)).slice(0, 7);
  const links = [];
  const seen = new Set();
  for (const h of hits) for (const l of h.links(n, span)) if (!seen.has(l.url)) { seen.add(l.url); links.push(l); }
  // Census decades inside lifespan for US places. The census years themselves are real.
  if (/usa|united states|florida|connecticut|new york|indiana/.test(p) && y) {
    const decades = federalCensusYearsInSpan(y - 2, y + 95);
    if (decades.length) records.push(`Census years to check: ${decades.join(", ")}`);
  }
  return { records, links, rule: hits[0].id };
}

// ---------- brick-walls/OPEN.md cross reference ----------
export function parseOpenWalls(file) {
  if (!file || !fs.existsSync(file)) return [];
  const md = fs.readFileSync(file, "utf8");
  const walls = [];
  const re = /^## \s*(\d+)\.\s+(.+?)\s+[—-]+\s+([A-Z][A-Z ]+?)(?:\s*\(.*\))?\s*$/gm;
  let m;
  while ((m = re.exec(md))) {
    const start = m.index + m[0].length;
    const next = md.indexOf("\n## ", start);
    const body = md.slice(start, next === -1 ? undefined : next);
    const row = (label) => {
      const r = body.match(new RegExp(`^\\|\\s*${label}[^|]*\\|\\s*([^\\n]+?)\\s*\\|\\s*$`, "mi"));
      return r ? r[1].replace(/\*\*/g, "").trim() : "";
    };
    walls.push({
      n: Number(m[1]),
      title: m[2].replace(/\*\*/g, "").trim(),
      status: m[3].trim(),
      raw: m[0],
      person: row("Person") || row("Generation"),
      missing: row("Missing"),
      nextRecord: row("Next record"),
      evidence: row("Evidence we have"),
      notes: row("Notes"),
    });
  }
  return walls;
}

function matchWall(walls, person) {
  const first = fold(person.first).split(" ").filter((t) => t.length > 1)[0] || "";
  const cands = surnameCores(person).filter((s) => s.length >= 3);
  return walls.find((w) => {
    const t = fold(`${w.title} ${w.person}`);
    return first && first.length >= 4 && t.includes(first) && cands.some((s) => t.includes(s));
  }) || null;
}

// ---------- main ----------
/**
 * @param model normalized Gramps model
 * @param opts { homeId, confidence, openWallsFile, state }
 */
export function computeHints(model, opts = {}) {
  const homeId = opts.homeId && model.people[opts.homeId] ? opts.homeId : Object.keys(model.people)[0];
  const conf = opts.confidence || {};
  const gen = ancestorGenerations(model, homeId);
  const walls = parseOpenWalls(opts.openWallsFile);
  const nowYear = new Date().getFullYear();
  const hints = [];

  const closeness = (pid) => {
    const g = gen[pid];
    if (g === undefined) return 0.35; // collateral
    return Math.max(0.4, 1.25 - g * 0.1); // 0→1.25, 4→0.85, 8→0.45
  };
  const nameOf = (pid) => ({ first: model.people[pid]?.first || "", surname: model.people[pid]?.surname || "" });

  const push = (h) => {
    const base = h.base ?? 40;
    const priority = Math.round(base * closeness(h.personId) * (h.factor ?? 1));
    const id = `${h.type}:${h.personId}:${h.key || ""}`;
    const { base: _b, factor: _f, key: _k, ...rest } = h;
    hints.push({ id, priority, generation: gen[h.personId] ?? null, isAncestor: gen[h.personId] !== undefined, ...rest });
  };

  const people = Object.values(model.people);
  for (const p of people) {
    const v = vitals(model, p.id);
    const living = likelyLiving(model, p.id, nowYear);
    const est = estimateBirthYear(model, p.id);
    const places = personPlaces(model, p.id);
    const bestPlace = places.find((x) => /Birth|Baptism/.test(x.type))?.place || places[0]?.place || "";
    const n = nameOf(p.id);
    if (isPlaceholder(p)) continue; // stubs are targets of their child's wall, not research subjects
    const wall = matchWall(walls, p);
    const noteWall = p.notes.some((nid) => /brick wall/i.test(model.notes[nid]?.text || ""));
    const c = conf[p.id];

    // 1. End-of-line ancestor (brick wall). Placeholder parents with only a surname still count as a wall.
    const realParents = p.parentFamilies.flatMap((fid) => [model.families[fid]?.father, model.families[fid]?.mother]).filter((x) => x && !isPlaceholder(model.people[x]));
    const placeholderParents = p.parentFamilies.flatMap((fid) => [model.families[fid]?.father, model.families[fid]?.mother]).filter((x) => x && isPlaceholder(model.people[x]));
    if (!realParents.length && gen[p.id] !== undefined && gen[p.id] > 0) {
      const sug = recordSuggestions(bestPlace, est, n);
      const surnamesKnown = placeholderParents.map((x) => model.people[x].surname).filter(Boolean);
      push({
        type: "brick-wall", personId: p.id, key: "parents", base: 90,
        // Curated walls in brick-walls/OPEN.md outrank derived ones; "priority #1" gets an extra bump.
        factor: wall ? (/priority\s*#?1\b/i.test(`${wall.title} ${wall.status} ${wall.raw || ""}`) ? 1.8 : 1.5) : noteWall ? 1.4 : 1,
        title: surnamesKnown.length ? `Parents of ${p.name}: given names unknown (${surnamesKnown.join(" × ")})` : `Parents of ${p.name} unknown`,
        why: `${p.name} is a generation-${gen[p.id]} direct ancestor with ${surnamesKnown.length ? "only parent surnames" : "no parents"} recorded${est.year ? ` (born ${est.est ? "about " : ""}${est.year}${bestPlace ? `, ${bestPlace}` : ""})` : ""}.`,
        suggestedRecords: [`Baptism / birth record of ${p.name} — the paragraph names the parents`, ...sug.records],
        searchLinks: sug.links,
        suggestionConfidence: bestPlace ? (est.est ? "medium" : "high") : "low",
        wall: wall ? { n: wall.n, title: wall.title, status: wall.status, nextRecord: wall.nextRecord, missing: wall.missing } : null,
        rule: sug.rule,
      });
    }

    // 2. Missing vitals
    if (!v.birthLike || !v.birthLike.date) {
      const sug = recordSuggestions(bestPlace, est, n);
      push({
        type: "missing-birth", personId: p.id, key: "birth", base: 55,
        title: `No birth or baptism ${v.birthLike ? "date" : "event"} for ${p.name}`,
        why: est.year ? `Estimated birth about ${est.year} from relatives' dates.` : "No dated events to anchor this person in time.",
        suggestedRecords: sug.records, searchLinks: sug.links,
        suggestionConfidence: bestPlace ? "medium" : "low", rule: sug.rule,
      });
    } else if (!v.birthLike.place) {
      const sug = recordSuggestions(bestPlace, v.birthLike.date.year, n);
      push({
        type: "missing-birthplace", personId: p.id, key: "birthplace", base: 35,
        title: `Birth place missing for ${p.name}`,
        why: `Born ${v.birthLike.date.text} but no place is recorded.`,
        suggestedRecords: sug.records, searchLinks: sug.links, suggestionConfidence: "medium", rule: sug.rule,
      });
    }
    if (!living && !v.deathLike) {
      const dyear = v.birthLike?.date?.year ? v.birthLike.date.year + 65 : est.year ? est.year + 65 : null;
      const lastPlace = [...places].sort((a, b) => (b.year || 0) - (a.year || 0))[0]?.place || bestPlace;
      const sug = recordSuggestions(lastPlace, { year: dyear, est: true }, n);
      push({
        type: "missing-death", personId: p.id, key: "death", base: 45,
        title: `No death or burial for ${p.name}`,
        why: `${v.birthLike?.date?.year ? `Born ${v.birthLike.date.year}` : est.year ? `Born about ${est.year}` : "Undated"}; a death record or obituary often names parents and birthplace.`,
        suggestedRecords: ["Death certificate / civil death act (names parents, birthplace, informant)", "Obituary and funeral notice", "Burial / cemetery record", ...sug.records],
        searchLinks: sug.links, suggestionConfidence: lastPlace ? "medium" : "low", rule: sug.rule,
      });
    }

    // 3. Weak sourcing
    const uncited = [];
    if (v.birthLike && !v.birthLike.citations.length) uncited.push(v.birthLike.type.toLowerCase());
    if (v.deathLike && !v.deathLike.citations.length) uncited.push(v.deathLike.type.toLowerCase());
    if (uncited.length) {
      const sug = recordSuggestions(bestPlace, v.birthLike?.date?.year ? v.birthLike.date.year : est, n);
      push({
        type: "uncited", personId: p.id, key: uncited.join("+"), base: 30,
        title: `Uncited ${uncited.join(" and ")} for ${p.name}`,
        why: `The ${uncited.join(" and ")} event${uncited.length > 1 ? "s have" : " has"} no citation. Attach the record that supports it.`,
        suggestedRecords: sug.records, searchLinks: sug.links, suggestionConfidence: "medium", rule: sug.rule,
      });
    }
    if (c?.memberOnly) {
      const sug = recordSuggestions(bestPlace, v.birthLike?.date?.year ? v.birthLike.date.year : est, n);
      push({
        type: "member-tree-only", personId: p.id, key: "member", base: 32,
        title: `${p.name} rests only on member trees`,
        why: `All ${c.citations} citation${c.citations > 1 ? "s" : ""} point to Ancestry member trees. Replace with a primary record.`,
        suggestedRecords: sug.records, searchLinks: sug.links, suggestionConfidence: "medium", rule: sug.rule,
      });
    }

    // 4. Plausibility conflicts
    const by = v.birthLike?.date?.year;
    const dy = v.deathLike?.date?.year;
    if (by && dy && dy < by) {
      push({ type: "conflict", personId: p.id, key: "death<birth", base: 60, title: `Death before birth for ${p.name}`, why: `Death ${v.deathLike.date.text} precedes birth ${v.birthLike.date.text}.`, suggestedRecords: ["Re-check the source images for both dates"], searchLinks: [], suggestionConfidence: "high", rule: "plausibility" });
    }
    if (v.death?.date?.sort && v.burial?.date?.sort && v.burial.date.sort < v.death.date.sort) {
      push({ type: "conflict", personId: p.id, key: "burial<death", base: 55, title: `Burial before death for ${p.name}`, why: `Burial ${v.burial.date.text} precedes death ${v.death.date.text}.`, suggestedRecords: ["Re-check the burial and death dates against the record images"], searchLinks: [], suggestionConfidence: "high", rule: "plausibility" });
    }
    if (by && dy && dy - by > 110) {
      push({ type: "conflict", personId: p.id, key: "lifespan", base: 50, title: `Lifespan of ${dy - by} years for ${p.name}`, why: `Born ${by}, died ${dy}. One date is probably wrong or belongs to another person.`, suggestedRecords: ["Compare with a burial record or obituary age"], searchLinks: [], suggestionConfidence: "high", rule: "plausibility" });
    }
    // Multiple birth events with different years
    const births = v.all.filter((e) => e.type === "Birth" && e.date?.year);
    const years = uniq(births.map((e) => e.date.year));
    if (years.length > 1) {
      push({ type: "conflict", personId: p.id, key: "birth-years", base: 55, title: `Conflicting birth years for ${p.name}: ${years.join(" / ")}`, why: "Several Birth events disagree. Keep the one backed by the best source and demote the others to notes.", suggestedRecords: ["Prefer the record closest to the event (baptism paragraph, civil act)"], searchLinks: [], suggestionConfidence: "high", rule: "plausibility" });
    }
    // Parent ages
    for (const fid of p.families) {
      const f = model.families[fid];
      if (!f) continue;
      const role = f.father === p.id ? "father" : "mother";
      const sp = role === "father" ? f.mother : f.father;
      if (sp && by) {
        const sy = vitals(model, sp).birthLike?.date?.year;
        if (sy && Math.abs(sy - by) > 40) {
          push({ type: "conflict", personId: p.id, key: `spouse-gap:${sp}`, base: 40, title: `${Math.abs(sy - by)}-year age gap between ${p.name} and ${model.people[sp].name}`, why: "Spouse age gap above 40 years usually means a mis-linked spouse or wrong birth year.", suggestedRecords: ["Confirm the marriage record ages"], searchLinks: [], suggestionConfidence: "medium", rule: "plausibility" });
        }
      }
      if (by) {
        for (const ch of f.children) {
          const cy = vitals(model, ch.id).birthLike?.date?.year;
          if (!cy) continue;
          const age = cy - by;
          const [lo, hi] = role === "mother" ? [14, 55] : [14, 75];
          if (age < lo || age > hi) {
            push({ type: "conflict", personId: p.id, key: `parent-age:${ch.id}`, base: 55, title: `${p.name} was ${age} at birth of ${model.people[ch.id].name}`, why: `Outside the plausible ${role} range (${lo}–${hi}). Check for a same-name grandparent or a wrong generation.`, suggestedRecords: ["Verify the child's baptism paragraph names this parent"], searchLinks: [], suggestionConfidence: "high", rule: "plausibility" });
          }
          if (dy && role === "father" && cy > dy + 1) {
            push({ type: "conflict", personId: p.id, key: `posthumous:${ch.id}`, base: 55, title: `${model.people[ch.id].name} born ${cy - dy} years after ${p.name} died`, why: "A child born more than a year after the father's death points to a mis-linked family.", suggestedRecords: ["Check the child's parents in a primary record"], searchLinks: [], suggestionConfidence: "high", rule: "plausibility" });
          }
        }
      }
    }
    // Marriage missing for a 'Married' family
    for (const fid of p.families) {
      const f = model.families[fid];
      if (!f || f.father !== p.id) continue; // emit once per family (from father's side; or mother if no father)
      const hasM = familyEvents(model, fid).some((e) => /Marriage/.test(e.type));
      if (!hasM && (f.relType === "Married" || f.children.length)) {
        const spouse = f.mother ? model.people[f.mother]?.name : "unknown spouse";
        const firstChild = f.children.map((ch) => vitals(model, ch.id).birthLike?.date?.year).filter(Boolean).sort()[0];
        const myear = firstChild ? firstChild - 2 : by ? by + 25 : est.year ? est.year + 25 : null;
        const sug = recordSuggestions(bestPlace, { year: myear, est: true }, n);
        push({
          type: "missing-marriage", personId: p.id, key: `marriage:${fid}`, base: 38,
          title: `No marriage record for ${p.name} × ${spouse}`,
          why: `${f.children.length ? `${f.children.length} child${f.children.length > 1 ? "ren" : ""} recorded; ` : ""}a marriage act names both sets of parents and ages.${myear ? ` Look around ${myear}.` : ""}`,
          suggestedRecords: ["Marriage act / parish matrimonio (parents of both spouses)", ...sug.records],
          searchLinks: sug.links, suggestionConfidence: bestPlace ? "medium" : "low", rule: sug.rule, familyId: fid,
        });
      }
    }
  }
  // Families with a mother but no father where mother is the only parent (emit marriage hint from mother side)
  for (const f of Object.values(model.families)) {
    if (f.father || !f.mother) continue;
    if (!f.children.length) continue;
    const m = model.people[f.mother];
    if (!m) continue;
    const motherEst = estimateBirthYear(model, f.mother);
    push({ type: "missing-spouse", personId: f.mother, key: `spouse:${f.id}`, base: 42, title: `Father of ${m.name}'s child${f.children.length > 1 ? "ren" : ""} not recorded`, why: `Family ${f.id} has ${f.children.length} child${f.children.length > 1 ? "ren" : ""} and no father.`, suggestedRecords: ["Children's baptism / birth records name the father", "Marriage record of the mother"], searchLinks: recordSuggestions(personPlaces(model, f.mother)[0]?.place || "", motherEst, nameOf(f.mother)).links, suggestionConfidence: "medium", rule: "family", familyId: f.id });
  }

  // 5. Possible duplicates (accent / particle / apellido-order aliases share a key)
  const buckets = {};
  for (const p of people) {
    if (!p.first || !p.surname) continue;
    for (const k of identityKeys(p)) (buckets[k] ||= []).push(p);
  }
  const seenDup = new Set();
  for (const group of Object.values(buckets)) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) {
      const a = group[i], b = group[j];
      const pair = [a.id, b.id].sort().join("|");
      if (seenDup.has(pair)) continue;
      seenDup.add(pair);
      const ay = vitals(model, a.id).birthLike?.date?.year, byy = vitals(model, b.id).birthLike?.date?.year;
      if (ay && byy && Math.abs(ay - byy) > 2) continue;
      // Skip if one is the other's parent/child (same-name generations)
      const related = a.parentFamilies.some((fid) => [model.families[fid]?.father, model.families[fid]?.mother].includes(b.id)) || b.parentFamilies.some((fid) => [model.families[fid]?.father, model.families[fid]?.mother].includes(a.id));
      if (related) continue;
      push({ type: "duplicate", personId: a.id, key: `dup:${b.id}`, base: 28, title: `Possible duplicate: ${a.name}${ay ? ` (${ay})` : ""} and ${b.name}${byy ? ` (${byy})` : ""}`, why: ay && byy ? "Same name, birth years within 2." : "Same name and no dates to separate them.", suggestedRecords: ["Compare events and sources; merge in Gramps if identical"], searchLinks: [], suggestionConfidence: ay && byy ? "medium" : "low", rule: "duplicate", otherId: b.id });
    }
  }

  // Apply persisted state
  const state = opts.state || {};
  for (const h of hints) {
    const s = state[h.id];
    h.state = s?.state || "open";
    h.stateNote = s?.note || "";
    h.stateAt = s?.at || null;
    if (h.state === "pinned") h.priority += 100;
  }
  hints.sort(compareHints);
  return hints;
}
