/**
 * People and links for one pedigree / descendants / hourglass drawing.
 *
 * family-chart walks every parent link to the end of the file, then trims to the
 * depth slider. On a deep tree that walk builds an ancestor slot for every path
 * and never comes back. This hands it only the generations on the sliders, and
 * only the parent link that steps one generation further, so a repeated ancestor
 * cannot send the walk back down the line.
 */

const clamp = (n, max) => Math.max(0, Math.min(max, Number(n) || 0));

export function pedigreeData(model, { rootId, ancestry = 4, progeny = 0, siblings = false } = {}) {
  if (!rootId || !model?.person?.(rootId)) return [];
  const up = clamp(ancestry, 12);
  const down = clamp(progeny, 10);
  const anc = up > 0 ? model.ancestors(rootId, up) : new Map();
  const desc = down > 0 ? model.descendants(rootId, down) : new Map();
  const ids = new Set([rootId]);
  for (const id of anc.keys()) ids.add(id);
  for (const id of desc.keys()) ids.add(id);
  if (siblings && up > 0) for (const id of model.siblings(rootId)) ids.add(id);
  for (const id of model.spouses(rootId)) ids.add(id);
  if (down > 0) {
    for (const id of desc.keys()) for (const sp of model.spouses(id)) ids.add(sp);
  }

  const data = model.toF3(ids);
  for (const d of data) {
    const generation = anc.get(d.id);
    if (d.id === rootId) d.rels.parents = d.rels.parents.filter((p) => anc.get(p) === 1);
    else if (generation != null) d.rels.parents = d.rels.parents.filter((p) => anc.get(p) === generation + 1);
    else d.rels.parents = d.rels.parents.filter((p) => ids.has(p));
    d.rels.parents = d.rels.parents.slice(0, 2);

    const downGen = d.id === rootId ? 0 : desc.get(d.id);
    if (downGen != null) d.rels.children = d.rels.children.filter((c) => desc.get(c) === downGen + 1);
    else d.rels.children = d.rels.children.filter((c) => ids.has(c));

    d.rels.spouses = d.rels.spouses.filter((s) => ids.has(s));
  }
  data.sort((a, b) => (a.id === rootId ? -1 : b.id === rootId ? 1 : 0));
  return data;
}
