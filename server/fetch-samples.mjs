#!/usr/bin/env node
/**
 * Download public demo trees into sample/. Safe to re-run.
 * Queen media is optional but included so Hive portraits work.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SAMPLE = path.join(APP, "sample");

const FILES = [
  {
    dest: "presidents/US_Presidents_2022-11-02.gramps",
    url: "https://raw.githubusercontent.com/emyoulation/example-Gramps-Trees/main/US_Presidents_2022-11-02.gramps",
  },
  {
    dest: "ingalls/1880_Ingalls_Family_2024-01-10.gramps",
    url: "https://raw.githubusercontent.com/emyoulation/example-Gramps-Trees/main/1880_Ingalls_Family_2024-01-10.gramps",
  },
  {
    dest: "royal92/royal92.ged",
    url: "https://raw.githubusercontent.com/emyoulation/example-Gramps-Trees/main/royal92.ged",
  },
  {
    dest: "asoiaf/Kings-GenoPro.ged",
    url: "https://familytrees.genopro.com/AngelEyes/KINGS/FamilyTree.ged",
  },
];

const QUEEN_ZIP = "https://github.com/DavidMStraub/gramps-web-example-tree-queen/archive/refs/heads/main.zip";

async function download(url, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.part`;
  process.stdout.write(`  ${path.relative(SAMPLE, dest)} … `);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, dest);
  console.log(`${(buf.length / 1024).toFixed(0)} KB`);
}

function extractQueen(zipPath) {
  const out = path.join(SAMPLE, "_queen_unpack");
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const r = spawnSync("tar", ["-xf", zipPath, "-C", out], { stdio: "inherit" });
  if (r.status !== 0) throw new Error("tar extract failed — is tar on PATH?");
  const root = fs.readdirSync(out).map((n) => path.join(out, n)).find((p) => fs.statSync(p).isDirectory());
  if (!root) throw new Error("queen zip had no folder");
  const dest = path.join(SAMPLE, "queen");
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  const gramps = path.join(root, "queen.gramps");
  if (!fs.existsSync(gramps)) throw new Error("queen.gramps missing from zip");
  fs.copyFileSync(gramps, path.join(dest, "queen.gramps"));
  const mediaSrc = path.join(root, "media");
  const mediaDst = path.join(dest, "media");
  if (fs.existsSync(mediaSrc)) {
    fs.mkdirSync(mediaDst, { recursive: true });
    for (const name of fs.readdirSync(mediaSrc)) {
      fs.copyFileSync(path.join(mediaSrc, name), path.join(mediaDst, name));
    }
  }
  const license = path.join(root, "LICENSE");
  const readme = path.join(root, "README.md");
  if (fs.existsSync(license)) fs.copyFileSync(license, path.join(dest, "LICENSE"));
  if (fs.existsSync(readme)) fs.copyFileSync(readme, path.join(dest, "UPSTREAM.md"));
  fs.rmSync(out, { recursive: true, force: true });
  fs.rmSync(zipPath, { force: true });
  const n = fs.existsSync(mediaDst) ? fs.readdirSync(mediaDst).length : 0;
  console.log(`  queen/queen.gramps + ${n} media files`);
}

async function main() {
  fs.mkdirSync(SAMPLE, { recursive: true });
  console.log("Fetching sample trees into", SAMPLE);
  for (const f of FILES) {
    const dest = path.join(SAMPLE, f.dest);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 100) {
      console.log(`  ${f.dest} (cached)`);
      continue;
    }
    await download(f.url, dest);
  }
  const queenFile = path.join(SAMPLE, "queen", "queen.gramps");
  if (fs.existsSync(queenFile) && fs.statSync(queenFile).size > 1000) {
    console.log("  queen/queen.gramps (cached)");
  } else {
    const zip = path.join(SAMPLE, "queen-main.zip");
    await download(QUEEN_ZIP, zip);
    extractQueen(zip);
  }
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
