/**
 * Resolve Gramps media objects whose file paths are broken (src=".")
 * by matching the media description to real files under the project.
 */
import fs from "node:fs";
import path from "node:path";

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tif", ".tiff"]);
const DOC_EXT = new Set([".pdf"]);
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", ".cache", "__pycache__", "_html", "ocr_cache", "tree-app"]);

const norm = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\.(jpe?g|png|gif|webp|bmp|tiff?|pdf)$/i, "").replace(/[^a-z0-9]+/g, " ").trim();

export function buildFileIndex(roots, { maxFiles = 40000 } = {}) {
  const files = [];
  const walk = (dir, depth) => {
    if (files.length >= maxFiles || depth > 8) return;
    let ents = [];
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        walk(path.join(dir, e.name), depth + 1);
      } else {
        const ext = path.extname(e.name).toLowerCase();
        if (IMAGE_EXT.has(ext) || DOC_EXT.has(ext)) {
          const full = path.join(dir, e.name);
          files.push({ full, name: e.name, key: norm(e.name), ext, kind: IMAGE_EXT.has(ext) ? "image" : "pdf" });
        }
      }
    }
  };
  for (const r of roots) if (fs.existsSync(r)) walk(r, 0);
  const byKey = new Map();
  for (const f of files) {
    if (!byKey.has(f.key)) byKey.set(f.key, []);
    byKey.get(f.key).push(f);
  }
  return { files, byKey };
}

/** Prefer portraits folders, then sources, then 00_Data_In; prefer non-"copy" variants only if exact. */
function rank(f, preferRoots) {
  let r = 0;
  const low = f.full.toLowerCase();
  preferRoots.forEach((root, i) => { if (low.startsWith(root.toLowerCase())) r += (preferRoots.length - i) * 10; });
  if (/portrait/.test(low)) r += 5;
  return r;
}

export function resolveMedia(model, index, { overrides = {}, preferRoots = [], projectRoot = "", treeDir = "" } = {}) {
  const out = {};
  for (const m of Object.values(model.media)) {
    const ov = overrides[m.id] || overrides[m.handle];
    if (ov) {
      const full = path.isAbsolute(ov) ? ov : path.join(projectRoot, ov);
      if (fs.existsSync(full)) { out[m.id] = { path: full, how: "override", kind: IMAGE_EXT.has(path.extname(full).toLowerCase()) ? "image" : "pdf" }; continue; }
    }
    // 1. Real src path present? Try tree folder first (sample/queen/media/…).
    if (m.src && m.src !== "." && m.src !== "") {
      const cands = [];
      if (path.isAbsolute(m.src)) cands.push(m.src);
      if (treeDir) {
        cands.push(path.join(treeDir, m.src));
        cands.push(path.join(treeDir, "media", path.basename(m.src)));
        cands.push(path.join(treeDir, path.basename(m.src)));
      }
      if (projectRoot) cands.push(path.join(projectRoot, m.src));
      const hit = cands.find((c) => c && fs.existsSync(c));
      if (hit) { out[m.id] = { path: hit, how: "src", kind: IMAGE_EXT.has(path.extname(hit).toLowerCase()) ? "image" : "pdf" }; continue; }
    }
    // 2. Exact description match on filename stem
    const key = norm(m.description);
    if (!key) continue;
    let hits = index.byKey.get(key) || [];
    // 3. Stem without trailing " copy" / " edit" variants
    if (!hits.length) {
      const stripped = key.replace(/\b(copy|edit|final|scan)\b/g, "").replace(/\s+/g, " ").trim();
      for (const [k, arr] of index.byKey) {
        const ks = k.replace(/\b(copy|edit|final|scan)\b/g, "").replace(/\s+/g, " ").trim();
        if (ks && ks === stripped) hits = hits.concat(arr);
      }
    }
    // 4. Contains match (both directions) for long keys
    if (!hits.length && key.length >= 10) {
      for (const [k, arr] of index.byKey) if (k.includes(key) || key.includes(k) && k.length >= 10) hits = hits.concat(arr);
    }
    if (!hits.length) continue;
    hits.sort((a, b) => rank(b, preferRoots) - rank(a, preferRoots));
    out[m.id] = { path: hits[0].full, how: hits[0].key === key ? "exact" : "fuzzy", kind: hits[0].kind, alternates: hits.slice(1, 4).map((h) => h.full) };
  }
  return out;
}
