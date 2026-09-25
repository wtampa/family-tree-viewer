/** Generation-shelf layout for Hive 3D. Packs XZ; Y stays generation * level. */

export const HEAVY_PEOPLE = 400;
export const HEAVY_NODES = 800;
export const MAX_PERSONS = 2500;
export const LEVEL = 60;

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

export function isHeavyGraph(personCount, nodeCount) {
  return personCount > HEAVY_PEOPLE || nodeCount > HEAVY_NODES;
}

/** People in scope, clipped to a generation window around root. */
export function selectHivePeople(model, rootId, { scope = "all", ancestry = 8, progeny = 6, maxPersons = MAX_PERSONS } = {}) {
  const gens = model.generationsFrom(rootId);
  let ids;
  if (scope === "related") {
    const keep = new Set([rootId]);
    for (const [id] of model.ancestors(rootId, ancestry)) keep.add(id);
    for (const [id] of model.descendants(rootId, progeny)) keep.add(id);
    for (const id of [...keep]) for (const s of model.spouses(id)) keep.add(s);
    ids = [...keep].filter((id) => model.people[id]);
  } else {
    ids = Object.keys(model.people).filter((id) => {
      const g = gens[id];
      return g !== undefined && g <= ancestry && g >= -progeny;
    });
  }
  const available = ids.length;
  let truncated = false;
  if (ids.length > maxPersons) {
    ids.sort((a, b) => (Math.abs(gens[a] || 0) - Math.abs(gens[b] || 0)) || String(a).localeCompare(String(b)));
    const keepRoot = ids.includes(rootId);
    ids = ids.slice(0, maxPersons);
    if (keepRoot && !ids.includes(rootId)) ids[ids.length - 1] = rootId;
    truncated = true;
  }
  return { gens, ids, truncated, available };
}

function sunflower(i, n, spacing) {
  if (n <= 1) return { x: 0, z: 0 };
  if (n <= 18) {
    const r = Math.max(spacing, (n * spacing) / (2 * Math.PI));
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    return { x: Math.cos(a) * r, z: Math.sin(a) * r };
  }
  const r = spacing * Math.sqrt(i + 0.5);
  const a = i * GOLDEN;
  return { x: Math.cos(a) * r, z: Math.sin(a) * r };
}

/**
 * Place people on a circle / sunflower per generation; family nodes at member centroids.
 * Mutates node.x/y/z. Link source/target may be ids or objects.
 */
export function packGenerationHive(nodes, links, { level = LEVEL, spacing = 22 } = {}) {
  const pos = new Map();
  const byGen = new Map();
  for (const n of nodes) {
    const g = n.gen ?? 0;
    if (!byGen.has(g)) byGen.set(g, []);
    byGen.get(g).push(n);
  }
  for (const [g, arr] of byGen) {
    const y = g * level;
    const people = arr.filter((n) => n.kind === "person");
    people.forEach((n, i) => {
      const { x, z } = sunflower(i, people.length, spacing);
      n.x = x;
      n.y = y;
      n.z = z;
      pos.set(n.id, { x, y, z });
    });
  }
  const idOf = (end) => (end && typeof end === "object" ? end.id : end);
  for (const n of nodes) {
    if (n.kind === "person") continue;
    const members = [];
    for (const l of links) {
      const s = idOf(l.source);
      const t = idOf(l.target);
      if (s === n.id && pos.has(t)) members.push(pos.get(t));
      else if (t === n.id && pos.has(s)) members.push(pos.get(s));
    }
    if (members.length) {
      n.x = members.reduce((a, p) => a + p.x, 0) / members.length;
      n.z = members.reduce((a, p) => a + p.z, 0) / members.length;
    } else {
      n.x = 0;
      n.z = 0;
    }
    n.y = (n.gen ?? 0) * level;
  }
  return nodes;
}
