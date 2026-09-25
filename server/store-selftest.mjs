/**
 * SQLite import → export → re-parse, plus core edit/undo.
 * Never writes data.gramps. Temp files live under .cache/.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseGrampsXml, loadGramps } from "./gramps-parse.mjs";
import { applyEdit, changeCount, importModel, listHistory, loadModelFromDb, openDb, rotateBackups, undoLast } from "./db.mjs";
import { dispatchEdit } from "./edit.mjs";
import { assertSafeExportPath, modelToGrampsXml, writeGrampsExport } from "./gramps-export.mjs";
import { writeGedcomExport } from "./gedcom-export.mjs";
import { parseGedcom } from "./gedcom-parse.mjs";
import { hasPersonalTree, loadTreeFile, personalFile } from "./trees.mjs";
import { assertInside, destRelative, ingestFile, parseIngestBody, personFileSlug } from "./media-ingest.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const FIXTURE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE database PUBLIC "-//Gramps//DTD Gramps XML 1.7.2//EN"
"http://gramps-project.org/xml/1.7.2/grampsxml.dtd">
<database xmlns="http://gramps-project.org/xml/1.7.2/">
  <header>
    <created date="2026-01-01" version="6.0.0"/>
    <researcher><resname>Test</resname></researcher>
  </header>
  <events>
    <event handle="_e1" change="1" id="E0001">
      <type>Birth</type>
      <dateval val="1840-02-14" type="about"/>
      <place hlink="_p1"/>
    </event>
    <event handle="_e2" change="1" id="E0002">
      <type>Death</type>
      <daterange start="1900" stop="1902"/>
    </event>
    <event handle="_e3" change="1" id="E0003">
      <type>Marriage</type>
      <dateval val="1862-06-01"/>
    </event>
  </events>
  <people>
    <person handle="_i1" change="1" id="I0001">
      <gender>F</gender>
      <name type="Birth Name">
        <first>Ada</first>
        <surname prefix="de la" prim="1">Cruz</surname>
      </name>
      <name type="Also Known As" alt="1">
        <first>Addie</first>
        <surname>Cruz</surname>
      </name>
      <eventref hlink="_e1" role="Primary"/>
      <eventref hlink="_e2" role="Primary"/>
      <citationref hlink="_c1"/>
      <noteref hlink="_n1"/>
      <parentin hlink="_f1"/>
    </person>
    <person handle="_i2" change="1" id="I0002">
      <gender>M</gender>
      <name type="Birth Name">
        <first>Luis</first>
        <surname>Cruz</surname>
      </name>
      <parentin hlink="_f1"/>
    </person>
  </people>
  <families>
    <family handle="_f1" change="1" id="F0001">
      <rel type="Married"/>
      <father hlink="_i2"/>
      <mother hlink="_i1"/>
      <eventref hlink="_e3" role="Family"/>
    </family>
  </families>
  <citations>
    <citation handle="_c1" change="1" id="C0001">
      <page>p. 12</page>
      <confidence>3</confidence>
      <sourceref hlink="_s1"/>
    </citation>
  </citations>
  <sources>
    <source handle="_s1" change="1" id="S0001">
      <stitle>Tampa census 1850</stitle>
      <sauthor>US Census Bureau</sauthor>
      <spubinfo>1850</spubinfo>
    </source>
  </sources>
  <places>
    <placeobj handle="_p1" change="1" id="P0001" type="City">
      <ptitle>Tampa, Florida</ptitle>
      <pname value="Tampa"/>
      <coord lat="27.95" long="-82.46"/>
    </placeobj>
  </places>
  <notes>
    <note handle="_n1" change="1" id="N0001" type="Person Note">
      <text>Research note. See https://example.com/ada</text>
    </note>
  </notes>
</database>
`;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function coreSlice(model) {
  const out = {
    people: {},
    families: {},
    events: {},
    places: {},
    citations: {},
    sources: {},
    notes: {},
    media: {},
    repositories: {},
    tags: {},
  };
  const drop = {
    person: ["eventsBack"],
    event: ["people", "families"],
    citation: ["usedBy"],
    source: ["citationCount"],
    note: ["urls"],
  };
  const kinds = [
    ["people", "person"], ["families", "family"], ["events", "event"],
    ["places", "place"], ["citations", "citation"], ["sources", "source"],
    ["notes", "note"], ["media", "media"], ["repositories", "repository"], ["tags", "tag"],
  ];
  for (const [table, kind] of kinds) {
    for (const [id, obj] of Object.entries(model[table] || {})) {
      const copy = { ...obj };
      for (const k of drop[kind] || []) delete copy[k];
      out[table][id] = copy;
    }
  }
  return out;
}

function firstDiff(a, b, path = "") {
  if (Object.is(a, b)) return null;
  if (a == null && b == null) return null;
  if (typeof a !== typeof b) return path || "/";
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return path || "/";
    for (let i = 0; i < a.length; i++) {
      const d = firstDiff(a[i], b[i], `${path}[${i}]`);
      if (d) return d;
    }
    return null;
  }
  if (a && b && typeof a === "object") {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      const d = firstDiff(a[k], b[k], path ? `${path}.${k}` : k);
      if (d) return d;
    }
    return null;
  }
  return path || "/";
}

function roundTrip(label, xmlOrModel, { values = false } = {}) {
  const parsed = typeof xmlOrModel === "string" ? parseGrampsXml(xmlOrModel, { file: label }) : xmlOrModel;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ftv-store-"));
  const dbPath = path.join(dir, "tree.db");
  const db = openDb(dbPath);
  try {
    importModel(db, parsed, { source: label });
    const loaded = loadModelFromDb(db);
    const d1 = firstDiff(coreSlice(parsed), coreSlice(loaded));
    assert(!d1, `${label}: sqlite load drifted at ${d1}`);
    const xml = modelToGrampsXml(loaded);
    const again = parseGrampsXml(xml, { file: `${label}-export` });
    const d2 = firstDiff(coreSlice(parsed), coreSlice(again));
    if (d2 && values) {
      throw new Error(`${label}: export round-trip drifted at ${d2}`);
    }
    assert(!d2, `${label}: export round-trip drifted at ${d2}`);
    return { people: parsed.meta.counts.people, families: parsed.meta.counts.families, dir, dbPath, parsed, loaded };
  } finally {
    try { db.close(); } catch { /* ignore */ }
  }
}

function testEdits() {
  const parsed = parseGrampsXml(FIXTURE_XML, { file: "fixture" });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ftv-edit-"));
  const dbPath = path.join(dir, "tree.db");
  const db = openDb(dbPath);
  importModel(db, parsed, { source: "fixture" });
  const r = applyEdit(db, (ctx) => dispatchEdit("relative", {
    personId: "I0001",
    role: "child",
    first: "",
    surname: "Cruz",
    gender: "U",
  }, ctx));
  assert(r.id && r.id !== "I0001", "add child should create a new id");
  const after = loadModelFromDb(db);
  const child = after.people[r.id];
  assert(child, "child exists");
  assert(child.first === "", "must not invent a given name");
  assert(child.surname === "Cruz", "surname preserved");
  assert(after.people.I0001.families.length >= 1, "parent family linked");
  assert(changeCount(db) > 0, "audit log wrote");
  const undone = undoLast(db);
  assert(undone.ok, "undo ok");
  const back = loadModelFromDb(db);
  assert(!back.people[r.id], "undo removed the child");
  assert(Object.keys(back.people).length === 2, "people count restored");

  applyEdit(db, (ctx) => dispatchEdit("source", { title: "Florida 1885 state census", author: "" }, ctx));
  const withSrc = loadModelFromDb(db);
  const src = Object.values(withSrc.sources).find((s) => s.title === "Florida 1885 state census");
  assert(src, "new source");
  applyEdit(db, (ctx) => dispatchEdit("citation", { source: src.id, page: "Hillsborough, p. 4", confidence: 3, attach: { kind: "person", id: "I0001" } }, ctx));
  const cited = loadModelFromDb(db);
  assert(cited.people.I0001.citations.length === 2, "citation attached");

  applyEdit(db, (ctx) => dispatchEdit("event", { personId: "I0002", type: "Birth", dateText: "abt 1838" }, ctx));
  const evs = loadModelFromDb(db);
  const birth = evs.people.I0002.events.map((e) => evs.events[e.id]).find((e) => e.type === "Birth");
  assert(birth?.date?.type === "about", "date about");
  assert(birth.date.year === 1838, "year 1838");

  const dest = path.join(dir, "export-test.gramps");
  writeGrampsExport(evs, dest);
  assert(fs.existsSync(dest), "export wrote");
  let refused = false;
  try { assertSafeExportPath(path.join(dir, "data.gramps")); } catch { refused = true; }
  assert(refused, "export refuses data.gramps");

  const gedDest = path.join(dir, "export-test.ged");
  writeGedcomExport(evs, gedDest);
  assert(fs.existsSync(gedDest), "gedcom export wrote");
  const ged = parseGedcom(fs.readFileSync(gedDest, "utf8"), { file: gedDest });
  assert(Object.keys(ged.people).length === Object.keys(evs.people).length, "gedcom people count");
  assert(Object.keys(ged.families).length === Object.keys(evs.families).length, "gedcom family count");
  assert(ged.people.I0001?.first === "Ada", "gedcom Ada given name");
  let refusedGed = false;
  try { assertSafeExportPath(path.join(dir, "data.ged")); } catch { refusedGed = true; }
  assert(refusedGed, "export refuses data.ged");

  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==", "base64");
  const img = path.join(dir, "ada.png");
  fs.writeFileSync(img, png);
  const mediaBody = { action: "attach", personId: "I0001", src: img.replace(/\\/g, "/"), description: "Ada portrait" };
  const attached = applyEdit(db, (ctx) => dispatchEdit("media", mediaBody, ctx), { kind: "media", body: mediaBody });
  const withMedia = loadModelFromDb(db);
  assert(attached.id && withMedia.people.I0001.media.some((m) => m.id === attached.id), "media attached");
  assert(withMedia.media[attached.id]?.description === "Ada portrait", "media description");
  assert(withMedia.people.I0001.media[0].id === attached.id, "attached photo is portrait");
  const hist = listHistory(db);
  assert(hist.length >= 1, "history wrote");
  assert(/attached/i.test(hist[0].summary), "history summary attach");
  assert(hist[0].personIds.includes("I0001"), "history person chip");
  const undoneMedia = undoLast(db);
  assert(undoneMedia.ok, "undo media");
  const afterUndoMedia = loadModelFromDb(db);
  assert(!(afterUndoMedia.people.I0001.media || []).length, "undo removed media link");
  assert(!afterUndoMedia.media[attached.id], "undo removed media object");
  assert(listHistory(db)[0].undone, "history marked undone");

  const attachedAgain = applyEdit(db, (ctx) => dispatchEdit("media", mediaBody, ctx), { kind: "media", body: mediaBody });
  const img2 = path.join(dir, "ada-alt.png");
  fs.writeFileSync(img2, png);
  const secondBody = { action: "attach", personId: "I0001", src: img2.replace(/\\/g, "/"), description: "Alt" };
  const attachedAlt = applyEdit(db, (ctx) => dispatchEdit("media", secondBody, ctx), { kind: "media", body: secondBody });
  applyEdit(db, (ctx) => dispatchEdit("media", { action: "portrait", personId: "I0001", mediaId: attachedAlt.id }, ctx), {
    kind: "media", body: { action: "portrait", personId: "I0001", mediaId: attachedAlt.id },
  });
  const port = loadModelFromDb(db);
  assert(port.people.I0001.media[0].id === attachedAlt.id, "set portrait");
  applyEdit(db, (ctx) => dispatchEdit("media", { action: "detach", personId: "I0001", mediaId: attachedAlt.id }, ctx), {
    kind: "media", body: { action: "detach", personId: "I0001", mediaId: attachedAlt.id },
  });
  const det = loadModelFromDb(db);
  assert(det.people.I0001.media[0].id === attachedAgain.id, "detach left the other photo");
  assert(!det.media[attachedAlt.id], "unused media deleted");

  const research = path.join(dir, "research");
  const ada = { id: "I0001", first: "Ada", surname: "de la Cruz" };
  assert(personFileSlug(ada) === "I0001_ada-de-la-cruz", "person slug");
  assert(destRelative({ person: ada, kind: "portrait", originalName: "scan.PNG", ext: ".png" }) === "sources/portraits/I0001_ada-de-la-cruz.png", "portrait dest");
  const portrait = ingestFile({ personalRoot: research, person: ada, kind: "portrait", originalName: "scan.png", caption: "", ext: ".png", bytes: png });
  assert(portrait.relative === "sources/portraits/I0001_ada-de-la-cruz.png", "portrait ingest path");
  assert(fs.existsSync(portrait.abs), "portrait file wrote");
  const portrait2 = ingestFile({ personalRoot: research, person: ada, kind: "portrait", originalName: "scan.png", caption: "", ext: ".png", bytes: png });
  assert(portrait2.relative === "sources/portraits/I0001_ada-de-la-cruz-2.png", "portrait collision suffix");
  const pdf = Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");
  const doc = ingestFile({ personalRoot: research, person: ada, kind: "document", originalName: "scan.pdf", caption: "wedding", ext: ".pdf", bytes: pdf });
  assert(doc.relative === "sources/people/I0001_ada-de-la-cruz/wedding.pdf", "document dest");
  const unnamed = ingestFile({
    personalRoot: research,
    person: { id: "I0002", first: "", surname: "" },
    kind: "portrait",
    originalName: "x.png",
    ext: ".png",
    bytes: png,
  });
  assert(unnamed.relative === "sources/portraits/I0002.png", "unnamed uses id only");
  let rejected = false;
  try { ingestFile({ personalRoot: research, person: ada, kind: "portrait", originalName: "x.exe", ext: ".exe", bytes: png }); }
  catch { rejected = true; }
  assert(rejected, "reject exe");
  let escaped = false;
  try { assertInside(research, path.join(research, "..", "escape.png")); }
  catch { escaped = true; }
  assert(escaped, "reject path escape");
  const jsonIn = parseIngestBody(Buffer.from(JSON.stringify({
    personId: "I0001", kind: "portrait", name: "a.png", data: png.toString("base64"),
  })), "application/json");
  assert(jsonIn.bytes.length === png.length, "json ingest body");
  const boundary = "----ftv";
  const mp = parseIngestBody(Buffer.concat([
    Buffer.from(`------ftv\r\nContent-Disposition: form-data; name="personId"\r\n\r\nI0001\r\n------ftv\r\nContent-Disposition: form-data; name="file"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n`),
    png,
    Buffer.from(`\r\n------ftv--`),
  ]), `multipart/form-data; boundary=${boundary}`);
  assert(mp.personId === "I0001" && mp.name === "a.png" && mp.bytes.length === png.length, "multipart ingest body");
  const ingestBody = { action: "attach", personId: "I0001", src: portrait.relative, description: "Ada portrait ingest" };
  const ingested = applyEdit(db, (ctx) => dispatchEdit("media", ingestBody, ctx), { kind: "media", body: ingestBody });
  const afterIngest = loadModelFromDb(db);
  assert(afterIngest.people.I0001.media.some((m) => m.id === ingested.id), "ingest attached");

  const backup = rotateBackups(dbPath, path.join(dir, "backups"), 3);
  assert(backup && fs.existsSync(backup), "backup wrote");
  db.close();
}

function testGedFirstImport() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ftv-ged-import-"));
  const dataDir = path.join(dir, "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const gedPath = path.join(dataDir, "data.ged");
  fs.writeFileSync(gedPath, [
    "0 HEAD",
    "1 SOUR Family Tree selftest",
    "1 GEDC",
    "2 VERS 5.5.1",
    "0 @I1@ INDI",
    "1 NAME Ada /Cruz/",
    "1 SEX F",
    "0 TRLR",
    "",
  ].join("\n"));
  const before = fs.readFileSync(gedPath);
  const model = loadTreeFile(gedPath);
  assert(Object.keys(model.people).length === 1, "ged loadTreeFile people");
  const dbPath = path.join(dataDir, "tree.db");
  const db = openDb(dbPath);
  try {
    importModel(db, model, { source: gedPath });
    const loaded = loadModelFromDb(db);
    assert(Object.keys(loaded.people).length === 1, "ged imported to sqlite");
    const person = Object.values(loaded.people)[0];
    assert(person.first === "Ada", "ged given name");
    assert(Buffer.compare(before, fs.readFileSync(gedPath)) === 0, "source ged untouched");
  } finally {
    db.close();
  }
}

function maybeFileRoundTrip() {
  const extra = [];
  const queen = path.join(APP, "sample", "queen", "queen.gramps");
  if (fs.existsSync(queen)) extra.push({ label: "queen.gramps", file: queen });
  if (hasPersonalTree() && fs.existsSync(personalFile())) {
    extra.push({ label: "personal", file: personalFile() });
  }
  for (const item of extra) {
    const model = loadGramps(item.file);
    roundTrip(item.label, model, { values: false });
  }
  return extra.length;
}

export function selftestStore() {
  let tests = 0;
  roundTrip("fixture", FIXTURE_XML, { values: true });
  tests += 1;
  testEdits();
  tests += 1;
  testGedFirstImport();
  tests += 1;
  const extra = maybeFileRoundTrip();
  tests += extra;
  return { tests };
}
