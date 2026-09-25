// Hand-built models: unmatched titles are unknown, and a missing SOUR scores 0.
import { classifySource, citationWeight, computeConfidence, evidenceSummary, SOURCE_CLASS } from "./confidence.mjs";

function ok(cond, msg) {
  if (!cond) throw new Error(msg);
}

function src(title, extra = {}) {
  return { title, pubinfo: extra.pubinfo || "", author: extra.author || "", media: extra.media || [] };
}

function person(id, opts = {}) {
  return {
    id,
    name: opts.name || id,
    gender: "F",
    first: "Ada",
    surname: "Example",
    events: opts.events || [],
    parentFamilies: opts.parentFamilies || [],
    families: opts.families || [],
    citations: opts.citations || [],
    names: [{ citations: opts.nameCitations || [] }],
  };
}

export function selftestConfidence() {
  let n = 0;
  const check = (cond, msg) => { ok(cond, msg); n++; };

  check(classifySource(src("Public Member Tree")) === SOURCE_CLASS.MEMBER_TREE, "member tree");
  check(classifySource(src("Florida Death Index")) === SOURCE_CLASS.INDEX, "death index");
  check(classifySource(src("Registro Civil de Matanzas")) === SOURCE_CLASS.PRIMARY, "registro");
  check(classifySource(src("(untitled source)")) === SOURCE_CLASS.UNKNOWN, "untitled");
  check(classifySource(src("Ancestry.com")) === SOURCE_CLASS.UNKNOWN, "bare ancestry host");
  check(classifySource(src("Loose scan", { media: [{ ref: "O1" }] })) === SOURCE_CLASS.PRIMARY, "attached image");
  check(classifySource(src("Public Member Tree", { media: [{ ref: "O1" }] })) === SOURCE_CLASS.MEMBER_TREE, "tree screenshot stays a member tree");
  check(classifySource(src("Florida Death Index", { media: [{ ref: "O1" }] })) === SOURCE_CLASS.INDEX, "index scan stays an index");
  check(classifySource(null) === SOURCE_CLASS.UNKNOWN, "null source");

  const model = {
    people: {
      I1: person("I1", { events: [{ id: "E1", role: "Primary" }] }),
      I2: person("I2", { events: [{ id: "E2", role: "Primary" }] }),
    },
    events: {
      E1: { id: "E1", type: "Birth", date: { year: 1840, sort: 18400101, text: "1840" }, citations: [] },
      E2: { id: "E2", type: "Birth", date: { year: 1842, sort: 18420101, text: "1842" }, citations: ["C1"] },
    },
    citations: {
      C1: { id: "C1", source: "S1", confidence: 2, media: [] },
    },
    sources: {
      S1: src("(untitled source)"),
    },
    families: {},
    notes: {},
  };
  S1id(model);

  const w = citationWeight(model, "C1");
  check(w.cls === SOURCE_CLASS.UNKNOWN, "untitled citation class");
  check(Math.abs(w.w - 0.2) < 1e-9, "unknown weight is 0.4 × confidence/4");

  const conf = computeConfidence(model);
  const birth1 = conf.I1.facts.find((f) => f.key === "birth");
  check(birth1.score === 0, "uncited birth scores 0");
  check(conf.I1.summary.includes("Birth has no citation"), "summary names the missing citation");
  check(conf.I1.summary.includes("parents are not linked"), "summary names missing parents");
  check(conf.I2.classes.unknown === 1, "unknown citation counted");
  check(conf.I2.score < 40, "untitled source is not a high score");
  check(conf.I2.tier !== "high", "untitled source is not high tier");
  check(evidenceSummary(conf.I2.facts).startsWith("Birth is an unknown source"), "unknown source sentence");

  const indexed = {
    ...model,
    people: { I3: person("I3", { events: [{ id: "E3", role: "Primary" }, { id: "E4", role: "Primary" }] }) },
    events: {
      E3: { id: "E3", type: "Birth", date: { year: 1840, sort: 18400101, text: "1840" }, citations: ["C2"] },
      E4: { id: "E4", type: "Death", date: { year: 1900, sort: 19000101, text: "1900" }, citations: ["C3"] },
    },
    citations: {
      C2: { id: "C2", source: "S2", confidence: 2, media: [] },
      C3: { id: "C3", source: "S3", confidence: 3, media: [] },
    },
    sources: {
      S2: { id: "S2", ...src("Florida Death Index") },
      S3: { id: "S3", ...src("Death certificate, Exampleton") },
    },
  };
  const both = computeConfidence(indexed);
  check(both.I3.summary.startsWith("Birth is an index only"), "index clause");
  check(both.I3.summary.includes("death is a primary record"), "primary clause");
  check(both.I3.summary.includes("parents have no citation") === false, "unlinked parents are not 'no citation'");
  check(both.I3.summary.includes("parents are not linked"), "unlinked parents clause");

  return { tests: n };
}

function S1id(model) {
  model.sources.S1 = { id: "S1", ...model.sources.S1 };
}
