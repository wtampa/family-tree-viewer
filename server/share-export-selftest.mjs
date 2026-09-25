/**
 * Share pack selftest: living redaction is forced, no living names leak into
 * tree.json or media filenames, packs stay in allowed folders, no data.gramps written.
 * Fixture people are inventions (Ada de la Cruz + a living "Pat") — never real relatives.
 */
import fs from "node:fs";
import path from "node:path";
import { parseGrampsXml } from "./gramps-parse.mjs";
import { computeConfidence } from "./confidence.mjs";
import { TreeModel } from "../src/lib/model.js";
import { buildSharePack, assertSafeShareDir, shareCacheRoot } from "./share-export.mjs";

const FIXTURE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE database PUBLIC "-//Gramps//DTD Gramps XML 1.7.2//EN"
"http://gramps-project.org/xml/1.7.2/grampsxml.dtd">
<database xmlns="http://gramps-project.org/xml/1.7.2/">
  <header>
    <created date="2026-01-01" version="6.0.0"/>
    <researcher><resname>Test</resname></researcher>
  </header>
  <events>
    <event handle="_e1" change="1" id="E0001"><type>Birth</type><dateval val="1840-02-14"/></event>
    <event handle="_e2" change="1" id="E0002"><type>Death</type><dateval val="1900-01-01"/></event>
    <event handle="_e3" change="1" id="E0003"><type>Marriage</type><dateval val="1862-06-01"/></event>
    <event handle="_e4" change="1" id="E0004"><type>Death</type><dateval val="1910-03-03"/></event>
    <event handle="_e5" change="1" id="E0005"><type>Birth</type><dateval val="1990-05-05"/></event>
  </events>
  <people>
    <person handle="_i1" change="1" id="I0001">
      <gender>F</gender>
      <name type="Birth Name"><first>Ada</first><surname prefix="de la" prim="1">Cruz</surname></name>
      <eventref hlink="_e1" role="Primary"/>
      <eventref hlink="_e2" role="Primary"/>
      <objref hlink="_o1"/>
      <parentin hlink="_f1"/>
    </person>
    <person handle="_i2" change="1" id="I0002">
      <gender>M</gender>
      <name type="Birth Name"><first>Luis</first><surname>Cruz</surname></name>
      <eventref hlink="_e4" role="Primary"/>
      <parentin hlink="_f1"/>
    </person>
    <person handle="_i3" change="1" id="I0003">
      <gender>F</gender>
      <name type="Birth Name"><first>Pat</first><surname>Cruz</surname></name>
      <eventref hlink="_e5" role="Primary"/>
      <objref hlink="_o2"/>
      <childof hlink="_f1"/>
    </person>
  </people>
  <families>
    <family handle="_f1" change="1" id="F0001">
      <rel type="Married"/>
      <father hlink="_i2"/>
      <mother hlink="_i1"/>
      <eventref hlink="_e3" role="Family"/>
      <childref hlink="_i3"/>
    </family>
  </families>
  <objects>
    <object handle="_o1" change="1" id="O0001">
      <file src="ada-portrait.png" mime="image/png" description="Ada portrait"/>
    </object>
    <object handle="_o2" change="1" id="O0002">
      <file src="pat-cruz.png" mime="image/png" description="Pat portrait"/>
    </object>
  </objects>
  <repositories>
    <repository handle="_r1" change="1" id="R0001">
      <rname>Local scans folder</rname>
      <url href="D:\\Research\\sources" type="Web Home"/>
    </repository>
  </repositories>
</database>
`;

const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function walkFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walkFiles(full));
    else out.push(full);
  }
  return out;
}

export function selftestShareExport() {
  let tests = 0;
  const t = (cond, msg) => { assert(cond, msg); tests++; };

  const model = parseGrampsXml(FIXTURE_XML, { file: "share-fixture" });
  const confidence = computeConfidence(model);
  t(confidence.I0003?.living, "fixture: Pat must look living");
  t(!confidence.I0001?.living, "fixture: Ada must look deceased");

  // Source images in a temp folder under .cache (gitignored).
  const srcDir = path.join(shareCacheRoot(), `_selftest-src-${process.pid}`);
  fs.mkdirSync(srcDir, { recursive: true });
  const adaImg = path.join(srcDir, "ada-portrait.png");
  const patImg = path.join(srcDir, "pat-cruz.png");
  fs.writeFileSync(adaImg, PNG_1PX);
  fs.writeFileSync(patImg, PNG_1PX);
  const media = {
    O0001: { path: adaImg, kind: "image", how: "src" },
    O0002: { path: patImg, kind: "image", how: "src" },
  };

  const destDir = path.join(shareCacheRoot(), `share-selftest-${process.pid}-${Date.now()}`);
  try {
    // Path guard: outside the allowed roots must throw.
    let threw = false;
    try { assertSafeShareDir(path.join(shareCacheRoot(), "..", "..", "src", "share-evil")); } catch { threw = true; }
    t(threw, "assertSafeShareDir must reject paths outside data/exports and .cache/share");

    const result = buildSharePack({
      model,
      confidence,
      media,
      links: { I0001: [{ label: "Ada census", url: "https://example.com/ada", kind: "url" }, { label: "local scan", path: "sources/ada.png", kind: "file" }], I0003: [{ label: "Pat page", url: "https://example.com/pat", kind: "url" }] },
      census: {},
      generations: {},
      lines: {},
      homeId: "I0001",
      treeId: "selftest",
      version: 1,
      destDir,
      // no shareUiDir: the data half is testable without a Vite build
    });

    t(result.path.toLowerCase().startsWith(path.resolve(shareCacheRoot()).toLowerCase()), "pack dir must be under .cache/share");
    t(result.livingRedacted === 1, `livingRedacted should be 1, got ${result.livingRedacted}`);
    t(result.personCount === 3, `personCount should be 3, got ${result.personCount}`);

    const jsonText = fs.readFileSync(path.join(destDir, "tree.json"), "utf8");
    const payload = JSON.parse(jsonText);
    const tm = new TreeModel(payload);
    t(tm.person("I0001")?.name.includes("Ada"), "dead Ada keeps her name");
    t(tm.person("I0003")?.name === "Living" && tm.person("I0003")?.privateLiving, "living person renders as Living");
    t(!/\bPat\b/i.test(jsonText), "living given name must not appear in tree.json");
    t(!/[A-Z]:\\\\/.test(jsonText), "no local drive paths in tree.json (repositories stripped)");
    t(payload.settings.editable === false, "settings.editable must be false");
    t(payload.settings.canUndo === false, "settings.canUndo must be false");
    t(payload.settings.hideLiving === true, "settings.hideLiving must be true");
    t(!("projectRoot" in payload.settings) && !("grampsFile" in payload.settings) && !("store" in payload.settings), "no projectRoot/grampsFile/store in settings");
    t(!("hintBadge" in payload), "no hintBadge in pack payload");
    t(!payload.model.meta?.file, "no local file path in model.meta");
    t(payload.model.families.F0001.children.some((c) => c.id === "I0003"), "living slot stays in the family (holes stay filled)");

    // Media: Ada's portrait only, relative url, file exists, no living name in filenames.
    const mediaIds = Object.keys(payload.mediaResolved);
    t(mediaIds.length === 1 && mediaIds[0] === "O0001", `only Ada's portrait should survive, got ${mediaIds.join(",")}`);
    for (const m of Object.values(payload.mediaResolved)) {
      t(/^media\//.test(m.url), `media url must be relative: ${m.url}`);
      t(fs.existsSync(path.join(destDir, m.url)), `media file must exist: ${m.url}`);
    }
    const packFiles = walkFiles(destDir).map((f) => path.basename(f));
    t(!packFiles.some((f) => /\bpat\b/i.test(f)), "no living given name in copied filenames");
    t(!packFiles.some((f) => /\.gramps$|\.ged(com)?$/i.test(f) || f.toLowerCase() === "data.gramps"), "no gramps/gedcom file written into the pack");

    // Links: living dropped, local paths dropped, http kept.
    t(!payload.links.I0003, "living person's links must be dropped");
    t(payload.links.I0001?.length === 1 && payload.links.I0001[0].url === "https://example.com/ada", "only http(s) links travel");

    // share-meta.json has counts, no names.
    const meta = JSON.parse(fs.readFileSync(path.join(destDir, "share-meta.json"), "utf8"));
    t(meta.personCount === 3 && meta.livingRedacted === 1, "share-meta counts");
    const metaText = JSON.stringify(meta);
    t(!/Ada|Pat|Luis|I0001|I0003/.test(metaText), "share-meta must not contain names or person ids");

    // Never overwrite an existing pack.
    let threw2 = false;
    try { assertSafeShareDir(destDir); } catch { threw2 = true; }
    t(threw2, "assertSafeShareDir must refuse an existing folder");
  } finally {
    fs.rmSync(destDir, { recursive: true, force: true });
    fs.rmSync(srcDir, { recursive: true, force: true });
  }

  return { tests };
}
