#!/usr/bin/env node
/**
 * Family Tree Viewer server — 127.0.0.1:5180
 * Serves dist/ and the JSON API. Personal tree is SQLite (tree.db). data.gramps is never written.
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeConfidence } from "./server/confidence.mjs";
import { computeHints, ancestorGenerations, ancestralLine, allCensusChecklists } from "./server/hints.mjs";
import { exportHintLog } from "./server/hint-export.mjs";
import { buildFileIndex, resolveMedia } from "./server/media-index.mjs";
import {
  APP_ROOT, projectRoot, hasPersonalTree, allEntries, entryById, resolveTreePath,
  treeFileExists, loadTreeFile, pickHomeId, publicTreeList, personalEntry,
  personalRoot, personalFile, personalDbFile, hasPersonalDb,
} from "./server/trees.mjs";
import {
  applyEdit, changeCount, importModel, listHistory, loadModelFromDb, openDb, personalBackupDir,
  personalExportDir, rotateBackups, undoLast,
} from "./server/db.mjs";
import { dispatchEdit } from "./server/edit.mjs";
import { exportStampName, writeGrampsExport } from "./server/gramps-export.mjs";
import { exportGedcomStampName, writeGedcomExport } from "./server/gedcom-export.mjs";
import { exportHistoryLog } from "./server/history-export.mjs";
import { ingestFile, readIngestRequest } from "./server/media-ingest.mjs";
import { buildSharePack, latestSharePackDir, shareDestRoot, shareStampName } from "./server/share-export.mjs";
import {
  defaultHideLiving, redactModel, redactHints, redactCensus, redactLinks,
  redactMediaResolved, mediaTouchesLiving,
} from "./server/privacy.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, "dist");
const PUBLIC = path.join(__dirname, "public");
const CACHE_DIR = path.join(__dirname, ".cache");
const PORT = Number(process.env.TREE_PORT || 5180);
const HOST = "127.0.0.1";

const SETTINGS_FILE = path.join(__dirname, "settings.json");
const LINKS_FILE = path.join(__dirname, "links.json");
const HINTS_STATE_FILE = path.join(__dirname, "hints-state.json");
const MEDIA_MAP_FILE = path.join(__dirname, "media-map.json");
const PREVIEW_CACHE = path.join(CACHE_DIR, "previews.json");

function defaultSettings() {
  const mine = personalEntry();
  if (mine) {
    return {
      treeId: "personal",
      grampsFile: mine.file,
      homeId: mine.defaultHomeId,
      openWallsFile: mine.openWallsFile,
      mediaRoots: mine.mediaRoots,
      homeByTree: { personal: mine.defaultHomeId },
    };
  }
  const queen = entryById("queen") || allEntries()[0];
  return {
    treeId: queen?.id || "queen",
    grampsFile: queen?.file || "sample/queen/queen.gramps",
    homeId: "",
    openWallsFile: "",
    mediaRoots: queen?.mediaRoots || [],
    homeByTree: {},
  };
}

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml",
  ".ico": "image/x-icon", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
  ".webp": "image/webp", ".bmp": "image/bmp", ".tif": "image/tiff", ".tiff": "image/tiff", ".pdf": "application/pdf",
  ".woff2": "font/woff2", ".woff": "font/woff", ".map": "application/json", ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8", ".wasm": "application/wasm",
};

// ---------- small fs helpers ----------
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}
function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}
function inside(root, file) {
  const r = path.resolve(root);
  const f = path.resolve(file);
  return f === r || f.toLowerCase().startsWith((r + path.sep).toLowerCase());
}
function settings() {
  const merged = { ...defaultSettings(), ...readJson(SETTINGS_FILE, {}) };
  if (!merged.homeByTree) merged.homeByTree = {};
  const entry = entryById(merged.treeId) || (hasPersonalTree() ? personalEntry() : allEntries()[0]);
  if (entry) {
    merged.treeId = entry.id;
    merged.grampsFile = entry.file;
    merged.mediaRoots = entry.mediaRoots || [];
    merged.openWallsFile = entry.openWallsFile || "";
    const savedHome = merged.homeByTree[entry.id];
    if (savedHome) merged.homeId = savedHome;
    else if (entry.defaultHomeId) merged.homeId = entry.defaultHomeId;
  }
  const byTree = merged.hideLivingByTree || {};
  merged.hideLiving = Object.prototype.hasOwnProperty.call(byTree, merged.treeId)
    ? !!byTree[merged.treeId]
    : defaultHideLiving(merged.treeId);
  return merged;
}
function activeEntry() {
  const s = settings();
  return entryById(s.treeId) || allEntries().find(treeFileExists) || null;
}
function PROJECT_ROOT() { return projectRoot(); }
function abs(p) {
  if (!p) return "";
  if (path.isAbsolute(p)) return p;
  const fromApp = path.join(APP_ROOT, p);
  if (p.startsWith("sample") || fs.existsSync(fromApp)) return fromApp;
  return path.join(PROJECT_ROOT(), p);
}

const SIDECAR_NAMES = new Set(["settings.json", "links.json", "hints-state.json", "media-map.json"]);
const BLOCKED_EXT = new Set([".db", ".db-wal", ".db-shm", ".gramps", ".ged", ".gedcom", ".tmp"]);

function relUnder(root, file) {
  if (!inside(root, file)) return null;
  return path.relative(root, file).split(path.sep).join("/").toLowerCase();
}

/** Local files the UI may open. Tree databases, sidecars, and source GEDCOM/Gramps files are not among them. */
function servableFile(rel) {
  const file = abs(rel);
  if (!file) return { status: 404, error: "not found" };
  if (!inside(APP_ROOT, file) && !inside(PROJECT_ROOT(), file)) return { status: 403, error: "outside project" };
  const base = path.basename(file).toLowerCase();
  if (SIDECAR_NAMES.has(base)) return { status: 403, error: "not servable" };
  const rels = [relUnder(APP_ROOT, file), relUnder(PROJECT_ROOT(), file)].filter(Boolean);
  const inExports = rels.some((r) => r === "data/exports" || r.startsWith("data/exports/"));
  const inData = rels.some((r) => r === "data" || r.startsWith("data/"));
  if (inData && !inExports) return { status: 403, error: "not servable" };
  const ext = path.extname(file).toLowerCase();
  if (!inExports && BLOCKED_EXT.has(ext)) return { status: 403, error: "not servable" };
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return { status: 404, error: "not found", file: rel };
  return { status: 200, file };
}

// ---------- model cache ----------
let cache = { key: "", model: null, confidence: null, media: null, version: 0, error: "" };
let fileIndex = null;
let fileIndexAt = 0;
let editSessionBackedUp = false;

function ensurePersonalStore() {
  const root = personalRoot();
  if (root === APP_ROOT) throw new Error("Set personalRoot in settings.json to your research folder");
  const dbPath = personalDbFile();
  if (!fs.existsSync(dbPath)) {
    const source = personalFile();
    if (!fs.existsSync(source)) throw new Error("No tree.db and no data.gramps or data.ged to import");
    const model = loadTreeFile(source);
    const db = openDb(dbPath);
    try { importModel(db, model, { source }); }
    finally { db.close(); }
    console.log(`[tree] imported ${path.basename(source)} → ${dbPath} (source file left untouched)`);
  }
  return dbPath;
}

function backupPersonalDb() {
  const dbPath = personalDbFile();
  if (!fs.existsSync(dbPath) || personalRoot() === APP_ROOT) return "";
  const dest = rotateBackups(dbPath, personalBackupDir(personalRoot()));
  editSessionBackedUp = true;
  if (dest) console.log(`[tree] backup ${dest}`);
  return dest;
}

function ensureFileIndex(force = false) {
  const s = settings();
  if (!fileIndex || force || Date.now() - fileIndexAt > 5 * 60 * 1000) {
    fileIndex = buildFileIndex(s.mediaRoots.map(abs));
    fileIndexAt = Date.now();
  }
  return fileIndex;
}

function loadModel(force = false) {
  const s = settings();
  const entry = activeEntry();
  const personal = s.treeId === "personal" && hasPersonalTree();
  let file = entry ? resolveTreePath(entry) : abs(s.grampsFile);
  let store = "file";
  if (personal) {
    try { file = ensurePersonalStore(); store = "sqlite"; }
    catch (e) { cache.error = e.message; return cache; }
  }
  let st;
  try { st = fs.statSync(file); } catch (e) { cache.error = `Tree file not found: ${file}`; return cache; }
  const key = `${s.treeId}:${file}:${st.mtimeMs}:${st.size}`;
  if (!force && cache.key === key && cache.model) return cache;
  try {
    const t0 = Date.now();
    let model;
    let canUndo = false;
    if (store === "sqlite") {
      const db = openDb(file);
      try {
        model = loadModelFromDb(db);
        canUndo = changeCount(db) > 0;
      } finally { db.close(); }
      model.meta.file = file;
      model.meta.mtime = st.mtimeMs;
      model.meta.store = "sqlite";
    } else {
      model = loadTreeFile(file);
    }
    const homeId = pickHomeId(model, { homeId: s.homeId, homeHints: entry?.homeHints, defaultHomeId: entry?.defaultHomeId });
    if (homeId && homeId !== s.homeId) {
      const cur = readJson(SETTINGS_FILE, {});
      writeJson(SETTINGS_FILE, {
        ...cur,
        treeId: s.treeId,
        homeId,
        homeByTree: { ...(s.homeByTree || {}), [s.treeId]: homeId },
      });
    }
    const confidence = computeConfidence(model);
    const idx = ensureFileIndex(force);
    const media = resolveMedia(model, idx, {
      overrides: readJson(MEDIA_MAP_FILE, {}),
      preferRoots: (s.mediaRoots || []).map(abs),
      projectRoot: PROJECT_ROOT(),
      treeDir: path.dirname(file),
    });
    const gen = ancestorGenerations(model, homeId);
    const line = ancestralLine(model, homeId);
    cache = { key, model, confidence, media, gen, line, version: Date.now(), error: "", parseMs: Date.now() - t0, treeId: s.treeId, homeId, store, canUndo, editable: personal };
    console.log(`[tree] ${s.treeId}: ${model.meta.counts.people} people, ${model.meta.counts.families} families in ${cache.parseMs} ms`);
  } catch (e) {
    cache.error = `Parse failed: ${e.message}`;
    console.error(cache.error);
  }
  return cache;
}

// Watch the gramps file (debounced) so edits show up without restarting.
let watchTimer = 0;
function watchGramps() {
  const s = settings();
  const entry = activeEntry();
  const personal = s.treeId === "personal" && hasPersonalTree();
  const file = personal ? personalDbFile() : (entry ? resolveTreePath(entry) : abs(s.grampsFile));
  const dir = path.dirname(file);
  try {
    fs.watch(dir, { persistent: false }, (_ev, name) => {
      if (name && path.basename(file) !== name) return;
      clearTimeout(watchTimer);
      watchTimer = setTimeout(() => loadModel(), 600);
    });
  } catch (e) { console.warn("[tree] watch failed:", e.message); }
}

// ---------- API ----------
function send(res, code, body, type = MIME[".json"], extra = {}) {
  const buf = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(code, { "content-type": type, "cache-control": "no-store", ...extra });
  res.end(buf);
}
function sendFile(res, file, { download = false } = {}) {
  let st;
  try { st = fs.statSync(file); } catch { return send(res, 404, { error: "Not found" }); }
  if (!st.isFile()) return send(res, 404, { error: "Not a file" });
  const type = MIME[path.extname(file).toLowerCase()] || "application/octet-stream";
  const ext = path.extname(file).toLowerCase();
  const hashed = /[-.][A-Za-z0-9_-]{8}\.(js|mjs|css)$/.test(path.basename(file));
  const headers = { "content-type": type, "content-length": st.size, "cache-control": ext === ".html" ? "no-store" : hashed ? "public, max-age=31536000, immutable" : "private, max-age=600" };
  if (download) headers["content-disposition"] = `attachment; filename="${path.basename(file)}"`;
  else headers["content-disposition"] = `inline; filename="${encodeURIComponent(path.basename(file))}"`;
  res.writeHead(200, headers);
  fs.createReadStream(file).pipe(res);
}
async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function publicView(c, s) {
  const hide = !!s.hideLiving;
  const livingCount = Object.values(c.confidence || {}).filter((x) => x.living).length;
  let model = c.model;
  let mediaResolved = {};
  for (const [id, m] of Object.entries(c.media || {})) {
    mediaResolved[id] = { url: `/api/media/${encodeURIComponent(id)}`, kind: m.kind, how: m.how, file: path.relative(PROJECT_ROOT(), m.path) };
  }
  let links = readJson(LINKS_FILE, {});
  let census = allCensusChecklists(c.model);
  let living = new Set();
  let names = [];
  if (hide) {
    const red = redactModel(c.model, c.confidence);
    model = red.model;
    living = red.living;
    names = red.names;
    const med = redactMediaResolved(mediaResolved, c.model, living);
    mediaResolved = med.mediaResolved;
    links = redactLinks(links, living);
    census = redactCensus(census, living);
  }
  return { hide, living, names, livingCount, model, mediaResolved, links, census };
}

function cachedHints(c, s) {
  if (c.hints) return c.hints;
  c.hints = computeHints(c.model, {
    homeId: c.homeId || s.homeId,
    confidence: c.confidence,
    openWallsFile: s.openWallsFile ? abs(s.openWallsFile) : "",
    state: readJson(HINTS_STATE_FILE, {}),
  });
  return c.hints;
}

function hintBadgeCount(hints) {
  return hints.filter((h) => h.state === "open" || h.state === "pinned").filter((h) => h.isAncestor && (h.type === "brick-wall" || h.type === "conflict")).length;
}

function publicHints(c, s) {
  const hints = cachedHints(c, s);
  if (!s.hideLiving) return hints;
  const view = publicView(c, s);
  return redactHints(hints, view.living, view.names);
}

function treePayload() {
  const c = loadModel();
  if (!c.model) return { error: c.error || "No model" };
  const s = settings();
  const view = publicView(c, s);
  const model = { ...view.model };
  delete model.handleToId;
  return {
    version: c.version,
    settings: {
      homeId: c.homeId || s.homeId,
      grampsFile: s.grampsFile,
      treeId: s.treeId,
      hideLiving: view.hide,
      livingCount: view.livingCount,
      projectRoot: PROJECT_ROOT(),
      editable: !!c.editable,
      store: c.store || "file",
      canUndo: !!c.canUndo,
    },
    model,
    confidence: c.confidence,
    mediaResolved: view.mediaResolved,
    generations: c.gen,
    lines: c.line,
    links: view.links,
    census: view.census,
    hintBadge: hintBadgeCount(publicHints(c, s)),
  };
}

function hintsPayload(scope) {
  const c = loadModel();
  if (!c.model) return { error: c.error || "No model" };
  const s = settings();
  const all = publicHints(c, s);
  const narrowed = scope === "ancestors" ? all.filter((h) => h.isAncestor) : all;
  return {
    version: c.version,
    count: narrowed.length,
    total: all.length,
    scope: scope === "ancestors" ? "ancestors" : "all",
    hints: narrowed,
  };
}

let previewMod = null;
async function preview(url) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const cacheAll = readJson(PREVIEW_CACHE, {});
  const hit = cacheAll[url];
  if (hit && Date.now() - hit.at < 14 * 24 * 3600 * 1000) return hit.data;
  if (!previewMod) previewMod = await import("link-preview-js");
  const { getLinkPreview } = previewMod;
  let data;
  try {
    const r = await getLinkPreview(url, {
      timeout: 6000,
      followRedirects: "follow",
      resolveDNSHost: async (u) => {
        const dns = await import("node:dns");
        const { address } = await dns.promises.lookup(new URL(u).hostname);
        if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.|::1|fc|fd|172\.(1[6-9]|2\d|3[01])\.)/.test(address)) throw new Error("private address blocked");
        return address;
      },
      headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) FamilyTreeViewer/1.0", "accept-language": "en-US,en;q=0.8" },
    });
    data = {
      url: r.url || url, title: r.title || r.siteName || "", description: r.description || "", siteName: r.siteName || "",
      image: (r.images && r.images[0]) || null, favicon: (r.favicons && r.favicons[0]) || null, mediaType: r.mediaType || "", ok: true,
    };
  } catch (e) {
    data = { url, ok: false, error: e.message || String(e), title: new URL(url).hostname };
  }
  cacheAll[url] = { at: Date.now(), data };
  writeJson(PREVIEW_CACHE, cacheAll);
  return data;
}

async function handleApi(req, res, url) {
  const p = url.pathname;
  try {
    if (p === "/api/version") {
      const c = loadModel();
      const s = settings();
      return send(res, 200, { version: c.version, error: c.error || "", counts: c.model?.meta.counts || null, parseMs: c.parseMs || 0, treeId: s.treeId, hideLiving: s.hideLiving, ingest: true });
    }
    if (p === "/api/trees") {
      return send(res, 200, { trees: publicTreeList(), active: settings().treeId });
    }
    if (p === "/api/tree") return send(res, 200, treePayload());
    if (p === "/api/hints") {
      const scope = url.searchParams.get("scope") === "ancestors" ? "ancestors" : "all";
      return send(res, 200, hintsPayload(scope));
    }
    if (p === "/api/reload" && req.method === "POST") { loadModel(true); return send(res, 200, { ok: true, version: cache.version }); }

    if (p === "/api/settings") {
      if (req.method === "POST") {
        const body = await readBody(req);
        const cur = readJson(SETTINGS_FILE, {});
        const next = { ...cur, homeByTree: { ...(cur.homeByTree || {}) } };
        if (body.treeId) {
          const e = entryById(body.treeId);
          if (!e || !treeFileExists(e)) return send(res, 404, { error: `unknown or missing tree: ${body.treeId}` });
          next.treeId = e.id;
          next.grampsFile = e.file;
          next.homeId = next.homeByTree[e.id] || e.defaultHomeId || "";
        }
        const afterTree = { ...defaultSettings(), ...next };
        const treeId = next.treeId || afterTree.treeId;
        if (body.homeId) {
          const probe = loadModel(true);
          if (probe.model?.people[body.homeId]) {
            next.homeId = body.homeId;
            next.homeByTree[treeId] = body.homeId;
          }
        }
        if (typeof body.hideLiving === "boolean") {
          next.hideLivingByTree = { ...(next.hideLivingByTree || {}), [treeId]: body.hideLiving };
        }
        writeJson(SETTINGS_FILE, next);
        const reloadTree = Boolean(body.treeId || body.homeId);
        if (reloadTree) {
          cache = { key: "", model: null, confidence: null, media: null, version: 0, error: "" };
          fileIndex = null;
          loadModel(true);
        } else if (cache) {
          cache.version = Date.now();
        }
        return send(res, 200, settings());
      }
      return send(res, 200, settings());
    }

    if (p === "/api/hints-export") {
      if (req.method !== "POST") return send(res, 405, { error: "POST only" });
      const body = await readBody(req);
      const c = loadModel();
      if (!c.model) return send(res, 400, { error: c.error || "No model" });
      const s = settings();
      const view = publicView(c, s);
      const hints = publicHints(c, s);
      const entry = activeEntry();
      const result = exportHintLog({
        hints,
        model: view.model,
        treeId: s.treeId,
        treeTitle: entry?.title || s.treeId,
        homeId: c.homeId || s.homeId,
        includeOpenAncestors: Boolean(body.includeOpenAncestors),
        projectRoot: PROJECT_ROOT(),
        appRoot: APP_ROOT,
      });
      return send(res, 200, {
        ok: result.ok,
        count: result.count,
        path: result.path,
        relative: result.relative,
        error: result.error || "",
      });
    }

    if (p === "/api/hints-state") {
      if (req.method === "POST") {
        const body = await readBody(req); // { id, state: open|done|dismissed|pinned, note }
        const st = readJson(HINTS_STATE_FILE, {});
        if (!body.id) return send(res, 400, { error: "id required" });
        if (body.state === "open" && !body.note) delete st[body.id];
        else st[body.id] = { state: body.state || "open", note: body.note || "", at: new Date().toISOString() };
        writeJson(HINTS_STATE_FILE, st);
        if (cache) cache.hints = null;
        return send(res, 200, st);
      }
      return send(res, 200, readJson(HINTS_STATE_FILE, {}));
    }

    if (p === "/api/links") {
      if (req.method === "POST") {
        const body = await readBody(req); // { personId, add: {url|path,label,kind} } | { personId, remove: index } | { personId, links: [...] }
        const all = readJson(LINKS_FILE, {});
        if (!body.personId) return send(res, 400, { error: "personId required" });
        const cur = all[body.personId] || [];
        let next = cur;
        if (Array.isArray(body.links)) next = body.links;
        else if (body.add) next = [...cur, { ...body.add, added: new Date().toISOString() }];
        else if (Number.isInteger(body.remove)) next = cur.filter((_, i) => i !== body.remove);
        if (next.length) all[body.personId] = next; else delete all[body.personId];
        writeJson(LINKS_FILE, all);
        return send(res, 200, all);
      }
      const all = readJson(LINKS_FILE, {});
      const s = settings();
      if (!s.hideLiving) return send(res, 200, all);
      const c = loadModel();
      const view = publicView(c, s);
      return send(res, 200, redactLinks(all, view.living));
    }

    if (p === "/api/preview") {
      const target = url.searchParams.get("url") || "";
      let u;
      try { u = new URL(target); } catch { return send(res, 400, { error: "bad url" }); }
      if (!/^https?:$/.test(u.protocol)) return send(res, 400, { error: "http(s) only" });
      return send(res, 200, await preview(u.toString()));
    }

    if (p === "/api/file") {
      const rel = url.searchParams.get("p") || "";
      const gate = servableFile(rel);
      if (gate.status !== 200) return send(res, gate.status, { error: gate.error, ...(gate.file ? { file: gate.file } : {}) });
      return sendFile(res, gate.file, { download: url.searchParams.get("dl") === "1" });
    }

    if (p === "/api/open" && req.method === "POST") {
      // Reveal a project file in Explorer / default app (local desktop convenience)
      const body = await readBody(req);
      const gate = servableFile(body.p || "");
      if (gate.status !== 200) return send(res, gate.status, { error: gate.error || "not found" });
      const { spawn } = await import("node:child_process");
      spawn("cmd", ["/c", "start", "", gate.file], { detached: true, stdio: "ignore", windowsHide: true }).unref();
      return send(res, 200, { ok: true });
    }

    if (p.startsWith("/api/media/")) {
      const id = decodeURIComponent(p.slice("/api/media/".length));
      const c = loadModel();
      const m = c.media?.[id];
      if (!m) return send(res, 404, { error: "unresolved media", id });
      if (settings().hideLiving && mediaTouchesLiving(c.model, c.confidence, id)) {
        return send(res, 404, { error: "living media hidden", id });
      }
      return sendFile(res, m.path);
    }

    if (p === "/api/media-map") {
      if (req.method === "POST") {
        const body = await readBody(req); // { mediaId, path }
        const map = readJson(MEDIA_MAP_FILE, {});
        if (!body.mediaId) return send(res, 400, { error: "mediaId required" });
        if (body.path) map[body.mediaId] = body.path; else delete map[body.mediaId];
        writeJson(MEDIA_MAP_FILE, map);
        loadModel(true);
        return send(res, 200, map);
      }
      return send(res, 200, readJson(MEDIA_MAP_FILE, {}));
    }

    if (p === "/api/ingest-media" && req.method === "POST") {
      if (settings().treeId !== "personal") return send(res, 403, { error: "Ingest is only available on My tree (local)" });
      if (personalRoot() === APP_ROOT) return send(res, 403, { error: "Ingest writes only under the research folder, not the app." });
      let payload;
      try { payload = await readIngestRequest(req); }
      catch (e) { return send(res, e.message?.includes("too large") ? 413 : 400, { error: e.message || String(e) }); }
      const c = loadModel();
      const person = c.model?.people?.[payload.personId];
      if (!person) return send(res, 400, { error: "person not found" });
      let dest;
      try {
        dest = ingestFile({
          personalRoot: personalRoot(),
          person,
          kind: payload.kind,
          originalName: payload.name,
          caption: payload.caption,
          ext: path.extname(payload.name || ""),
          bytes: payload.bytes,
        });
      } catch (e) {
        return send(res, 400, { error: e.message || String(e) });
      }
      const body = {
        action: "attach",
        personId: payload.personId,
        src: dest.relative,
        description: payload.caption || path.basename(dest.relative),
        mime: payload.mime || MIME[dest.ext] || "",
      };
      if (!editSessionBackedUp) backupPersonalDb();
      const dbPath = ensurePersonalStore();
      const db = openDb(dbPath);
      let result;
      try { result = applyEdit(db, (ctx) => dispatchEdit("media", body, ctx), { kind: "media", body }); }
      finally { db.close(); }
      cache = { key: "", model: null, confidence: null, media: null, version: 0, error: "" };
      fileIndex = null;
      loadModel(true);
      ensureFileIndex(true);
      return send(res, 200, {
        ok: true,
        ...result,
        path: dest.abs,
        relative: dest.relative,
        version: cache.version,
        canUndo: true,
      });
    }

    if (p.startsWith("/api/edit/") && req.method === "POST") {
      const kind = p.slice("/api/edit/".length);
      if (settings().treeId !== "personal") return send(res, 403, { error: "Editing is only available on My tree (local)" });
      const body = await readBody(req);
      if (kind === "media" && (body.action || "attach") === "attach" && (body.path || body.src)) {
        const file = abs(body.path || body.src);
        if ((!inside(APP_ROOT, file) && !inside(PROJECT_ROOT(), file)) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
          return send(res, 400, { error: "File not found in the research folder. Copy the photo into sources/portraits, sources, 00_Data_In, or research, then pick it." });
        }
        body.src = (inside(PROJECT_ROOT(), file) ? path.relative(PROJECT_ROOT(), file) : path.relative(APP_ROOT, file)).split(path.sep).join("/");
        const ext = path.extname(file).toLowerCase();
        body.mime = body.mime || MIME[ext] || "";
        if (!body.description) body.description = path.basename(file);
      }
      if (!editSessionBackedUp) backupPersonalDb();
      const dbPath = ensurePersonalStore();
      const db = openDb(dbPath);
      let result;
      try { result = applyEdit(db, (ctx) => dispatchEdit(kind, body, ctx), { kind, body }); }
      finally { db.close(); }
      cache = { key: "", model: null, confidence: null, media: null, version: 0, error: "" };
      loadModel(true);
      return send(res, 200, { ok: true, ...result, version: cache.version, canUndo: true });
    }

    if (p === "/api/undo" && req.method === "POST") {
      if (settings().treeId !== "personal") return send(res, 403, { error: "Undo is only available on My tree (local)" });
      const dbPath = ensurePersonalStore();
      const db = openDb(dbPath);
      let result;
      try { result = undoLast(db); }
      finally { db.close(); }
      if (!result.ok) return send(res, 400, result);
      cache = { key: "", model: null, confidence: null, media: null, version: 0, error: "" };
      loadModel(true);
      return send(res, 200, { ...result, version: cache.version, canUndo: !!cache.canUndo });
    }

    if (p === "/api/export-gramps" && req.method === "POST") {
      if (settings().treeId !== "personal") return send(res, 403, { error: "Export is only available on My tree (local)" });
      const c = loadModel();
      if (!c.model) return send(res, 400, { error: c.error || "No model" });
      const dest = path.join(personalExportDir(personalRoot()), exportStampName("tree"));
      writeGrampsExport(c.model, dest);
      return send(res, 200, { ok: true, path: dest, relative: path.relative(personalRoot(), dest) });
    }

    if (p === "/api/export-gedcom" && req.method === "POST") {
      if (settings().treeId !== "personal") return send(res, 403, { error: "Export is only available on My tree (local)" });
      const c = loadModel();
      if (!c.model) return send(res, 400, { error: c.error || "No model" });
      const dest = path.join(personalExportDir(personalRoot()), exportGedcomStampName("tree"));
      writeGedcomExport(c.model, dest);
      return send(res, 200, { ok: true, path: dest, relative: path.relative(personalRoot(), dest) });
    }

    if (p === "/api/export-share" && req.method === "POST") {
      // Works on any tree (samples included). Redaction is forced inside buildSharePack.
      const c = loadModel();
      if (!c.model) return send(res, 400, { error: c.error || "No model" });
      const s = settings();
      const destDir = path.join(shareDestRoot(s.treeId), shareStampName());
      const result = buildSharePack({
        model: c.model,
        confidence: c.confidence,
        media: c.media,
        links: readJson(LINKS_FILE, {}),
        census: allCensusChecklists(c.model),
        generations: c.gen,
        lines: c.line,
        homeId: c.homeId || s.homeId,
        treeId: s.treeId,
        version: c.version,
        destDir,
        shareUiDir: path.join(DIST, "share"),
      });
      lastSharePack = result.path;
      const relBase = s.treeId === "personal" ? personalRoot() : APP_ROOT;
      return send(res, 200, {
        ok: true,
        path: result.path,
        relative: path.relative(relBase, result.path),
        personCount: result.personCount,
        livingRedacted: result.livingRedacted,
      });
    }

    if (p === "/api/history") {
      if (settings().treeId !== "personal") return send(res, 200, { items: [], reason: "History is only on My tree (local)" });
      const dbPath = ensurePersonalStore();
      const db = openDb(dbPath);
      let items;
      try { items = listHistory(db); }
      finally { db.close(); }
      return send(res, 200, { items });
    }

    if (p === "/api/history-export" && req.method === "POST") {
      if (settings().treeId !== "personal") return send(res, 403, { error: "History export is only available on My tree (local)" });
      const c = loadModel();
      const dbPath = ensurePersonalStore();
      const db = openDb(dbPath);
      let items;
      try { items = listHistory(db); }
      finally { db.close(); }
      const entry = activeEntry();
      const result = exportHistoryLog({
        items,
        model: c.model,
        treeId: "personal",
        treeTitle: entry?.title || "My tree (local)",
        projectRoot: PROJECT_ROOT(),
        appRoot: APP_ROOT,
      });
      return send(res, 200, {
        ok: result.ok,
        count: result.count,
        path: result.path,
        relative: result.relative,
        error: result.error || "",
      });
    }

    if (p === "/api/files") {
      // list candidate project files (images/pdfs) for the link picker
      const q = (url.searchParams.get("q") || "").toLowerCase();
      const idx = ensureFileIndex();
      const items = idx.files.filter((f) => !q || f.full.toLowerCase().includes(q)).slice(0, 200).map((f) => ({ path: path.relative(PROJECT_ROOT(), f.full), name: f.name, kind: f.kind }));
      return send(res, 200, { count: items.length, items });
    }

    return send(res, 404, { error: "unknown api" });
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: e.message || String(e) });
  }
}

// ---------- share pack preview (localhost only, like everything else) ----------
let lastSharePack = "";
function serveShare(res, pathname) {
  let dir = lastSharePack && fs.existsSync(path.join(lastSharePack, "index.html")) ? lastSharePack : "";
  if (!dir) dir = latestSharePackDir();
  if (!dir) {
    return send(res, 404, "<h1>No share pack yet</h1><p>Open the app at <a href=\"/\">http://127.0.0.1:5180/</a> and click <b>Share view</b> to export one.</p>", MIME[".html"]);
  }
  let rel = decodeURIComponent(pathname).replace(/^\/share\/?/, "");
  if (!rel) rel = "index.html";
  const file = path.join(dir, rel);
  if (!inside(dir, file) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, { error: "Not found" });
  return sendFile(res, file);
}

// ---------- static ----------
function serveStatic(res, pathname) {
  if (pathname === "/") pathname = "/index.html";
  const rel = pathname.replace(/^\/+/, "");
  for (const root of [DIST, PUBLIC]) {
    const file = path.join(root, rel);
    if (inside(root, file) && fs.existsSync(file) && fs.statSync(file).isFile()) return sendFile(res, file);
  }
  const index = path.join(DIST, "index.html");
  if (fs.existsSync(index)) return sendFile(res, index);
  send(res, 503, "<h1>Family Tree Viewer</h1><p>dist/ is missing. Run <code>npm install && npm run build</code> in this folder.</p>", MIME[".html"]);
}

const server = http.createServer((req, res) => {
  let url;
  try { url = new URL(req.url || "/", `http://${HOST}:${PORT}`); } catch { return send(res, 400, { error: "bad url" }); }
  if (url.pathname.startsWith("/api/")) return handleApi(req, res, url);
  if (url.pathname === "/share") { res.writeHead(302, { location: "/share/" }); return res.end(); }
  if (url.pathname.startsWith("/share/")) return serveShare(res, url.pathname);
  return serveStatic(res, decodeURIComponent(url.pathname));
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") { console.log(`Port ${PORT} already in use (http://${HOST}:${PORT}/).`); process.exit(0); }
  console.error(err);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`Family Tree Viewer → http://${HOST}:${PORT}/`);
  loadModel();
  watchGramps();
  if (hasPersonalDb()) backupPersonalDb();
});
