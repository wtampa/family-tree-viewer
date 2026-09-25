/**
 * Accent-fold and Spanish / particle name aliases.
 * Indexes variants only — never rewrites the Gramps/GEDCOM display name.
 */

const CONJUNCTIONS = new Set(["y", "e", "i"]);

/** Longest first. Whole tokens only — never strip inside Delgado. */
const PARTICLES = [
  "van der", "van den", "van de", "von der", "von dem",
  "de las", "de los", "de la",
  "van", "von", "vom", "zu", "zum", "zur",
  "del", "de", "da", "das", "do", "dos",
  "di", "du", "des", "della", "delle", "degli", "dei",
  "la", "le", "el", "al",
  "den", "ten", "ter", "te",
  "bin", "ibn", "bint", "ben",
  "af", "av",
  "d", "l",
];

const PARTICLE_TOKENS = new Set(PARTICLES.flatMap((p) => p.split(" ")));

export function fold(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’`´]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function compact(s) {
  return fold(s).replace(/\s+/g, "");
}

export function isParticleToken(t) {
  return PARTICLE_TOKENS.has(fold(t)) || CONJUNCTIONS.has(fold(t));
}

export function contentTerms(query) {
  const terms = fold(query).split(/\s+/).filter(Boolean);
  const content = terms.filter((t) => t.length > 1 && !isParticleToken(t));
  return content.length ? content : terms;
}

function leadingParticleLength(foldedTokens) {
  const joined = foldedTokens.join(" ");
  for (const p of PARTICLES) {
    if (joined === p || joined.startsWith(`${p} `)) return p.split(" ").length;
  }
  return 0;
}

/** Split a surname string into units: "de la Torre y García" → ["de la Torre", "García"]. */
export function surnameUnits(surname) {
  const raw = String(surname || "").trim();
  if (!raw) return [];
  const hyphenParts = raw.split(/[-–—/]/).map((s) => s.trim()).filter(Boolean);
  if (hyphenParts.length > 1) return hyphenParts.flatMap(surnameUnits);
  const tokens = raw.split(/\s+/).filter(Boolean);
  const units = [];
  let i = 0;
  while (i < tokens.length) {
    const tok = fold(tokens[i]);
    if (CONJUNCTIONS.has(tok) && units.length && i < tokens.length - 1) {
      i += 1;
      continue;
    }
    const rest = tokens.slice(i);
    const n = leadingParticleLength(rest.map(fold));
    if (n && n < rest.length) {
      units.push(rest.slice(0, n + 1).join(" "));
      i += n + 1;
    } else {
      units.push(tokens[i]);
      i += 1;
    }
  }
  return units;
}

export function stripLeadingParticlesRaw(surname) {
  const tokens = String(surname || "").trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return "";
  const n = leadingParticleLength(tokens.map(fold));
  if (n && n < tokens.length) return tokens.slice(n).join(" ");
  return tokens.join(" ");
}

function unitsFromNameRecord(n) {
  if (n?.surnames?.length) {
    return n.surnames.flatMap((s) => surnameUnits([s.prefix, s.value].filter(Boolean).join(" ")));
  }
  if (n?.surname) return surnameUnits(n.surname);
  return [];
}

/** One unit list per Gramps/GEDCOM name record (birth, married, aka). */
export function surnameUnitsFromPerson(person) {
  const records = [];
  const names = person?.names?.length ? person.names : null;
  if (names) {
    for (const n of names) {
      const units = unitsFromNameRecord(n);
      if (units.length) records.push(units);
    }
  }
  if (!records.length && person?.surname) records.push(surnameUnits(person.surname));
  return records;
}

export function surnameCores(person) {
  const cores = new Set();
  for (const units of surnameUnitsFromPerson(person)) {
    for (const u of units) {
      const f = fold(stripLeadingParticlesRaw(u) || u);
      if (f) cores.add(canonCore(f));
    }
  }
  return [...cores];
}

function canonCore(core) {
  if (core.startsWith("mac") && core.length >= 6) return `mc${core.slice(3)}`;
  return core;
}

export function givenTokens(person) {
  const out = new Set();
  const add = (s) => {
    for (const t of fold(s).split(" ")) {
      if (t && t.length > 1 && !isParticleToken(t)) out.add(t);
    }
  };
  add(person?.first);
  for (const n of person?.names || []) {
    add(n.first);
    add(n.nick);
    add(n.call);
  }
  return [...out];
}

function addFolded(out, s) {
  const f = fold(s);
  if (f) out.add(f);
}

export function spacedAliases(person) {
  const out = new Set();
  addFolded(out, person?.name);
  addFolded(out, `${person?.first || ""} ${person?.surname || ""} ${person?.suffix || ""}`);
  for (const n of person?.names || []) {
    addFolded(out, `${n.first || ""} ${n.surname || ""} ${n.nick || ""} ${n.call || ""} ${n.suffix || ""}`);
  }
  const first = person?.first || "";
  for (const units of surnameUnitsFromPerson(person)) {
    const cores = units.map((u) => stripLeadingParticlesRaw(u) || u);
    const rev = units.slice().reverse();
    const revCores = cores.slice().reverse();
    addFolded(out, units.join(" "));
    addFolded(out, cores.join(" "));
    addFolded(out, rev.join(" "));
    addFolded(out, revCores.join(" "));
    addFolded(out, units.join("-"));
    addFolded(out, cores.join("-"));
    addFolded(out, `${first} ${units.join(" ")}`);
    addFolded(out, `${first} ${cores.join(" ")}`);
    addFolded(out, `${first} ${rev.join(" ")}`);
    addFolded(out, `${first} ${revCores.join(" ")}`);
    addFolded(out, `${first} ${units.join("-")}`);
    for (const u of units) addFolded(out, u);
    for (const c of cores) addFolded(out, c);
  }
  for (const t of givenTokens(person)) out.add(t);
  return [...out];
}

export function packPerson(person) {
  const aliases = spacedAliases(person);
  const compactAliases = [...new Set(aliases.map(compact).filter(Boolean))];
  return {
    aliases,
    compactAliases,
    cores: surnameCores(person),
    firsts: givenTokens(person),
  };
}

export function scorePackedQuery(query, packed, extra = "", nameFold = "") {
  const q = fold(query);
  if (!q) return 0;
  const terms = contentTerms(q);
  if (!terms.length) return 0;
  const aliasHay = packed.aliases.join(" | ");
  const compactHay = packed.compactAliases.join(" ");
  const extraF = fold(extra);
  const qCompact = compact(q);

  let score = 0;
  if (nameFold === q || packed.aliases.includes(q)) score += 10;
  else if (nameFold.startsWith(q)) score += 6;
  else if (qCompact.length >= 5 && packed.compactAliases.includes(qCompact)) score += 8;

  for (const t of terms) {
    let hit = 0;
    if (nameFold.startsWith(t) || nameFold.split(" ").includes(t)) hit = 5;
    else if (nameFold.includes(t)) hit = 3;
    else if (packed.cores.includes(t) || packed.firsts.includes(t)) hit = 4;
    else if (packed.aliases.some((a) => a === t || a.split(" ").includes(t))) hit = 3;
    else if (aliasHay.includes(t) || (t.length >= 4 && compactHay.includes(t))) hit = 2;
    else if (extraF.includes(t)) hit = 1;
    else return 0;
    score += hit;
  }
  return score;
}

export function scoreNameQuery(query, person) {
  return scorePackedQuery(query, packPerson(person), "", fold(person?.name));
}

/** Home-picker score. Same thresholds as before; aliases only raise a match. */
export function homeHintScore(hint, person) {
  const h = fold(hint);
  if (!h) return 0;
  if (fold(person.name) === h || fold(`${person.first || ""} ${person.surname || ""}`) === h) return 100;
  const packed = packPerson(person);
  if (packed.aliases.includes(h)) return 90;
  const words = h.split(" ");
  const firstTok = fold(person.first).split(" ")[0];
  if (words.length >= 2 && firstTok === words[0] && packed.cores.includes(words[words.length - 1])) return 85;
  const s = scorePackedQuery(hint, packed, "", fold(person.name));
  if (s >= 10) return 80;
  if (s >= 6) return 70;
  if (s > 0) return 35;
  return 0;
}

function primaryFirst(person) {
  const tokens = fold(person?.first).split(" ").filter((t) => t && !isParticleToken(t));
  return tokens[0] || fold(person?.first).split(" ")[0] || "";
}

/** Keys for duplicate / wall matching. Particle-stripped, apellido-order-insensitive. */
export function identityKeys(person) {
  const first = primaryFirst(person);
  if (!first || first.length < 2) return [];
  const keys = new Set();
  for (const units of surnameUnitsFromPerson(person)) {
    const cores = units
      .map((u) => canonCore(fold(stripLeadingParticlesRaw(u) || u)))
      .filter((c) => c.length >= 2);
    if (!cores.length) continue;
    keys.add(`${[...cores].sort().join(" ")}|${first}`);
  }
  return [...keys];
}

export function namesLikelySame(a, b) {
  const A = identityKeys(a);
  const B = new Set(identityKeys(b));
  return A.some((k) => B.has(k));
}

function prettyFromFold(folded) {
  return fold(folded).split(" ").filter(Boolean).map((w) => {
    if (isParticleToken(w)) return w;
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join(" ");
}

/**
 * Human variants that differ from the stored display name.
 * Never replaces person.name.
 */
export function visibleAliases(person, limit = 6) {
  const display = String(person?.name || "").replace(/\s+/g, " ").trim();
  if (!display) return [];
  const seen = new Set([fold(display)]);
  const out = [];
  const add = (s) => {
    const t = String(s || "").replace(/\s+/g, " ").trim();
    if (!t || t === display) return;
    const f = fold(t);
    if (!f || seen.has(f)) return;
    seen.add(f);
    out.push(t);
  };

  if (display.normalize("NFD").match(/[\u0300-\u036f]/)) add(prettyFromFold(fold(display)));

  const first = (person.first || "").trim();
  for (const units of surnameUnitsFromPerson(person)) {
    if (!units.length) continue;
    const cores = units.map((u) => stripLeadingParticlesRaw(u) || u);
    if (units.length >= 2) {
      add([first, ...units.slice().reverse()].filter(Boolean).join(" "));
      add(units.slice().reverse().join(" "));
    }
    if (cores.some((c, i) => fold(c) !== fold(units[i]))) {
      add([first, ...cores].filter(Boolean).join(" "));
      add(cores.join(" "));
    }
    if (units.length >= 2) add([first, units.join("-")].filter(Boolean).join(" "));
  }
  return out.slice(0, limit);
}

function termsInOrder(hay, terms) {
  let i = 0;
  for (const t of terms) {
    const at = hay.indexOf(t, i);
    if (at < 0) return false;
    i = at + t.length;
  }
  return true;
}

/** Palette hint when the query hit an alias, not the printed name. */
export function matchedAlias(person, query) {
  const q = fold(query);
  if (!q) return "";
  const display = fold(person?.name);
  const terms = contentTerms(q);
  const qCompact = compact(q);
  if (display.includes(q) || (terms.length && termsInOrder(display, terms))) return "";
  const vis = visibleAliases(person, 12);
  for (const v of vis) {
    const fv = fold(v);
    if (fv === q || fv.includes(q) || compact(fv) === qCompact || terms.every((t) => fv.includes(t) || compact(fv).includes(t))) return v;
  }
  const packed = packPerson(person);
  if (qCompact.length >= 5 && packed.compactAliases.includes(qCompact)) {
    return vis[0] || prettyFromFold(packed.aliases.find((a) => compact(a) === qCompact) || "");
  }
  const hit = packed.aliases.find((a) => a === q || terms.every((t) => a.split(" ").includes(t) || a.includes(t)));
  return hit ? prettyFromFold(hit) : "";
}
