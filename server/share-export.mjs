/**
 * Share pack export — a frozen, living-redacted static folder (tree.json + media + lite viewer).
 * Redaction is ALWAYS forced on, regardless of the desktop hide-living setting.
 * Packs are written only under {personalRoot}/data/exports/ or {APP_ROOT}/.cache/share/.
 * Never writes data.gramps. Never overwrites an existing pack.
 */
import fs from "node:fs";
import path from "node:path";
import { redactModel, redactMediaResolved, redactCensus, redactLinks, mediaTouchesLiving } from "./privacy.mjs";
import { APP_ROOT, personalRoot } from "./trees.mjs";
import { personalExportDir } from "./db.mjs";

const SHARE_IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

export function shareCacheRoot() {
  return path.join(APP_ROOT, ".cache", "share");
}

/** Where packs land: personal tree → research exports folder; samples → app cache. */
export function shareDestRoot(treeId) {
  if (treeId === "personal" && personalRoot() !== APP_ROOT) return personalExportDir(personalRoot());
  return shareCacheRoot();
}

export function shareStampName(prefix = "share") {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${prefix}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** Pack dirs may only live under data/exports or .cache/share, must be named share-*, and must be new. */
export function assertSafeShareDir(destDir) {
  const f = path.resolve(destDir);
  const allowed = [shareCacheRoot(), personalExportDir(personalRoot())].map((r) => path.resolve(r));
  const ok = allowed.some((r) => f.toLowerCase().startsWith((r + path.sep).toLowerCase()));
  if (!ok) throw new Error("share pack must be under data/exports/ or .cache/share/");
  if (!/^share-/.test(path.basename(f))) throw new Error("share pack folder must be named share-*");
  if (fs.existsSync(f)) throw new Error("refusing to overwrite an existing share pack");
  return f;
}

function safeMediaName(base, taken) {
  let name = String(base || "media").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  if (!name || name.startsWith(".")) name = `media_${name}`;
  let out = name;
  let n = 1;
  while (taken.has(out.toLowerCase())) {
    const ext = path.extname(name);
    out = `${path.basename(name, ext)}-${n}${ext}`;
    n += 1;
  }
  taken.add(out.toLowerCase());
  return out;
}

function nameAppears(names, text) {
  const t = String(text || "");
  return names.some((n) => {
    const re = new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    return re.test(t);
  });
}

function copyDirInto(srcDir, destDir, { renameIndex = false } = {}) {
  let copied = 0;
  const walk = (src, dest) => {
    fs.mkdirSync(dest, { recursive: true });
    for (const e of fs.readdirSync(src, { withFileTypes: true })) {
      const from = path.join(src, e.name);
      let toName = e.name;
      if (renameIndex && !e.isDirectory() && e.name.toLowerCase() === "share.html") toName = "index.html";
      const to = path.join(dest, toName);
      if (e.isDirectory()) walk(from, to);
      else { fs.copyFileSync(from, to); copied += 1; }
    }
  };
  walk(srcDir, destDir);
  return copied;
}

/**
 * Build a share pack. Redaction is forced on — the caller cannot opt out.
 * @param {object} args
 * @param {object} args.model        parsed tree model (never mutated)
 * @param {object} args.confidence   computeConfidence(model)
 * @param {object} args.media        resolved media map { id: { path, kind } } (server cache shape)
 * @param {object} args.links        links.json content ({} if none)
 * @param {object} args.census       census checklists ({} if none)
 * @param {object} args.generations  ancestor generations map ({} ok)
 * @param {object} args.lines        ancestral line map ({} ok)
 * @param {string} args.homeId
 * @param {string} args.treeId
 * @param {number} args.version
 * @param {string} args.destDir      new share-* folder (validated)
 * @param {string} [args.shareUiDir] built lite viewer (dist/share); omit to skip the UI copy (selftest)
 */
export function buildSharePack({ model, confidence, media, links, census, generations, lines, homeId, treeId, version, destDir, shareUiDir }) {
  const dest = assertSafeShareDir(destDir);
  if (shareUiDir) {
    if (!fs.existsSync(path.join(shareUiDir, "share.html")) && !fs.existsSync(path.join(shareUiDir, "index.html"))) {
      throw new Error("Share viewer build missing — run npm run build first");
    }
  }

  // Forced living redaction (same sequence as the desktop hide-living view).
  const red = redactModel(model, confidence);
  const living = red.living;
  // Scrub list: full names plus given names of living people (catches "pat-cruz.png" filenames).
  // Surnames are shared with deceased relatives, so they stay.
  const livingNames = [...new Set([
    ...red.names,
    ...[...living].map((id) => model.people[id]?.first).filter((n) => n && n.length > 2),
  ])].sort((a, b) => b.length - a.length);

  // Media: dead people's allowlisted images only, copied with scrubbed relative names.
  const rawResolved = {};
  const localPath = {};
  for (const [id, m] of Object.entries(media || {})) {
    if (!m?.path || m.kind !== "image") continue;
    if (!SHARE_IMAGE_EXT.has(path.extname(m.path).toLowerCase())) continue;
    rawResolved[id] = { url: "", kind: "image", how: m.how || "" };
    localPath[id] = m.path;
  }
  const { mediaResolved: keptResolved } = redactMediaResolved(rawResolved, model, living);

  fs.mkdirSync(dest, { recursive: true });
  const mediaDir = path.join(dest, "media");
  const taken = new Set();
  const mediaResolved = {};
  let mediaCopied = 0;
  for (const [id, m] of Object.entries(keptResolved)) {
    const src = localPath[id];
    if (!src || !fs.existsSync(src)) continue;
    if (mediaTouchesLiving(model, confidence, id)) continue;
    const base = path.basename(src);
    if (nameAppears(livingNames, base)) continue; // never ship a living name in a filename
    const name = safeMediaName(base, taken);
    fs.mkdirSync(mediaDir, { recursive: true });
    fs.copyFileSync(src, path.join(mediaDir, name));
    mediaResolved[id] = { url: `media/${name}`, kind: "image", how: m.how || "" };
    mediaCopied += 1;
  }

  // Links: redact living, then keep only http(s) URLs (local file paths never travel).
  const redLinks = redactLinks(links || {}, living);
  const packLinks = {};
  for (const [pid, rows] of Object.entries(redLinks)) {
    const keep = (rows || [])
      .filter((r) => /^https?:\/\//i.test(r?.url || ""))
      .map((r) => ({ label: r.label || "", url: r.url, kind: r.kind || "" }));
    if (keep.length) packLinks[pid] = keep;
  }

  // Model: strip server-side metadata (paths, store) down to counts.
  // Media objects keep local src paths and may name living people in descriptions —
  // rebuild the dictionary with only the entries that survived redaction, paths stripped.
  const packMedia = {};
  for (const id of Object.keys(mediaResolved)) {
    const m = red.model.media?.[id];
    if (!m) continue;
    let description = String(m.description || "");
    for (const n of livingNames) {
      description = description.replace(new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "Living");
    }
    packMedia[id] = { id: m.id, handle: m.handle, description, date: m.date || null, citations: m.citations || [], notes: [], attributes: [], tags: [] };
  }
  // Repositories can point at local folders and the lite viewer never reads them.
  const packModel = { ...red.model, media: packMedia, repositories: {}, meta: { counts: model.meta?.counts || {} } };
  delete packModel.handleToId;

  const payload = {
    version: version || Date.now(),
    settings: {
      homeId: homeId || "",
      treeId: treeId || "",
      hideLiving: true,
      livingCount: living.size,
      editable: false,
      canUndo: false,
    },
    model: packModel,
    confidence: confidence || {},
    mediaResolved,
    generations: generations || {},
    lines: lines || {},
    links: packLinks,
    census: redactCensus(census || {}, living),
  };
  fs.writeFileSync(path.join(dest, "tree.json"), JSON.stringify(payload));

  const personCount = Object.keys(model.people || {}).length;
  fs.writeFileSync(path.join(dest, "share-meta.json"), JSON.stringify({
    treeId: treeId || "",
    exportedAt: new Date().toISOString(),
    personCount,
    livingRedacted: living.size,
  }, null, 2));

  let uiCopied = false;
  if (shareUiDir) {
    copyDirInto(shareUiDir, dest, { renameIndex: true });
    uiCopied = fs.existsSync(path.join(dest, "index.html"));
  }

  return { path: dest, personCount, livingRedacted: living.size, mediaCopied, uiCopied };
}

/** Newest pack folder that has an index.html, across both allowed roots. */
export function latestSharePackDir() {
  let best = "";
  let bestM = 0;
  for (const root of [shareCacheRoot(), personalExportDir(personalRoot())]) {
    let entries = [];
    try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (!e.isDirectory() || !e.name.startsWith("share-")) continue;
      const dir = path.join(root, e.name);
      if (!fs.existsSync(path.join(dir, "index.html"))) continue;
      let m = 0;
      try { m = fs.statSync(dir).mtimeMs; } catch { continue; }
      if (m > bestM) { bestM = m; best = dir; }
    }
  }
  return best;
}
