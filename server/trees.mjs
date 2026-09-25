/**
 * Public sample catalog + optional local personal tree.
 * Personal data stays outside git; samples live in sample/.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadGramps } from "./gramps-parse.mjs";
import { loadGedcom } from "./gedcom-parse.mjs";
import { homeHintScore } from "../src/lib/names.js";

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PARENT = path.resolve(APP_ROOT, "..");
const CATALOG_FILE = path.join(APP_ROOT, "sample", "catalog.json");
const SETTINGS_FILE = path.join(APP_ROOT, "settings.json");
const PERSONAL_REL = "data/data.gramps";
const PERSONAL_GED_REL = "data/data.ged";

export { APP_ROOT, PARENT };

function readAppSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8")); } catch { return {}; }
}

/** Research library (Gramps file, portraits, 00_Data_In). Not the app folder. */
export function personalRoot() {
  const s = readAppSettings();
  if (s.personalRoot && fs.existsSync(s.personalRoot)) return path.resolve(s.personalRoot);
  const nextGramps = path.join(PARENT, PERSONAL_REL);
  if (fs.existsSync(nextGramps)) return PARENT;
  const nextGed = path.join(PARENT, PERSONAL_GED_REL);
  if (fs.existsSync(nextGed)) return PARENT;
  return APP_ROOT;
}

export function personalFile() {
  const s = readAppSettings();
  if (s.personalFile) {
    return path.isAbsolute(s.personalFile) ? s.personalFile : path.join(personalRoot(), s.personalFile);
  }
  const gramps = path.join(personalRoot(), PERSONAL_REL);
  if (fs.existsSync(gramps)) return gramps;
  const ged = path.join(personalRoot(), PERSONAL_GED_REL);
  if (fs.existsSync(ged)) return ged;
  return gramps;
}

export function personalDbFile() {
  return path.join(personalRoot(), "data", "tree.db");
}

export function hasPersonalDb() {
  if (personalRoot() === APP_ROOT) return false;
  return fs.existsSync(personalDbFile());
}

export function hasPersonalTree() {
  return fs.existsSync(personalFile()) || hasPersonalDb();
}

/** Genealogy research folder when a personal tree exists; otherwise the app folder. */
export function projectRoot() {
  return hasPersonalTree() ? personalRoot() : APP_ROOT;
}

export function loadCatalog() {
  try {
    return JSON.parse(fs.readFileSync(CATALOG_FILE, "utf8")).trees || [];
  } catch {
    return [];
  }
}

export function personalEntry() {
  if (!hasPersonalTree()) return null;
  return {
    id: "personal",
    title: "My tree (local)",
    blurb: "Your local tree (SQLite). Not published.",
    file: PERSONAL_REL,
    absolute: personalFile(),
    license: "private",
    source: "",
    homeHints: [],
    defaultHomeId: "",
    mediaRoots: ["sources/portraits", "sources/people", "sources", "00_Data_In", "research"],
    openWallsFile: "brick-walls/OPEN.md",
    local: true,
  };
}

export function allEntries() {
  const samples = loadCatalog().map((t) => ({ ...t, local: false }));
  const mine = personalEntry();
  return mine ? [mine, ...samples] : samples;
}

export function entryById(id) {
  return allEntries().find((t) => t.id === id) || null;
}

export function resolveTreePath(entry) {
  if (!entry) return "";
  if (entry.absolute) return entry.absolute;
  const rel = entry.file;
  if (path.isAbsolute(rel)) return rel;
  const fromApp = path.join(APP_ROOT, rel);
  if (fs.existsSync(fromApp)) return fromApp;
  return path.join(projectRoot(), rel);
}

export function treeFileExists(entry) {
  try {
    if (entry?.id === "personal") return hasPersonalTree();
    return fs.existsSync(resolveTreePath(entry));
  } catch { return false; }
}

export function loadTreeFile(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".ged" || ext === ".gedcom") return loadGedcom(file);
  return loadGramps(file);
}

export function pickHomeId(model, { homeId, homeHints, defaultHomeId } = {}) {
  if (homeId && model.people[homeId]) return homeId;
  if (defaultHomeId && model.people[defaultHomeId]) return defaultHomeId;
  const people = Object.values(model.people);
  const scoreHint = (p, hint) => homeHintScore(hint, p);
  for (const hint of homeHints || []) {
    let localBest = null;
    let localScore = 0;
    for (const p of people) {
      const s = scoreHint(p, hint);
      if (s > localScore) { localScore = s; localBest = p.id; }
    }
    if (localScore >= 70) return localBest;
  }
  let best = null;
  let score = -1;
  for (const p of people) {
    const s = (p.families?.length || 0) + (p.parentFamilies?.length || 0) + (p.events?.length || 0);
    if (s > score) { score = s; best = p.id; }
  }
  return best || Object.keys(model.people)[0] || "";
}

export function publicTreeList() {
  return allEntries()
    .filter(treeFileExists)
    .map((t) => ({
      id: t.id,
      title: t.title,
      blurb: t.blurb || "",
      license: t.license || "",
      local: !!t.local,
      format: t.id === "personal" && hasPersonalDb() ? "sqlite" : (path.extname(t.file).toLowerCase().replace(".", "") || "gramps"),
    }));
}
