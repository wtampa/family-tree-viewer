/**
 * SQLite primary store. Gramps XML is import/export only — never written in place.
 * Uses Node's built-in node:sqlite (no native compile).
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { addDerived, emptyModel } from "./gramps-parse.mjs";
import { collectPersonIds, summarizeEdit } from "./edit-summary.mjs";

export const SCHEMA_VERSION = "1";

export const TABLES = [
  { kind: "person", table: "people" },
  { kind: "family", table: "families" },
  { kind: "event", table: "events" },
  { kind: "place", table: "places" },
  { kind: "citation", table: "citations" },
  { kind: "source", table: "sources" },
  { kind: "note", table: "notes" },
  { kind: "media", table: "media" },
  { kind: "repository", table: "repositories" },
  { kind: "tag", table: "tags" },
];

const KIND_BY_TABLE = Object.fromEntries(TABLES.map((t) => [t.table, t.kind]));
const TABLE_BY_KIND = Object.fromEntries(TABLES.map((t) => [t.kind, t.table]));

export function tableFor(kind) {
  const table = TABLE_BY_KIND[kind];
  if (!table) throw new Error(`unknown kind: ${kind}`);
  return table;
}

export function kindFor(table) {
  return KIND_BY_TABLE[table] || table;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
${TABLES.map((t) => `
CREATE TABLE IF NOT EXISTS ${t.table} (
  id TEXT PRIMARY KEY,
  handle TEXT,
  surname TEXT,
  change INTEGER,
  json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ${t.table}_handle ON ${t.table}(handle);
CREATE INDEX IF NOT EXISTS ${t.table}_surname ON ${t.table}(surname);
`).join("\n")}
CREATE TABLE IF NOT EXISTS changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  object_id TEXT NOT NULL,
  action TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT
);
CREATE INDEX IF NOT EXISTS changes_batch ON changes(batch_id);
CREATE TABLE IF NOT EXISTS history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  person_ids TEXT,
  undone INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS history_batch ON history(batch_id);
`;

function wrapDb(raw) {
  return {
    exec: (sql) => raw.exec(sql),
    prepare(sql) {
      const stmt = raw.prepare(sql);
      return {
        run: (...args) => stmt.run(...args),
        get: (...args) => stmt.get(...args),
        all: (...args) => stmt.all(...args),
      };
    },
    transaction(fn) {
      return (...args) => {
        raw.exec("BEGIN");
        try {
          const r = fn(...args);
          raw.exec("COMMIT");
          return r;
        } catch (e) {
          try { raw.exec("ROLLBACK"); } catch { /* ignore */ }
          throw e;
        }
      };
    },
    close: () => raw.close(),
  };
}

export function openDb(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const raw = new DatabaseSync(file);
  raw.exec("PRAGMA journal_mode = DELETE");
  raw.exec("PRAGMA foreign_keys = ON");
  raw.exec(SCHEMA);
  return wrapDb(raw);
}

export function getMeta(db, key, fallback = "") {
  const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key);
  return row ? row.value : fallback;
}

export function setMeta(db, key, value) {
  db.prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(key, value == null ? "" : String(value));
}

export function nowUnix() {
  return Math.floor(Date.now() / 1000);
}

export function newHandle() {
  return `_${crypto.randomUUID()}`;
}

export function nextId(model, prefix, table) {
  let max = 0;
  for (const id of Object.keys(model[table] || {})) {
    const m = String(id).match(new RegExp(`^${prefix}(\\d+)$`, "i"));
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

export function stripDerived(kind, obj) {
  if (!obj) return null;
  const o = { ...obj };
  if (kind === "person") delete o.eventsBack;
  if (kind === "event") { delete o.people; delete o.families; }
  if (kind === "citation") delete o.usedBy;
  if (kind === "source") delete o.citationCount;
  if (kind === "note") delete o.urls;
  return o;
}

export function applyPersonDisplayName(p) {
  const names = p.names || [];
  const withContent = names.filter((n) => n.first || n.surname);
  const primary = withContent.find((n) => !n.alt && n.type === "Birth Name" && n.first)
    || withContent.find((n) => !n.alt && n.first)
    || withContent.find((n) => n.first)
    || withContent[0]
    || names[0]
    || { first: "", surname: "", suffix: "" };
  p.first = primary.first || "";
  p.surname = primary.surname || "";
  p.suffix = primary.suffix || "";
  p.name = [p.first, p.surname, p.suffix].filter(Boolean).join(" ").trim() || "(unnamed)";
  return p;
}

export function upsertObject(db, kind, obj) {
  const table = tableFor(kind);
  const stripped = stripDerived(kind, obj);
  db.prepare(`INSERT INTO ${table} (id, handle, surname, change, json) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET handle=excluded.handle, surname=excluded.surname, change=excluded.change, json=excluded.json`)
    .run(obj.id, obj.handle || null, obj.surname || null, obj.change || nowUnix(), JSON.stringify(stripped));
}

export function deleteObject(db, kind, id) {
  db.prepare(`DELETE FROM ${tableFor(kind)} WHERE id = ?`).run(id);
}

export function importModel(db, model, { source = "" } = {}) {
  const tx = db.transaction(() => {
    for (const { table } of TABLES) db.exec(`DELETE FROM ${table}`);
    db.exec("DELETE FROM changes");
    try { db.exec("DELETE FROM history"); } catch { /* older dbs before history table */ }
    for (const { kind, table } of TABLES) {
      for (const obj of Object.values(model[table] || {})) {
        upsertObject(db, kind, obj);
      }
    }
    setMeta(db, "schema", SCHEMA_VERSION);
    setMeta(db, "importedFrom", source);
    setMeta(db, "importedAt", new Date().toISOString());
    setMeta(db, "researcher", model.meta?.researcher || "");
    setMeta(db, "created", model.meta?.created || "");
    setMeta(db, "grampsVersion", model.meta?.grampsVersion || "");
    setMeta(db, "metaJson", JSON.stringify({
      created: model.meta?.created || "",
      grampsVersion: model.meta?.grampsVersion || "",
      researcher: model.meta?.researcher || "",
    }));
  });
  tx();
}

export function loadModelFromDb(db) {
  const model = emptyModel({
    store: "sqlite",
    created: getMeta(db, "created"),
    grampsVersion: getMeta(db, "grampsVersion"),
    researcher: getMeta(db, "researcher"),
  });
  const extra = getMeta(db, "metaJson");
  if (extra) {
    try { Object.assign(model.meta, JSON.parse(extra)); } catch { /* ignore */ }
  }
  model.meta.store = "sqlite";
  for (const { table } of TABLES) {
    const rows = db.prepare(`SELECT json FROM ${table}`).all();
    for (const row of rows) {
      const obj = JSON.parse(row.json);
      if (!obj?.id) continue;
      model[table][obj.id] = obj;
      if (obj.handle) model.handleToId[obj.handle] = obj.id;
    }
  }
  addDerived(model);
  return model;
}

export function recordChanges(db, batchId, entries) {
  const ins = db.prepare(
    "INSERT INTO changes (at, batch_id, kind, object_id, action, before_json, after_json) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  const at = new Date().toISOString();
  for (const e of entries) {
    ins.run(at, batchId, e.kind, e.id, e.action, e.before ? JSON.stringify(e.before) : null, e.after ? JSON.stringify(e.after) : null);
  }
}

export function changeCount(db) {
  const row = db.prepare("SELECT COUNT(*) AS n FROM changes").get();
  return row?.n || 0;
}

export function undoLast(db) {
  const last = db.prepare("SELECT batch_id FROM changes ORDER BY id DESC LIMIT 1").get();
  if (!last) return { ok: false, error: "Nothing to undo" };
  const rows = db.prepare("SELECT * FROM changes WHERE batch_id = ? ORDER BY id DESC").all(last.batch_id);
  const tx = db.transaction(() => {
    for (const row of rows) {
      if (row.before_json) upsertObject(db, row.kind, JSON.parse(row.before_json));
      else deleteObject(db, row.kind, row.object_id);
    }
    db.prepare("DELETE FROM changes WHERE batch_id = ?").run(last.batch_id);
    db.prepare("UPDATE history SET undone = 1 WHERE batch_id = ?").run(last.batch_id);
  });
  tx();
  return { ok: true, count: rows.length, batchId: last.batch_id };
}

export function recordHistory(db, { batchId, summary, personIds = [] }) {
  db.prepare("INSERT INTO history (at, batch_id, summary, person_ids, undone) VALUES (?, ?, ?, ?, 0)")
    .run(new Date().toISOString(), batchId, summary || "Edited tree", JSON.stringify(personIds || []));
}

export function listHistory(db, { limit = 400 } = {}) {
  const rows = db.prepare("SELECT id, at, batch_id, summary, person_ids, undone FROM history ORDER BY id DESC LIMIT ?").all(limit);
  return rows.map((row) => {
    let personIds = [];
    try { personIds = JSON.parse(row.person_ids || "[]"); } catch { personIds = []; }
    return {
      id: row.id,
      at: row.at,
      batchId: row.batch_id,
      summary: row.summary,
      personIds: Array.isArray(personIds) ? personIds : [],
      undone: !!row.undone,
    };
  });
}

export function historyCount(db) {
  const row = db.prepare("SELECT COUNT(*) AS n FROM history").get();
  return row?.n || 0;
}

export function applyEdit(db, mutator, meta = {}) {
  const model = loadModelFromDb(db);
  const batchId = crypto.randomUUID();
  const touched = new Map();
  const ctx = {
    model,
    touch(kind, id) {
      const key = `${kind}:${id}`;
      if (touched.has(key)) return;
      const table = tableFor(kind);
      const cur = model[table][id];
      touched.set(key, { kind, id, before: cur ? JSON.parse(JSON.stringify(stripDerived(kind, cur))) : null });
    },
  };
  const result = mutator(ctx) || {};
  addDerived(model);
  const entries = [];
  const tx = db.transaction(() => {
    for (const t of touched.values()) {
      const afterObj = model[tableFor(t.kind)][t.id] || null;
      const after = afterObj ? stripDerived(t.kind, afterObj) : null;
      if (after) upsertObject(db, t.kind, after);
      else deleteObject(db, t.kind, t.id);
      entries.push({
        kind: t.kind,
        id: t.id,
        action: after ? (t.before ? "update" : "insert") : "delete",
        before: t.before,
        after,
      });
    }
    recordChanges(db, batchId, entries);
    const summary = summarizeEdit(meta.kind, meta.body || {}, result, entries, model);
    const personIds = collectPersonIds(meta.kind, meta.body || {}, result, entries);
    recordHistory(db, { batchId, summary, personIds });
  });
  tx();
  return { ...result, batchId, changed: [...touched.keys()] };
}

export function personalDbPath(root) {
  return path.join(root, "data", "tree.db");
}

export function personalExportDir(root) {
  return path.join(root, "data", "exports");
}

export function personalBackupDir(root) {
  return path.join(root, "data", "backups");
}

export function rotateBackups(dbPath, destDir, keep = 20) {
  if (!fs.existsSync(dbPath)) return "";
  fs.mkdirSync(destDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const dest = path.join(destDir, `tree-${stamp}.db`);
  fs.copyFileSync(dbPath, dest);
  const files = fs.readdirSync(destDir).filter((f) => /^tree-.*\.db$/.test(f)).sort().reverse();
  for (const extra of files.slice(keep)) {
    try { fs.unlinkSync(path.join(destDir, extra)); } catch { /* ignore */ }
  }
  return dest;
}

/** One-time import: create tree.db from a Gramps file. Never overwrites an existing db. */
export function ensureImported(dbPath, grampsFile, { loadGramps } = {}) {
  if (fs.existsSync(dbPath)) return { created: false, dbPath };
  if (!grampsFile || !fs.existsSync(grampsFile)) {
    throw new Error("No tree.db and no Gramps file to import");
  }
  if (/data\.gramps$/i.test(dbPath)) throw new Error("Refusing to use data.gramps as the database path");
  const load = loadGramps || (async () => { throw new Error("loadGramps required"); });
  const model = load(grampsFile);
  const db = openDb(dbPath);
  try { importModel(db, model, { source: grampsFile }); }
  finally { db.close(); }
  return { created: true, dbPath, source: grampsFile };
}
