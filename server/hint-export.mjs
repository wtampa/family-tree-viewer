/**
 * Export pinned (and optionally open ancestor) hints to research-log markdown.
 * Writes a sidecar log only — never the Gramps / GEDCOM file.
 */
import fs from "node:fs";
import path from "node:path";
import { APP_ROOT } from "./trees.mjs";

export const HINT_LABEL = {
  "brick-wall": "Brick wall",
  "missing-birth": "Missing birth",
  "missing-birthplace": "Missing birthplace",
  "missing-death": "Missing death",
  "missing-marriage": "Missing marriage",
  "missing-spouse": "Missing spouse",
  uncited: "Uncited",
  "member-tree-only": "Member-tree only",
  conflict: "Conflict",
  duplicate: "Possible duplicate",
};

const TREE_EXT = new Set([".gramps", ".ged", ".gedcom"]);

export function localDate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function localDateTime(d = new Date()) {
  return `${localDate(d)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function selectHints(hints, { includeOpenAncestors = false } = {}) {
  return (hints || []).filter((h) => {
    if (h.state === "pinned") return true;
    if (includeOpenAncestors && h.state === "open" && h.isAncestor) return true;
    return false;
  });
}

/** Flatten and escape user/engine text so it cannot break the log structure. */
export function escapeMd(s) {
  return String(s || "")
    .replace(/\r?\n/g, " ")
    .replace(/[\\`*_[\]<>#]/g, (ch) => `\\${ch}`);
}

export function personName(model, personId) {
  const p = model?.people?.[personId];
  if (p?.name) return p.name;
  if (p?.first || p?.surname) return [p.first, p.surname].filter(Boolean).join(" ");
  return personId || "";
}

export function nextRecord(hint) {
  if (hint?.wall?.nextRecord) return String(hint.wall.nextRecord);
  const first = (hint?.suggestedRecords || []).find(Boolean);
  return first ? String(first) : "";
}

function relPath(from, to) {
  return path.relative(from, to).split(path.sep).join("/");
}

export function formatHintLog(hints, opts = {}) {
  const {
    model = null,
    treeTitle = "",
    treeId = "",
    homeId = "",
    includeOpenAncestors = false,
    exportedAt = new Date(),
  } = opts;
  const selected = hints || [];
  const scope = includeOpenAncestors ? "pinned + open ancestor hints" : "pinned hints";
  const home = homeId ? personName(model, homeId) : "";
  const lines = [
    "# Research hint log",
    "",
    `Exported ${localDateTime(exportedAt)} (local).`,
  ];
  if (treeTitle || treeId) lines.push(`Tree: ${treeTitle || treeId}${treeId ? ` (\`${treeId}\`)` : ""}`);
  if (homeId) lines.push(`Home: ${home} (\`${homeId}\`)`);
  lines.push(`Scope: ${scope}`);
  lines.push(`Count: ${selected.length}`);
  lines.push("");
  lines.push("The tree file was not modified. These lines come from the hint engine and your pin state.");
  lines.push("");

  if (!selected.length) {
    lines.push("Nothing to export. Pin a hint first, or include open ancestor hints.");
    lines.push("");
    return lines.join("\n");
  }

  const groups = [];
  const byPerson = new Map();
  for (const h of selected) {
    const id = h.personId || "";
    if (!byPerson.has(id)) {
      const g = { personId: id, hints: [] };
      byPerson.set(id, g);
      groups.push(g);
    }
    byPerson.get(id).hints.push(h);
  }

  for (const g of groups) {
    const name = personName(model, g.personId);
    lines.push("---");
    lines.push("");
    lines.push(`## ${escapeMd(name)} (\`${g.personId}\`)`);
    lines.push("");
    for (const h of g.hints) {
      const label = HINT_LABEL[h.type] || h.type || "Hint";
      lines.push(`### ${label} — ${escapeMd(h.title || "")}`);
      lines.push(`- **State:** ${h.state || "open"}`);
      if (h.why) lines.push(`- **Why:** ${escapeMd(h.why)}`);
      const next = nextRecord(h);
      if (next) lines.push(`- **Next record:** ${escapeMd(next)}`);
      if (h.wall?.missing) lines.push(`- **Missing:** ${escapeMd(h.wall.missing)}`);
      if (h.stateNote) lines.push(`- **Note:** ${escapeMd(h.stateNote)}`);
      if (h.suggestedRecords?.length) {
        lines.push("- **Suggested records:**");
        for (const r of h.suggestedRecords) lines.push(`  - ${escapeMd(r)}`);
      }
      if (h.searchLinks?.length) {
        lines.push("- **Search:**");
        for (const l of h.searchLinks) {
          const lab = l.label || l.url || "link";
          const url = l.url || "";
          if (l.local || (url && url.startsWith("/"))) {
            lines.push(`  - ${escapeMd(lab)}${url ? ` (\`${url}\`)` : ""}`);
          } else if (url) {
            lines.push(`  - [${escapeMd(lab)}](${url})`);
          } else {
            lines.push(`  - ${escapeMd(lab)}`);
          }
        }
      }
      lines.push("");
    }
  }
  return lines.join("\n");
}

function insideDir(dir, file) {
  const r = path.resolve(dir);
  const f = path.resolve(file);
  return f === r || f.toLowerCase().startsWith((r + path.sep).toLowerCase());
}

export function hintLogDir({ treeId, projectRoot, appRoot = APP_ROOT } = {}) {
  if (treeId === "personal" && projectRoot) return path.resolve(projectRoot, "research", "hint-log");
  return path.resolve(appRoot || APP_ROOT, ".cache", "hint-log");
}

export function resolveExportPath({ treeId, projectRoot, appRoot = APP_ROOT, when = new Date() } = {}) {
  const stamp = localDate(when);
  const safeTree = String(treeId || "tree").replace(/[^a-zA-Z0-9._-]+/g, "-") || "tree";
  const dest = path.join(hintLogDir({ treeId, projectRoot, appRoot }), `hint-export-${safeTree}-${stamp}.md`);
  return assertSafeExportPath(dest, { appRoot, projectRoot });
}

export function assertSafeExportPath(dest, { appRoot = APP_ROOT, projectRoot = "" } = {}) {
  const file = path.resolve(dest);
  if (TREE_EXT.has(path.extname(file).toLowerCase())) throw new Error("refusing to write a tree file");
  if (path.basename(file).toLowerCase() === "data.gramps") throw new Error("refusing to write data.gramps");
  const allowed = [
    path.resolve(appRoot || APP_ROOT, ".cache", "hint-log"),
    projectRoot ? path.resolve(projectRoot, "research", "hint-log") : "",
  ].filter(Boolean);
  if (!allowed.some((dir) => insideDir(dir, file))) throw new Error("export path outside hint-log");
  if (projectRoot && insideDir(path.join(projectRoot, "data"), file)) throw new Error("refusing data/ write");
  return file;
}

export function writeHintLog(dest, markdown, roots = {}) {
  const file = assertSafeExportPath(dest, roots);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, markdown.endsWith("\n") ? markdown : `${markdown}\n`, "utf8");
  fs.renameSync(tmp, file);
  return file;
}

export function exportHintLog({
  hints,
  model,
  treeId,
  treeTitle,
  homeId,
  includeOpenAncestors = false,
  projectRoot,
  appRoot = APP_ROOT,
  when = new Date(),
} = {}) {
  const selected = selectHints(hints, { includeOpenAncestors });
  const markdown = formatHintLog(selected, {
    model,
    treeTitle,
    treeId,
    homeId,
    includeOpenAncestors,
    exportedAt: when,
  });
  if (!selected.length) {
    return {
      ok: false,
      count: 0,
      path: "",
      relative: "",
      markdown,
      error: "Nothing to export. Pin a hint first, or include open ancestor hints.",
    };
  }
  const dest = resolveExportPath({ treeId, projectRoot, appRoot, when });
  const file = writeHintLog(dest, markdown, { appRoot, projectRoot });
  const relRoot = treeId === "personal" && projectRoot ? projectRoot : (appRoot || APP_ROOT);
  return {
    ok: true,
    count: selected.length,
    path: file,
    relative: relPath(relRoot, file),
    markdown,
    error: "",
  };
}
