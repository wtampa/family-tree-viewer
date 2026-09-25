/**
 * Normalized model → Gramps XML 1.7.2.
 * Always writes a NEW file. Refuses data.gramps.
 */
import fs from "node:fs";
import path from "node:path";

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function attr(name, value, { skipEmpty = true } = {}) {
  if (value == null) return "";
  if (skipEmpty && value === "") return "";
  return ` ${name}="${esc(value)}"`;
}

function handleOf(model, table, id) {
  if (!id) return "";
  return model[table]?.[id]?.handle || id;
}

function objAttrs(o) {
  return `${attr("handle", o.handle)}${attr("change", o.change ?? 0, { skipEmpty: false })}${attr("id", o.id)}${o.priv ? ' priv="1"' : ""}`;
}

function dateXml(date, pad) {
  if (!date) return "";
  if (date.kind === "range" || date.kind === "span") {
    const tag = date.kind === "range" ? "daterange" : "datespan";
    return `${pad}<${tag}${attr("start", date.start)}${attr("stop", date.stop)}${attr("quality", date.quality)}/>\n`;
  }
  if (date.kind === "text") {
    return `${pad}<datestr val="${esc(date.text || date.val || "")}"/>\n`;
  }
  if (date.kind === "value" || date.val) {
    return `${pad}<dateval${attr("val", date.val)}${attr("type", date.type)}${attr("quality", date.quality)}/>\n`;
  }
  return "";
}

function refsXml(ids, tag, pad) {
  return (ids || []).map((id) => `${pad}<${tag} hlink="${esc(id)}"/>\n`).join("");
}

function citeRefs(model, ids, pad) {
  return (ids || []).map((id) => `${pad}<citationref hlink="${esc(handleOf(model, "citations", id))}"/>\n`).join("");
}

function noteRefs(model, ids, pad) {
  return (ids || []).map((id) => `${pad}<noteref hlink="${esc(handleOf(model, "notes", id))}"/>\n`).join("");
}

function tagRefs(model, ids, pad) {
  return (ids || []).map((id) => `${pad}<tagref hlink="${esc(handleOf(model, "tags", id))}"/>\n`).join("");
}

function objRefs(model, items, pad) {
  return (items || []).map((m) => {
    const h = handleOf(model, "media", m.id || m.ref);
    if (!h) return "";
    if (m.region && (m.region.x1 != null || m.region.y1 != null)) {
      return `${pad}<objref hlink="${esc(h)}">\n${pad}  <region${attr("corner1_x", m.region.x1)}${attr("corner1_y", m.region.y1)}${attr("corner2_x", m.region.x2)}${attr("corner2_y", m.region.y2)}/>\n${pad}</objref>\n`;
    }
    return `${pad}<objref hlink="${esc(h)}"/>\n`;
  }).join("");
}

function attributesXml(attrs, pad, tag = "attribute") {
  return (attrs || []).map((a) => {
    if ((a.citations || []).length) {
      return `${pad}<${tag}${attr("type", a.type)}${attr("value", a.value)}>\n${a.citations.map((cid) => `${pad}  <citationref hlink="${esc(cid)}"/>\n`).join("")}${pad}</${tag}>\n`;
    }
    return `${pad}<${tag}${attr("type", a.type)}${attr("value", a.value)}/>\n`;
  }).join("");
}

function urlsXml(urls, pad) {
  return (urls || []).map((u) => `${pad}<url${attr("href", u.href)}${attr("type", u.type)}${attr("description", u.description)}/>\n`).join("");
}

function eventRefsXml(model, events, pad) {
  return (events || []).map((e) => {
    const h = handleOf(model, "events", e.id || e.ref);
    if (!h) return "";
    return `${pad}<eventref hlink="${esc(h)}"${attr("role", e.role)}/>\n`;
  }).join("");
}

function nameXml(model, n, pad) {
  let out = `${pad}<name${attr("type", n.type || "Birth Name")}${n.alt ? ' alt="1"' : ""}>\n`;
  if (n.first != null) out += `${pad}  <first>${esc(n.first)}</first>\n`;
  const surnames = n.surnames?.length ? n.surnames : (n.surname ? [{ value: n.surname, prim: true, prefix: "", connector: "", derivation: "" }] : []);
  for (const s of surnames) {
    out += `${pad}  <surname${s.prim === false ? ' prim="0"' : ""}${attr("prefix", s.prefix)}${attr("connector", s.connector)}${attr("derivation", s.derivation)}>${esc(s.value || "")}</surname>\n`;
  }
  if (n.suffix) out += `${pad}  <suffix>${esc(n.suffix)}</suffix>\n`;
  if (n.title) out += `${pad}  <title>${esc(n.title)}</title>\n`;
  if (n.call) out += `${pad}  <call>${esc(n.call)}</call>\n`;
  if (n.nick) out += `${pad}  <nick>${esc(n.nick)}</nick>\n`;
  out += dateXml(n.date, `${pad}  `);
  for (const cid of n.citations || []) {
    const h = handleOf(model, "citations", cid);
    if (h) out += `${pad}  <citationref hlink="${esc(h)}"/>\n`;
  }
  for (const nid of n.notes || []) {
    const h = handleOf(model, "notes", nid);
    if (h) out += `${pad}  <noteref hlink="${esc(h)}"/>\n`;
  }
  out += `${pad}</name>\n`;
  return out;
}

function emitPeople(model) {
  const lines = ["  <people>\n"];
  for (const p of Object.values(model.people)) {
    lines.push(`    <person${objAttrs(p)}>\n`);
    lines.push(`      <gender>${esc(p.gender || "U")}</gender>\n`);
    for (const n of p.names || []) lines.push(nameXml(model, n, "      "));
    lines.push(eventRefsXml(model, p.events, "      "));
    for (const fid of p.parentFamilies || []) {
      const h = handleOf(model, "families", fid);
      if (h) lines.push(`      <childof hlink="${esc(h)}"/>\n`);
    }
    for (const fid of p.families || []) {
      const h = handleOf(model, "families", fid);
      if (h) lines.push(`      <parentin hlink="${esc(h)}"/>\n`);
    }
    for (const a of p.associations || []) {
      const h = handleOf(model, "people", a.id || a.ref);
      if (h) lines.push(`      <personref hlink="${esc(h)}"${attr("rel", a.rel)}/>\n`);
    }
    lines.push(citeRefs(model, p.citations, "      "));
    lines.push(noteRefs(model, p.notes, "      "));
    lines.push(objRefs(model, p.media, "      "));
    lines.push(attributesXml(mapCiteHandles(model, p.attributes), "      "));
    lines.push(urlsXml(p.urls, "      "));
    lines.push(tagRefs(model, p.tags, "      "));
    lines.push("    </person>\n");
  }
  lines.push("  </people>\n");
  return lines.join("");
}

function mapCiteHandles(model, attrs) {
  return (attrs || []).map((a) => ({
    ...a,
    citations: (a.citations || []).map((id) => handleOf(model, "citations", id)).filter(Boolean),
  }));
}

function emitFamilies(model) {
  const lines = ["  <families>\n"];
  for (const f of Object.values(model.families)) {
    lines.push(`    <family${objAttrs(f)}>\n`);
    if (f.relType) lines.push(`      <rel type="${esc(f.relType)}"/>\n`);
    const fh = handleOf(model, "people", f.father);
    const mh = handleOf(model, "people", f.mother);
    if (fh) lines.push(`      <father hlink="${esc(fh)}"/>\n`);
    if (mh) lines.push(`      <mother hlink="${esc(mh)}"/>\n`);
    lines.push(eventRefsXml(model, f.events, "      "));
    for (const c of f.children || []) {
      const h = handleOf(model, "people", c.id || c.ref);
      if (!h) continue;
      const frel = c.frel && c.frel !== "Birth" ? attr("frel", c.frel) : "";
      const mrel = c.mrel && c.mrel !== "Birth" ? attr("mrel", c.mrel) : "";
      lines.push(`      <childref hlink="${esc(h)}"${frel}${mrel}/>\n`);
    }
    lines.push(citeRefs(model, f.citations, "      "));
    lines.push(noteRefs(model, f.notes, "      "));
    lines.push(objRefs(model, f.media, "      "));
    lines.push(attributesXml(mapCiteHandles(model, f.attributes), "      "));
    lines.push(tagRefs(model, f.tags, "      "));
    lines.push("    </family>\n");
  }
  lines.push("  </families>\n");
  return lines.join("");
}

function emitEvents(model) {
  const lines = ["  <events>\n"];
  for (const e of Object.values(model.events)) {
    lines.push(`    <event${objAttrs(e)}>\n`);
    lines.push(`      <type>${esc(e.type || "Unknown")}</type>\n`);
    lines.push(dateXml(e.date, "      "));
    const ph = handleOf(model, "places", e.place);
    if (ph) lines.push(`      <place hlink="${esc(ph)}"/>\n`);
    if (e.description) lines.push(`      <description>${esc(e.description)}</description>\n`);
    lines.push(citeRefs(model, e.citations, "      "));
    lines.push(noteRefs(model, e.notes, "      "));
    lines.push(objRefs(model, e.media, "      "));
    lines.push(attributesXml(mapCiteHandles(model, e.attributes), "      "));
    lines.push(tagRefs(model, e.tags, "      "));
    lines.push("    </event>\n");
  }
  lines.push("  </events>\n");
  return lines.join("");
}

function emitPlaces(model) {
  const lines = ["  <places>\n"];
  for (const p of Object.values(model.places)) {
    lines.push(`    <placeobj${objAttrs(p)}${attr("type", p.type || "Unknown")}>\n`);
    if (p.title) lines.push(`      <ptitle>${esc(p.title)}</ptitle>\n`);
    for (const n of p.names || []) {
      lines.push(`      <pname${attr("value", n.value)}${attr("lang", n.lang)}`);
      if (n.date) {
        lines.push(`>\n${dateXml(n.date, "        ")}      </pname>\n`);
      } else lines.push("/>\n");
    }
    if (p.coord && Number.isFinite(Number(p.coord.lat)) && Number.isFinite(Number(p.coord.long))) {
      lines.push(`      <coord lat="${esc(p.coord.lat)}" long="${esc(p.coord.long)}"/>\n`);
    }
    for (const pid of p.parents || []) {
      const h = handleOf(model, "places", pid);
      if (h) lines.push(`      <placeref hlink="${esc(h)}"/>\n`);
    }
    lines.push(citeRefs(model, p.citations, "      "));
    lines.push(noteRefs(model, p.notes, "      "));
    lines.push(urlsXml(p.urls, "      "));
    lines.push(objRefs(model, p.media, "      "));
    lines.push("    </placeobj>\n");
  }
  lines.push("  </places>\n");
  return lines.join("");
}

function emitCitations(model) {
  const lines = ["  <citations>\n"];
  for (const c of Object.values(model.citations)) {
    lines.push(`    <citation${objAttrs(c)}>\n`);
    if (c.page) lines.push(`      <page>${esc(c.page)}</page>\n`);
    lines.push(dateXml(c.date, "      "));
    lines.push(`      <confidence>${esc(c.confidence ?? 2)}</confidence>\n`);
    const sh = handleOf(model, "sources", c.source);
    if (sh) lines.push(`      <sourceref hlink="${esc(sh)}"/>\n`);
    lines.push(noteRefs(model, c.notes, "      "));
    lines.push(objRefs(model, c.media, "      "));
    lines.push(attributesXml(c.attributes, "      ", "srcattribute"));
    lines.push("    </citation>\n");
  }
  lines.push("  </citations>\n");
  return lines.join("");
}

function emitSources(model) {
  const lines = ["  <sources>\n"];
  for (const s of Object.values(model.sources)) {
    lines.push(`    <source${objAttrs(s)}>\n`);
    lines.push(`      <stitle>${esc(s.title || "")}</stitle>\n`);
    if (s.author) lines.push(`      <sauthor>${esc(s.author)}</sauthor>\n`);
    if (s.pubinfo) lines.push(`      <spubinfo>${esc(s.pubinfo)}</spubinfo>\n`);
    if (s.abbrev) lines.push(`      <sabbrev>${esc(s.abbrev)}</sabbrev>\n`);
    lines.push(noteRefs(model, s.notes, "      "));
    lines.push(objRefs(model, s.media, "      "));
    lines.push(attributesXml(s.attributes, "      ", "srcattribute"));
    for (const r of s.repositories || []) {
      const h = handleOf(model, "repositories", r.id || r.ref);
      if (!h) continue;
      if (r.callno) lines.push(`      <reporef hlink="${esc(h)}"${attr("medium", r.medium)}>\n        <callno>${esc(r.callno)}</callno>\n      </reporef>\n`);
      else lines.push(`      <reporef hlink="${esc(h)}"${attr("medium", r.medium)}/>\n`);
    }
    lines.push("    </source>\n");
  }
  lines.push("  </sources>\n");
  return lines.join("");
}

function emitMedia(model) {
  const lines = ["  <objects>\n"];
  for (const m of Object.values(model.media)) {
    lines.push(`    <object${objAttrs(m)}>\n`);
    lines.push(`      <file${attr("src", m.src)}${attr("mime", m.mime)}${attr("checksum", m.checksum)}${attr("description", m.description)}/>\n`);
    lines.push(dateXml(m.date, "      "));
    lines.push(citeRefs(model, m.citations, "      "));
    lines.push(noteRefs(model, m.notes, "      "));
    lines.push(attributesXml(mapCiteHandles(model, m.attributes), "      "));
    lines.push(tagRefs(model, m.tags, "      "));
    lines.push("    </object>\n");
  }
  lines.push("  </objects>\n");
  return lines.join("");
}

function emitRepos(model) {
  const lines = ["  <repositories>\n"];
  for (const r of Object.values(model.repositories)) {
    lines.push(`    <repository${objAttrs(r)}>\n`);
    if (r.name) lines.push(`      <rname>${esc(r.name)}</rname>\n`);
    if (r.type) lines.push(`      <type>${esc(r.type)}</type>\n`);
    lines.push(urlsXml(r.urls, "      "));
    lines.push(noteRefs(model, r.notes, "      "));
    lines.push("    </repository>\n");
  }
  lines.push("  </repositories>\n");
  return lines.join("");
}

function emitNotes(model) {
  const lines = ["  <notes>\n"];
  for (const n of Object.values(model.notes)) {
    lines.push(`    <note${objAttrs(n)}${attr("type", n.type || "General")}${n.format && n.format !== "0" ? attr("format", n.format) : ""}>\n`);
    lines.push(`      <text>${esc(n.text || "")}</text>\n`);
    lines.push(tagRefs(model, n.tags, "      "));
    lines.push("    </note>\n");
  }
  lines.push("  </notes>\n");
  return lines.join("");
}

function emitTags(model) {
  const lines = ["  <tags>\n"];
  for (const t of Object.values(model.tags)) {
    lines.push(`    <tag${objAttrs(t)}${attr("name", t.name)}${attr("color", t.color)} priority="0"/>\n`);
  }
  lines.push("  </tags>\n");
  return lines.join("");
}

export function modelToGrampsXml(model) {
  const created = model.meta?.created || new Date().toISOString().slice(0, 10);
  const version = model.meta?.grampsVersion || "6.0.0";
  const researcher = model.meta?.researcher || "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE database PUBLIC "-//Gramps//DTD Gramps XML 1.7.2//EN"
"http://gramps-project.org/xml/1.7.2/grampsxml.dtd">
<database xmlns="http://gramps-project.org/xml/1.7.2/">
  <header>
    <created date="${esc(created)}" version="${esc(version)}"/>
    <researcher>
      <resname>${esc(researcher)}</resname>
    </researcher>
  </header>
${emitTags(model)}${emitEvents(model)}${emitPeople(model)}${emitFamilies(model)}${emitCitations(model)}${emitSources(model)}${emitPlaces(model)}${emitMedia(model)}${emitRepos(model)}${emitNotes(model)}</database>
`;
}

export function assertSafeExportPath(destPath) {
  const base = path.basename(destPath).toLowerCase();
  if (base === "data.gramps") throw new Error("Refusing to overwrite data.gramps");
  if (base === "data.ged" || base === "data.gedcom") throw new Error("Refusing to overwrite the primary tree file");
}

export function writeGrampsExport(model, destPath) {
  assertSafeExportPath(destPath);
  const xml = modelToGrampsXml(model);
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const tmp = `${destPath}.tmp`;
  fs.writeFileSync(tmp, xml, "utf8");
  fs.renameSync(tmp, destPath);
  return destPath;
}

export function exportStampName(prefix = "tree") {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `${prefix}-${stamp}.gramps`;
}
