/**
 * Export the append-only edit history to research/edit-log markdown.
 * Never writes a tree file.
 */
import fs from "node:fs";
import path from "node:path";
import { APP_ROOT } from "./trees.mjs";
import { escapeMd, localDate, localDateTime } from "./hint-export.mjs";

const TREE_EXT = new Set([".gramps", ".ged", ".gedcom"]);

function insideDir(dir, file) {
  const r = path.resolve(dir);
  const f = path.resolve(file);
  return f === r || f.toLowerCase().startsWith((r + path.sep).toLowerCase());
}

function relPath(from, to) {
  return path.relative(from, to).split(path.sep).join("/");
}

export function editLogDir({ treeId, projectRoot, appRoot = APP_ROOT } = {}) {
  if (treeId === "personal" && projectRoot) return path.resolve(projectRoot, "research", "edit-log");
  return path.resolve(appRoot || APP_ROOT, ".cache", "edit-log");
}

export function assertEditLogPath(dest, { appRoot = APP_ROOT, projectRoot = "" } = {}) {
  const file = path.resolve(dest);
  if (TREE_EXT.has(path.extname(file).toLowerCase())) throw new Error("refusing to write a tree file");
  if (path.basename(file).toLowerCase() === "data.gramps") throw new Error("refusing to write data.gramps");
  const allowed = [
    path.resolve(appRoot || APP_ROOT, ".cache", "edit-log"),
    projectRoot ? path.resolve(projectRoot, "research", "edit-log") : "",
  ].filter(Boolean);
  if (!allowed.some((dir) => insideDir(dir, file))) throw new Error("export path outside edit-log");
  if (projectRoot && insideDir(path.join(projectRoot, "data"), file)) throw new Error("refusing data/ write");
  return file;
}

export function formatHistoryLog(items, opts = {}) {
  const {
    model = null,
    treeTitle = "",
    treeId = "",
    exportedAt = new Date(),
  } = opts;
  const rows = items || [];
  const lines = [
    "# Edit history",
    "",
    `Exported ${localDateTime(exportedAt)} (local).`,
  ];
  if (treeTitle || treeId) lines.push(`Tree: ${treeTitle || treeId}${treeId ? ` (\`${treeId}\`)` : ""}`);
  lines.push(`Count: ${rows.length}`);
  lines.push("");
  lines.push("This log is a diary of saved edits. Undo marks a row undone; it does not delete it.");
  lines.push("The tree file (`data.gramps`) was not modified.");
  lines.push("");
  if (!rows.length) {
    lines.push("No edits recorded yet.");
    lines.push("");
    return lines.join("\n");
  }
  for (const row of rows) {
    const when = row.at ? row.at.replace("T", " ").replace(/\.\d+Z$/, "Z") : "";
    const names = (row.personIds || []).map((id) => {
      const p = model?.people?.[id];
      const name = p?.name || id;
      return `${name} (\`${id}\`)`;
    }).join(", ");
    const summary = escapeMd(row.summary || "Edited tree");
    const body = row.undone ? `~~${summary}~~ (undone)` : summary;
    lines.push(`- ${when} — ${body}${names ? ` · ${names}` : ""}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function writeHistoryLog(dest, markdown, roots = {}) {
  const file = assertEditLogPath(dest, roots);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, markdown.endsWith("\n") ? markdown : `${markdown}\n`, "utf8");
  fs.renameSync(tmp, file);
  return file;
}

export function exportHistoryLog({
  items,
  model,
  treeId,
  treeTitle,
  projectRoot,
  appRoot = APP_ROOT,
  when = new Date(),
} = {}) {
  const markdown = formatHistoryLog(items || [], { model, treeTitle, treeId, exportedAt: when });
  if (!(items || []).length) {
    return {
      ok: false,
      count: 0,
      path: "",
      relative: "",
      markdown,
      error: "No edits to export yet.",
    };
  }
  const stamp = localDate(when);
  const safeTree = String(treeId || "tree").replace(/[^a-zA-Z0-9._-]+/g, "-") || "tree";
  const dest = path.join(editLogDir({ treeId, projectRoot, appRoot }), `edit-log-${safeTree}-${stamp}.md`);
  const file = writeHistoryLog(dest, markdown, { appRoot, projectRoot });
  const relRoot = treeId === "personal" && projectRoot ? projectRoot : (appRoot || APP_ROOT);
  return {
    ok: true,
    count: items.length,
    path: file,
    relative: relPath(relRoot, file),
    markdown,
    error: "",
  };
}
