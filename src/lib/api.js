const SERVER_HINT = "Family Tree server is not running. Double-click Open Family Tree.bat, or run npm run serve.";

async function get(url) {
  let r;
  try { r = await fetch(url, { cache: "no-store" }); } catch { throw new Error(SERVER_HINT); }
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return r.json();
}
async function fail(r, url) {
  let extra = "";
  try { extra = (await r.json()).error || ""; } catch { extra = ""; }
  throw new Error(extra || `${url} → ${r.status}`);
}

async function post(url, body) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) });
  if (!r.ok) await fail(r, url);
  return r.json();
}

async function postForm(url, form) {
  const r = await fetch(url, { method: "POST", body: form });
  if (!r.ok) await fail(r, url);
  return r.json();
}

export const api = {
  version: () => get("/api/version"),
  tree: () => get("/api/tree"),
  hints: () => get("/api/hints"),
  setHintState: (id, state, note) => post("/api/hints-state", { id, state, note }),
  exportHints: (opts) => post("/api/hints-export", opts || {}),
  links: () => get("/api/links"),
  addLink: (personId, add) => post("/api/links", { personId, add }),
  removeLink: (personId, remove) => post("/api/links", { personId, remove }),
  preview: (url) => get(`/api/preview?url=${encodeURIComponent(url)}`),
  files: (q) => get(`/api/files?q=${encodeURIComponent(q || "")}`),
  trees: () => get("/api/trees"),
  setHome: (homeId) => post("/api/settings", { homeId }),
  setTree: (treeId) => post("/api/settings", { treeId }),
  setHideLiving: (hideLiving) => post("/api/settings", { hideLiving }),
  reload: () => post("/api/reload"),
  openFile: (p) => post("/api/open", { p }),
  setMediaMap: (mediaId, path) => post("/api/media-map", { mediaId, path }),
  fileUrl: (p) => `/api/file?p=${encodeURIComponent(p)}`,
  edit: (kind, body) => post(`/api/edit/${kind}`, body || {}),
  ingestMedia: (form) => postForm("/api/ingest-media", form),
  undo: () => post("/api/undo"),
  exportGramps: () => post("/api/export-gramps"),
  exportGedcom: () => post("/api/export-gedcom"),
  exportShare: () => post("/api/export-share"),
  history: () => get("/api/history"),
  exportHistory: () => post("/api/history-export"),
};
