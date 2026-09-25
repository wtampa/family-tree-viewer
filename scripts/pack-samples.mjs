#!/usr/bin/env node
/**
 * Build GitHub Release zips for the fan-tree GEDCOMs.
 * No images. Output: .cache/release/<id>.zip
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(APP, ".cache", "release");

const PACKS = [
  {
    id: "simpsons",
    dir: "simpsons",
    ged: "Simpsons.ged",
    readme: `The Simpsons — demo GEDCOM
Names and relationships are from the published series. This is not a Fox product.
Character portraits are not in this zip. After unpacking, run: npm run fetch-portraits -- simpsons
That downloads images from the URLs in portraits.json onto your machine.
`,
  },
  {
    id: "ducktales",
    dir: "ducktales",
    ged: "DuckTales.ged",
    readme: `Duck family (DuckTales) — demo GEDCOM
Names and relationships follow Don Rosa's published US Duck Family Tree (1995) and episode guides. This is not a Disney product.
Character portraits are not in this zip. Run: npm run fetch-portraits -- ducktales
`,
  },
  {
    id: "harry-potter",
    dir: "harry-potter",
    ged: "HarryPotter.ged",
    readme: `Harry Potter family — demo GEDCOM
Names and relationships are from the published books. This is not a Warner Bros. product.
The file is a 2007 Family Tree Maker export used here as a demo. Character portraits are not in this zip.
Run: npm run fetch-portraits -- harry-potter
`,
  },
];

fs.mkdirSync(OUT, { recursive: true });
const stageRoot = path.join(APP, ".cache", "release-stage");
fs.rmSync(stageRoot, { recursive: true, force: true });

for (const pack of PACKS) {
  const srcDir = path.join(APP, "sample", pack.dir);
  const ged = path.join(srcDir, pack.ged);
  const manifest = path.join(srcDir, "portraits.json");
  if (!fs.existsSync(ged)) throw new Error(`missing ${ged}`);
  if (!fs.existsSync(manifest)) throw new Error(`missing ${manifest}`);
  const stage = path.join(stageRoot, pack.dir);
  fs.mkdirSync(stage, { recursive: true });
  fs.copyFileSync(ged, path.join(stage, pack.ged));
  fs.copyFileSync(manifest, path.join(stage, "portraits.json"));
  fs.writeFileSync(path.join(stage, "README.txt"), pack.readme);
  const zip = path.join(OUT, `${pack.id}.zip`);
  fs.rmSync(zip, { force: true });
  const r = spawnSync("tar", ["-a", "-c", "-f", zip, "-C", stageRoot, pack.dir], { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`tar failed for ${pack.id}`);
  const kb = (fs.statSync(zip).size / 1024).toFixed(0);
  console.log(`${pack.id}.zip ${kb} KB`);
}
fs.rmSync(stageRoot, { recursive: true, force: true });
console.log("wrote", OUT);
