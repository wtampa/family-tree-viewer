/**
 * Human summaries for the append-only edit history. Kept out of db.mjs / edit.mjs
 * so those two do not import each other.
 */

function baseName(p) {
  return String(p || "").replace(/\\/g, "/").split("/").filter(Boolean).pop() || "file";
}

function personLabel(model, id) {
  const p = model?.people?.[id];
  if (!p) return id || "";
  if (p.name && p.name !== "(unnamed)") return `${p.name} (${id})`;
  const assembled = [p.first, p.surname].filter(Boolean).join(" ");
  return assembled ? `${assembled} (${id})` : id;
}

export function collectPersonIds(kind, body = {}, result = {}, entries = []) {
  const ids = new Set();
  if (body.personId) ids.add(body.personId);
  if (kind === "person" && body.id) ids.add(body.id);
  if ((kind === "person" || kind === "relative") && result.id) ids.add(result.id);
  if (result.personId) ids.add(result.personId);
  for (const e of entries) if (e.kind === "person" && e.id) ids.add(e.id);
  return [...ids];
}

export function summarizeEdit(kind, body = {}, result = {}, entries = [], model = null) {
  const who = (id) => personLabel(model, id);
  if (kind === "media") {
    const personId = body.personId || result.personId;
    const label = who(personId);
    const action = result.action || body.action || "attach";
    const file = body.description || baseName(body.src || body.path || "");
    if (action === "detach") return `Detached media from ${label}`;
    if (action === "portrait") return `Set portrait for ${label}`;
    return `Attached ${file || "photo"} to ${label}`;
  }
  if (kind === "person") {
    const id = body.id || result.id;
    return body.id ? `Updated ${who(id)}` : `Added person ${who(id)}`;
  }
  if (kind === "relative") {
    const role = body.role || "relative";
    const child = result.id ? who(result.id) : [body.first, body.surname].filter(Boolean).join(" ") || "(unnamed)";
    return `Added ${role} ${child} to ${who(body.personId)}`;
  }
  if (kind === "event") {
    if (body.delete) return `Removed event ${body.id || ""}`.trim();
    const target = body.personId ? who(body.personId) : (body.familyId || "tree");
    return `${body.id ? "Updated" : "Added"} ${body.type || "event"} for ${target}`;
  }
  if (kind === "note") return body.id ? `Updated note ${body.id}` : `Added note to ${who(body.personId) || body.eventId || "tree"}`;
  if (kind === "source") return body.id ? `Updated source ${body.title || body.id}` : `Added source ${body.title || result.id || ""}`.trim();
  if (kind === "citation") return `Attached citation to ${body.attach?.kind || "record"} ${body.attach?.id || ""}`.trim();
  if (kind === "family") return `Updated family ${body.id || result.id || ""}`.trim();
  const first = entries[0];
  if (first) return `${first.action} ${first.kind} ${first.id}`;
  return "Edited tree";
}
