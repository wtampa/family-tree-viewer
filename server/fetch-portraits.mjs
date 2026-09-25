#!/usr/bin/env node
/**
 * Download character portraits into sample/<tree>/media/ from portraits.json.
 * Images stay gitignored. Safe to re-run; existing files are skipped.
 *
 *   npm run fetch-portraits
 *   npm run fetch-portraits -- ducktales
 *   npm run fetch-portraits -- --check ducktales
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SAMPLE = path.join(APP, "sample");
const UA = "FamilyTreeViewer/1.0 (localhost genealogy demo; portrait fetch; +https://github.com/wtampa/family-tree-viewer)";
const GAP_MS = 300;

const TREES = [
  { id: "simpsons", dir: "simpsons" },
  { id: "ducktales", dir: "ducktales" },
  { id: "harry-potter", dir: "harry-potter" },
  { id: "asoiaf-kings", dir: "asoiaf" },
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function loadManifest(dir) {
  const file = path.join(SAMPLE, dir, "portraits.json");
  if (!fs.existsSync(file)) throw new Error(`missing ${path.relative(APP, file)}`);
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const portraits = Array.isArray(data) ? data : data.portraits || [];
  return { file, portraits, api: data.api || "" };
}

async function mediawikiUrl(api, title) {
  const u = new URL(api);
  const name = title.startsWith("File:") ? title : `File:${title}`;
  u.searchParams.set("action", "query");
  u.searchParams.set("titles", name);
  u.searchParams.set("prop", "imageinfo");
  u.searchParams.set("iiprop", "url");
  u.searchParams.set("format", "json");
  u.searchParams.set("redirects", "1");
  const res = await fetch(u, { headers: { "User-Agent": UA, Accept: "application/json" }, redirect: "follow" });
  if (!res.ok) throw new Error(`${u.origin} → ${res.status}`);
  const data = await res.json();
  const pages = Object.values(data?.query?.pages || {});
  const info = pages[0]?.imageinfo?.[0];
  if (!info?.url) throw new Error(`no imageinfo for ${name}`);
  return info.url;
}

async function resolveEntry(entry, fallbackApi) {
  const api = entry.api || fallbackApi;
  const title = entry.title || entry.fileTitle || "";
  if (api && title) {
    try { return await mediawikiUrl(api, title); } catch (e) {
      if (!entry.url) throw e;
    }
  }
  if (entry.url) return entry.url;
  throw new Error("no title or url");
}

async function downloadTo(url, dest) {
  const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow" });
  if (!res.ok) throw new Error(`${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 200) throw new Error(`tiny file (${buf.length} bytes)`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.part`;
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, dest);
  return buf.length;
}

async function runTree(spec, { check }) {
  const { portraits, api } = loadManifest(spec.dir);
  const media = path.join(SAMPLE, spec.dir, "media");
  let ok = 0;
  let skipped = 0;
  let failed = 0;
  console.log(`${spec.id}: ${portraits.length} portraits${check ? " (check)" : ""}`);
  for (const entry of portraits) {
    const name = entry.file || `${entry.id}.png`;
    const dest = path.join(media, name);
    const label = entry.id || name;
    if (!check && fs.existsSync(dest) && fs.statSync(dest).size > 200) {
      skipped++;
      continue;
    }
    try {
      const url = await resolveEntry(entry, api);
      if (check) {
        const res = await fetch(url, { method: "HEAD", headers: { "User-Agent": UA }, redirect: "follow" });
        if (!res.ok) throw new Error(`HEAD ${res.status}`);
        ok++;
      } else {
        const n = await downloadTo(url, dest);
        console.log(`  ${label} ${(n / 1024).toFixed(0)} KB`);
        ok++;
      }
    } catch (e) {
      failed++;
      console.error(`  FAIL ${label}: ${e.message}`);
    }
    await sleep(GAP_MS);
  }
  console.log(`  ok ${ok}  skipped ${skipped}  failed ${failed}`);
  return failed;
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const check = args.includes("--check");
  const want = args.filter((a) => !a.startsWith("--"));
  const trees = want.length ? TREES.filter((t) => want.includes(t.id) || want.includes(t.dir)) : TREES;
  if (!trees.length) {
    console.error("unknown tree. Use: " + TREES.map((t) => t.id).join(", "));
    process.exit(1);
  }
  let failed = 0;
  for (const t of trees) failed += await runTree(t, { check });
  if (failed) process.exit(1);
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
