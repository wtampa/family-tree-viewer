// Sanity check: node server/check.mjs [path-or-tree-id] [--all]
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeConfidence } from "./confidence.mjs";
import { computeHints, censusChecklist } from "./hints.mjs";
import { TreeModel } from "../src/lib/model.js";
import { personStops, uniqueMappedPlaces } from "../src/lib/places.js";
import { selftestPlaces } from "./places-selftest.mjs";
import { selftestNames } from "./names-selftest.mjs";
import { selftestHintExport } from "./hint-export-selftest.mjs";
import { selftestStore } from "./store-selftest.mjs";
import { selftestShareExport } from "./share-export-selftest.mjs";
import { surnameCores, visibleAliases } from "../src/lib/names.js";
import { allEntries, entryById, resolveTreePath, treeFileExists, loadTreeFile, pickHomeId, hasPersonalTree, personalEntry } from "./trees.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2).filter((a) => a !== "--all");
const wantAll = process.argv.includes("--all");

function resolveTarget(arg) {
  if (!arg) {
    if (hasPersonalTree()) return personalEntry();
    return allEntries().find(treeFileExists) || null;
  }
  const byId = entryById(arg);
  if (byId) return byId;
  return { id: "cli", title: arg, file: arg, absolute: path.resolve(arg), homeHints: [] };
}

function checkOne(entry) {
  const file = entry.absolute || resolveTreePath(entry);
  const t0 = Date.now();
  const m = loadTreeFile(file);
  const homeId = pickHomeId(m, { homeHints: entry.homeHints, defaultHomeId: entry.defaultHomeId });
  const home = m.people[homeId];
  console.log("\n==", entry.id || "file", "==");
  console.log("file", m.meta.file);
  console.log("format", m.meta.format || m.meta.grampsVersion || "");
  console.log("counts", JSON.stringify(m.meta.counts));
  console.log("parse ms", Date.now() - t0);
  console.log("home", home ? `${home.name} (${homeId})` : "MISSING");

  let dangling = 0;
  for (const f of Object.values(m.families)) {
    for (const c of f.children) if (!m.people[c.id]) dangling++;
    if (f.father && !m.people[f.father]) dangling++;
    if (f.mother && !m.people[f.mother]) dangling++;
  }
  for (const p of Object.values(m.people)) {
    for (const e of p.events) if (!m.events[e.id]) dangling++;
    for (const fid of p.parentFamilies) if (!m.families[fid]) dangling++;
    for (const fid of p.families) if (!m.families[fid]) dangling++;
  }
  console.log("dangling refs", dangling);

  const parentsOf = (pid) => {
    const out = [];
    for (const fid of m.people[pid].parentFamilies) {
      const f = m.families[fid];
      if (f?.father) out.push(f.father);
      if (f?.mother) out.push(f.mother);
    }
    return out;
  };
  const state = {};
  let cycles = 0;
  const visit = (pid) => {
    if (state[pid] === 2) return;
    if (state[pid] === 1) { cycles++; return; }
    state[pid] = 1;
    for (const q of parentsOf(pid)) visit(q);
    state[pid] = 2;
  };
  for (const pid of Object.keys(m.people)) visit(pid);
  console.log("ancestry cycles", cycles);

  const conf = computeConfidence(m);
  const tree = new TreeModel({
    version: 1,
    settings: { homeId },
    model: m,
    confidence: conf,
    generations: {},
    lines: {},
    links: {},
  });
  let kinOk = 0;
  let maxPaths = 0;
  let inventedKin = 0;
  for (const pid of Object.keys(m.people)) {
    const report = tree.kinshipReport(tree.homeId, pid);
    kinOk++;
    maxPaths = Math.max(maxPaths, report.paths.length);
    if (/\?\?\?/.test(report.primary)) inventedKin++;
  }
  const collapsedHome = tree.collapsedAncestors(tree.homeId, 12);
  let anyCollapseRoot = 0;
  for (const pid of Object.keys(m.people)) if (tree.collapsedAncestors(pid, 8).size) anyCollapseRoot++;
  const hints = computeHints(m, { homeId, confidence: conf, openWallsFile: entry.openWallsFile ? path.resolve(here, "..", "..", entry.openWallsFile) : "" });
  const invented = hints.filter((h) => /invent/i.test(h.why));
  const usCensus = Object.values(m.people).map((p) => censusChecklist(m, p.id)).filter((c) => c.applicable);
  console.log("kinship vs home", kinOk, "max paths", maxPaths, "invented ???", inventedKin);
  console.log("collapse slots from home", collapsedHome.size, "roots with diamonds (8 gens)", anyCollapseRoot);
  console.log("hints", hints.length, "invented-name mentions", invented.length);
  console.log("census checklists", usCensus.length);

  let mappedPeople = 0;
  let namedStops = 0;
  const allStops = [];
  for (const pid of Object.keys(m.people)) {
    const stops = personStops(tree, pid);
    namedStops += stops.length;
    if (stops.some((s) => s.lat != null)) mappedPeople++;
    allStops.push(...stops);
  }
  const mappedPlaces = uniqueMappedPlaces(allStops).length;
  const filePlacesWithCoord = Object.values(m.places).filter((p) => p.coord && Number.isFinite(Number(p.coord.lat))).length;
  console.log("place stops", namedStops, "people with mapped events", mappedPeople, "unique mapped", mappedPlaces, "places with stored coord", filePlacesWithCoord);

  let aliasPeople = 0;
  let coreSearchHits = 0;
  let coreSearchMiss = 0;
  for (const p of Object.values(m.people)) {
    if (visibleAliases(p).length) aliasPeople++;
    const core = surnameCores(p)[0];
    if (!core || core.length < 3 || !p.first) continue;
    if (tree.search(core, 25).includes(p.id)) coreSearchHits++;
    else coreSearchMiss++;
  }
  console.log("name aliases", aliasPeople, "people with visible variants; core-search hit", coreSearchHits, "miss", coreSearchMiss);

  return { dangling, cycles, inventedKin, inventedHints: invented.length, coreSearchMiss };
}

const targets = wantAll
  ? allEntries().filter(treeFileExists)
  : [resolveTarget(args[0])].filter(Boolean);

try {
  const r = selftestPlaces();
  console.log("places selftest", r.tests, "ok");
} catch (e) {
  console.error("FAIL places selftest", e.message);
  process.exit(1);
}
try {
  const r = selftestNames();
  console.log("names selftest", r.tests, "ok");
} catch (e) {
  console.error("FAIL names selftest", e.message);
  process.exit(1);
}
try {
  const r = selftestHintExport();
  console.log("hint-export selftest", r.tests, "ok");
} catch (e) {
  console.error("FAIL hint-export selftest", e.message);
  process.exit(1);
}
try {
  const r = selftestStore();
  console.log("store selftest", r.tests, "ok");
} catch (e) {
  console.error("FAIL store selftest", e.message);
  process.exit(1);
}
try {
  const r = selftestShareExport();
  console.log("share-export selftest", r.tests, "ok");
} catch (e) {
  console.error("FAIL share-export selftest", e.message);
  process.exit(1);
}

if (!targets.length) {
  console.error("No tree file found. Run npm run fetch-samples or pass a .gramps / .ged path.");
  process.exit(1);
}
let fail = 0;
for (const t of targets) {
  try {
    const r = checkOne(t);
    if (r.dangling || r.cycles || r.inventedKin || r.inventedHints) fail++;
  } catch (e) {
    console.error("FAIL", t.id || t.file, e.message);
    fail++;
  }
}
if (wantAll) console.log("\nchecked", targets.length, "trees");
process.exit(fail ? 1 : 0);
