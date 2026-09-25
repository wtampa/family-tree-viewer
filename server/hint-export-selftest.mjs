/** Node-only checks: filter, markdown shape, no invented names, never a tree-file path. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  selectHints,
  escapeMd,
  nextRecord,
  personName,
  formatHintLog,
  resolveExportPath,
  assertSafeExportPath,
  writeHintLog,
  exportHintLog,
} from "./hint-export.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FAKE_ROOT = path.join(APP, ".cache", "hint-export-selftest-root");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function sampleHints() {
  return [
    {
      id: "brick-wall:I10:parents",
      type: "brick-wall",
      personId: "I10",
      state: "pinned",
      isAncestor: true,
      title: "Parents of Ada Example unknown",
      why: "Ada Example is a generation-3 direct ancestor with no parents recorded (born about 1840, Tampa, Florida).",
      suggestedRecords: ["Baptism / birth record of Ada Example — the paragraph names the parents", "1850 US census"],
      searchLinks: [
        { label: "FamilySearch records", url: "https://www.familysearch.org/search/record/results?q.surname=Example" },
        { label: "Local index PDF", url: "/api/file?p=00_Data_In/example.pdf", local: true },
      ],
      wall: { n: 2, nextRecord: "1850 US census household", missing: "parents' given names" },
      stateNote: "Look on page 12",
    },
    {
      id: "missing-birth:I10:birth",
      type: "missing-birth",
      personId: "I10",
      state: "open",
      isAncestor: true,
      title: "No birth or baptism date for Ada Example",
      why: "Estimated birth about 1840 from relatives' dates.",
      suggestedRecords: ["Baptism register"],
      searchLinks: [{ label: "Ancestry search", url: "https://www.ancestry.com/search/" }],
    },
    {
      id: "uncited:I20:birth",
      type: "uncited",
      personId: "I20",
      state: "open",
      isAncestor: false,
      title: "Uncited birth for Collateral Example",
      why: "The birth event has no citation.",
      suggestedRecords: ["Civil birth act"],
      searchLinks: [],
    },
    {
      id: "conflict:I30:lifespan",
      type: "conflict",
      personId: "I30",
      state: "done",
      isAncestor: true,
      title: "Lifespan of 140 years for Done Example",
      why: "Born 1800, died 1940.",
      suggestedRecords: ["Burial record"],
      searchLinks: [],
    },
    {
      id: "duplicate:I40:dup",
      type: "duplicate",
      personId: "I40",
      state: "pinned",
      isAncestor: false,
      title: "Possible duplicate: Collateral Two",
      why: "Same name and no dates to separate them.",
      suggestedRecords: ["Compare events"],
      searchLinks: [],
    },
  ];
}

const model = {
  people: {
    I10: { id: "I10", name: "Ada Example", first: "Ada", surname: "Example" },
    HOME: { id: "HOME", name: "Home Example", first: "Home", surname: "Example" },
  },
};

export function selftestHintExport() {
  let n = 0;
  const ok = (cond, msg) => { n += 1; assert(cond, msg); };

  const all = sampleHints();
  const pinned = selectHints(all, { includeOpenAncestors: false });
  ok(pinned.length === 2 && pinned.every((h) => h.state === "pinned"), "pinned-only");
  ok(pinned.some((h) => !h.isAncestor), "pinned collateral stays in");

  const plus = selectHints(all, { includeOpenAncestors: true });
  ok(plus.length === 3, "pinned + one open ancestor");
  ok(plus.every((h) => h.state !== "done" && h.state !== "dismissed"), "done/dismissed out");
  ok(!plus.some((h) => h.personId === "I20"), "open non-ancestor out");

  ok(nextRecord(all[0]) === "1850 US census household", "wall nextRecord wins");
  ok(nextRecord(all[1]) === "Baptism register", "first suggested record fallback");
  ok(personName(model, "I10") === "Ada Example", "name from model");
  ok(personName(model, "I99") === "I99", "unknown id stays the id — no invented name");

  ok(escapeMd("Ada *Example*").includes("\\*"), "escape emphasis");
  ok(!escapeMd("line1\nline2").includes("\n"), "flatten newlines");

  const md = formatHintLog(pinned, {
    model,
    treeTitle: "Sample tree",
    treeId: "example",
    homeId: "HOME",
    includeOpenAncestors: false,
    exportedAt: new Date("2026-09-19T18:00:00"),
  });
  ok(md.includes("# Research hint log"), "heading");
  ok(md.includes("Ada Example"), "person");
  ok(md.includes("**Why:**"), "why");
  ok(md.includes("**Next record:** 1850 US census household"), "next record");
  ok(md.includes("[FamilySearch records](https://www.familysearch.org/search/record/results?q.surname=Example)"), "http search link");
  ok(md.includes("Local index PDF") && md.includes("/api/file?p=00_Data_In/example.pdf"), "local search link");
  ok(md.includes("Scope: pinned hints"), "scope");
  ok(md.includes("Home: Home Example (`HOME`)"), "home");
  ok(!/Invented|John Doe|Jane Roe|Unknown Parent Given/i.test(md), "does not invent names");
  ok(!md.includes("Collateral Example"), "open collateral not in pinned log");
  ok(!md.includes("Done Example"), "done hint not in log");

  const injected = formatHintLog([{
    ...all[0],
    title: "## Injected",
    why: "Ada Example only",
    personId: "I10",
  }], { model, treeId: "example" });
  ok(injected.includes("\\#\\# Injected"), "heading injection escaped");

  const personal = resolveExportPath({
    treeId: "personal",
    projectRoot: FAKE_ROOT,
    appRoot: APP,
    when: new Date("2026-09-19T12:00:00"),
  });
  ok(personal.replace(/\\/g, "/").endsWith("research/hint-log/hint-export-personal-2026-09-19.md"), `personal dest ${personal}`);

  const sample = resolveExportPath({
    treeId: "queen",
    projectRoot: FAKE_ROOT,
    appRoot: APP,
    when: new Date("2026-09-19T12:00:00"),
  });
  ok(sample.replace(/\\/g, "/").includes(".cache/hint-log/hint-export-queen-2026-09-19.md"), `sample dest ${sample}`);
  ok(!sample.toLowerCase().includes(`${path.sep}data${path.sep}`), "sample dest not under data/");

  let refused = 0;
  for (const bad of [
    path.join(FAKE_ROOT, "data", "data.gramps"),
    path.join(APP, "notes", "hint-export.md"),
    path.join(FAKE_ROOT, "research", "other.md"),
  ]) {
    try { assertSafeExportPath(bad, { appRoot: APP, projectRoot: FAKE_ROOT }); } catch { refused += 1; }
  }
  ok(refused === 3, "unsafe paths refused");

  const empty = exportHintLog({
    hints: all.filter((h) => h.state === "done"),
    model,
    treeId: "selftest",
    appRoot: APP,
    projectRoot: FAKE_ROOT,
  });
  ok(empty.ok === false && empty.count === 0 && !empty.path, "empty export writes nothing");

  const wrote = exportHintLog({
    hints: all,
    model,
    treeId: "selftest",
    treeTitle: "Selftest",
    homeId: "HOME",
    includeOpenAncestors: false,
    appRoot: APP,
    projectRoot: FAKE_ROOT,
    when: new Date("2026-09-19T12:00:00"),
  });
  ok(wrote.ok && wrote.count === 2 && fs.existsSync(wrote.path), "writes markdown");
  ok(path.basename(wrote.path).endsWith(".md"), "md extension");
  const disk = fs.readFileSync(wrote.path, "utf8");
  ok(disk.includes("Ada Example") && disk.includes("**Why:**"), "file has person + why");
  fs.unlinkSync(wrote.path);

  try {
    writeHintLog(path.join(FAKE_ROOT, "data", "data.gramps"), "nope", { appRoot: APP, projectRoot: FAKE_ROOT });
    ok(false, "must not write gramps");
  } catch (e) {
    ok(/refusing|outside/i.test(e.message), `gramps write blocked: ${e.message}`);
  }

  return { tests: n };
}
