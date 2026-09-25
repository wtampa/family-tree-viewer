import { TreeModel } from "../src/lib/model.js";
import { pedigreeData } from "../src/lib/chart-data.js";

function person(id, gender, parentFamily, ownFamilies = []) {
  return {
    id,
    first: id,
    surname: "Line",
    name: `${id} Line`,
    gender,
    parentFamilies: parentFamily ? [parentFamily] : [],
    families: ownFamilies,
    events: [],
    media: [],
  };
}

function family(id, father, mother, childIds) {
  return { id, father, mother, children: childIds.map((cid) => ({ id: cid })), events: [] };
}

/** Root, 30 ancestor generations, a sibling, a spouse, a child, and a grandchild. G4 also points back at G1. */
function chainModel() {
  const people = {};
  const families = {};
  const N = 30;
  for (let i = 0; i <= N; i++) {
    const own = [];
    if (i > 0) own.push(`F${i - 1}`);
    if (i === 0) own.push("FS");
    people[`G${i}`] = person(`G${i}`, i % 2 ? "F" : "M", i < N ? `F${i}` : null, own);
  }
  for (let i = 0; i < N; i++) {
    families[`F${i}`] = family(`F${i}`, i === 4 ? "G1" : null, `G${i + 1}`, [`G${i}`]);
  }
  families.F0.children.push({ id: "Sib" });
  people.Sib = person("Sib", "M", "F0");
  people.Sp = person("Sp", "F", null, ["FS"]);
  people.Kid = person("Kid", "M", "FS", ["FK"]);
  people.Grand = person("Grand", "F", "FK");
  families.FS = family("FS", "G0", "Sp", ["Kid"]);
  families.FK = family("FK", "Kid", null, ["Grand"]);
  return new TreeModel({
    version: 1,
    settings: { homeId: "G0" },
    model: { people, families, events: {}, places: {}, citations: {}, sources: {}, notes: {}, media: {} },
    generations: {},
  });
}

function chainLength(data, rootId) {
  const by = new Map(data.map((d) => [d.id, d]));
  let id = rootId;
  let hops = 0;
  const seen = new Set();
  while (by.get(id)?.rels.parents.length) {
    const next = by.get(id).rels.parents[0];
    if (seen.has(next)) throw new Error(`cycle at ${next}`);
    seen.add(next);
    id = next;
    hops += 1;
    if (hops > 20) throw new Error("chain did not stop");
  }
  return hops;
}

export function selftestChartData() {
  let n = 0;
  const check = (cond, msg) => {
    n += 1;
    if (!cond) throw new Error(msg);
  };
  const model = chainModel();

  const ped = pedigreeData(model, { rootId: "G0", ancestry: 4, progeny: 0, siblings: true });
  const ids = new Set(ped.map((d) => d.id));
  check(ped[0].id === "G0", "root is first");
  check(ids.has("G4") && !ids.has("G5") && !ids.has("G30"), "ancestor walk stops at the slider");
  check(ids.has("Sib") && ids.has("Sp"), "sibling and spouse stay on the chart");
  check(!ids.has("Kid"), "pedigree does not include descendants");
  check(chainLength(ped, "G0") === 4, "parent chain is four hops");
  const g4 = ped.find((d) => d.id === "G4");
  check(g4.rels.parents.length === 0, "the far generation has no further parent link");
  const g3 = ped.find((d) => d.id === "G3");
  check(g3.rels.parents.length === 1 && g3.rels.parents[0] === "G4", "each step links only the next generation");
  const sib = ped.find((d) => d.id === "Sib");
  check(sib.rels.parents.includes("G1"), "sibling still points at the shared parent");

  const deep = pedigreeData(model, { rootId: "G0", ancestry: 12, progeny: 0, siblings: false });
  check(chainLength(deep, "G0") === 12, "twelve generations stay bounded");
  check(!deep.some((d) => d.id === "G1" && d.rels.parents.includes("G4")), "a repeated ancestor is not a parent of themself");
  const g4deep = deep.find((d) => d.id === "G4");
  check(!g4deep.rels.parents.includes("G1"), "the backward parent link is dropped");
  check(g4deep.rels.parents.includes("G5"), "the forward parent link stays");

  const hour = pedigreeData(model, { rootId: "G0", ancestry: 2, progeny: 1, siblings: false });
  const hourIds = new Set(hour.map((d) => d.id));
  check(hourIds.has("G2") && !hourIds.has("G3"), "hourglass ancestors stop at two");
  check(hourIds.has("Kid") && hourIds.has("Sp") && !hourIds.has("Grand"), "one generation of descendants, with the spouse");
  const kid = hour.find((d) => d.id === "Kid");
  check(kid.rels.parents.includes("G0") && kid.rels.parents.includes("Sp"), "child keeps both parents");
  check(kid.rels.children.length === 0, "descendant walk stops at the slider");

  const none = pedigreeData(model, { rootId: "missing", ancestry: 4, progeny: 3, siblings: true });
  check(none.length === 0, "unknown root yields no rows");

  return { tests: n };
}
