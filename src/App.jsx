import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { api } from "./lib/api.js";
import { TreeModel } from "./lib/model.js";
import { VIEWS } from "./lib/views.js";
import { confidenceColor } from "./lib/color.js";
import ChartView from "./views/ChartView.jsx";
import PersonDrawer from "./components/PersonDrawer.jsx";
import CommandPalette from "./components/CommandPalette.jsx";
import LinkPreview from "./components/LinkPreview.jsx";
import Portrait from "./components/Portrait.jsx";

const FanView = lazy(() => import("./views/FanView.jsx"));
const TimelineView = lazy(() => import("./views/TimelineView.jsx"));
const HiveView = lazy(() => import("./views/HiveView.jsx"));
const SourcesView = lazy(() => import("./views/SourcesView.jsx"));
const HintsView = lazy(() => import("./views/HintsView.jsx"));
const HistoryView = lazy(() => import("./views/HistoryView.jsx"));

const LS = {
  get(k, d) { try { const v = localStorage.getItem(`ftv:${k}`); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(`ftv:${k}`, JSON.stringify(v)); } catch { /* ignore */ } },
};

function bootQuery() {
  try {
    const q = new URLSearchParams(window.location.search);
    const view = q.get("view") || "";
    const known = VIEWS.some((v) => v.id === view);
    const depth = Number(q.get("depth") || 0);
    return {
      tree: q.get("tree") || "",
      view: known ? view : "",
      person: q.get("person") || "",
      depth: depth >= 1 && depth <= 8 ? depth : 0,
    };
  } catch { return { tree: "", view: "", person: "" }; }
}
const BOOT = bootQuery();

function BootFallback() {
  return (
    <div className="boot">
      <img src="/tree-icon.png" alt="" width="96" />
      <h1>Family Tree</h1>
      <p>Loading tree…</p>
    </div>
  );
}

export default function App() {
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState("");
  const [view, setView] = useState(() => BOOT.view || LS.get("view", "pedigree"));
  const [rootId, setRootId] = useState(() => LS.get("root", null));
  const [selected, setSelected] = useState(null);
  const [hover, setHover] = useState(null);
  const [linkHover, setLinkHover] = useState(null);
  const [query, setQuery] = useState("");
  const [palette, setPalette] = useState(false);
  const [hints, setHints] = useState(null);
  const [hintsLoading, setHintsLoading] = useState(false);
  const [history, setHistory] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [recent, setRecent] = useState(() => LS.get("recent", []));
  const [chartSettings, setChartSettings] = useState(() => ({ ancestry: BOOT.depth || 4, progeny: BOOT.depth || 3, siblings: true, horizontal: false, compact: false, ...LS.get("chart", {}), ...(BOOT.depth ? { ancestry: BOOT.depth, progeny: BOOT.depth } : {}) }));
  const [toast, setToast] = useState("");
  const [relateTo, setRelateTo] = useState(null);
  const [trees, setTrees] = useState([]);
  const [treeId, setTreeId] = useState("");
  const [treeOpen, setTreeOpen] = useState(false);
  const treePickRef = useRef(null);
  const exportRef = useRef(null);
  const versionRef = useRef(0);
  const [hiveSeen, setHiveSeen] = useState(() => (BOOT.view || LS.get("view", "pedigree")) === "hive");
  const bootTree = useRef(false);
  const [editing, setEditing] = useState(false);

  const model = useMemo(() => (payload ? new TreeModel(payload) : null), [payload]);

  const load = useCallback(async () => {
    try {
      const [p, t] = await Promise.all([api.tree(), api.trees().catch(() => ({ trees: [], active: "" }))]);
      if (p.error) throw new Error(p.error);
      versionRef.current = p.version;
      setPayload(p);
      setTrees(t.trees || []);
      setTreeId(p.settings?.treeId || t.active || "");
      setError("");
    } catch (e) { setError(e.message); }
  }, []);

  const loadHints = useCallback(async () => {
    setHintsLoading(true);
    try { const h = await api.hints(); setHints(h.hints || []); } catch (e) { setToast(e.message); } finally { setHintsLoading(false); }
  }, []);
  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try { const h = await api.history(); setHistory(h.items || []); } catch (e) { setToast(e.message); } finally { setHistoryLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!model) return;
    if (view !== "hints" && !selected) return;
    if (hints || hintsLoading) return;
    loadHints();
  }, [model, view, selected, hints, hintsLoading, loadHints]);
  useEffect(() => {
    if (!model || view !== "history") return;
    if (history || historyLoading) return;
    loadHistory();
  }, [model, view, history, historyLoading, loadHistory]);

  // live reload when data.gramps changes
  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const v = await api.version();
        if (v.version && versionRef.current && v.version !== versionRef.current) {
          await load();
          setHints(null);
          setToast("Tree reloaded from disk");
        }
      } catch { /* server away */ }
    }, 5000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 3500); return () => clearTimeout(t); }, [toast]);

  // defaults once model arrives
  useEffect(() => {
    if (!model) return;
    if (!rootId || !model.person(rootId)) setRootId(model.homeId);
  }, [model, rootId]);

  useEffect(() => {
    if (!treeOpen) return;
    const onDoc = (e) => { if (!treePickRef.current?.contains(e.target)) setTreeOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setTreeOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [treeOpen]);

  useEffect(() => { LS.set("view", view); }, [view]);
  useEffect(() => { if (view === "hive") setHiveSeen(true); }, [view]);
  useEffect(() => { if (rootId) LS.set("root", rootId); }, [rootId]);
  useEffect(() => { LS.set("chart", chartSettings); }, [chartSettings]);
  useEffect(() => { LS.set("recent", recent.slice(0, 12)); }, [recent]);

  const openPerson = useCallback((id) => {
    setSelected(id);
    setRecent((r) => [id, ...r.filter((x) => x !== id)].slice(0, 12));
  }, []);
  const onSelect = useCallback((id, { reroot } = {}) => {
    openPerson(id);
    if (reroot) setRootId(id);
  }, [openPerson]);
  const goView = useCallback((v, pid) => { setView(v); if (pid) setRootId(pid); }, []);
  const setHome = useCallback(async (pid) => {
    await api.setHome(pid);
    await load();
    setHints(null);
    setToast(`Home person is now ${model?.person(pid)?.name || pid}`);
  }, [load, model]);
  const setPrivacy = useCallback(async (hide) => {
    try {
      await api.setHideLiving(hide);
      setHints(null);
      await load();
      setToast(hide ? "Living names and portraits hidden" : "Living people unlocked");
    } catch (e) { setToast(e.message); }
  }, [load]);
  const switchTree = useCallback(async (id) => {
    if (!id || id === treeId) return;
    try {
      setPayload(null);
      setRootId(null);
      setSelected(null);
      setRecent([]);
      setHints(null);
      setHistory(null);
      LS.set("root", null);
      await api.setTree(id);
      await load();
      const label = trees.find((t) => t.id === id)?.title || id;
      setToast(`Showing ${label}`);
    } catch (e) { setToast(e.message); }
  }, [treeId, trees, load]);
  useEffect(() => {
    if (bootTree.current || !BOOT.tree || !trees.length) return;
    if (!trees.some((t) => t.id === BOOT.tree)) return;
    bootTree.current = true;
    if (BOOT.tree !== treeId) switchTree(BOOT.tree);
  }, [trees, treeId, switchTree]);
  useEffect(() => {
    if (!model || !BOOT.person) return;
    const id = BOOT.person === "home" ? model.homeId : BOOT.person;
    if (id && model.person(id)) openPerson(id);
  }, [model, openPerson]);
  const hintState = useCallback(async (id, state) => {
    await api.setHintState(id, state);
    setHints((hs) => (hs || []).map((h) => (h.id === id ? { ...h, state, priority: state === "pinned" ? h.priority + 100 : h.state === "pinned" ? h.priority - 100 : h.priority } : h)).sort((a, b) => b.priority - a.priority));
  }, []);
  const linksChange = useCallback((all) => setPayload((p) => (p ? { ...p, links: all } : p)), []);
  const editable = Boolean(model?.settings?.editable);
  useEffect(() => { if (!editable) setEditing(false); }, [editable]);
  const editTree = useCallback(async (kind, body) => {
    const r = await api.edit(kind, body);
    setHints(null);
    setHistory(null);
    await load();
    setToast("Saved to the local database");
    return r;
  }, [load]);
  const ingestMedia = useCallback(async (form) => {
    try {
      const r = await api.ingestMedia(form);
      setHints(null);
      setHistory(null);
      await load();
      setToast(`Copied to ${r.relative || "the research folder"}`);
      return r;
    } catch (e) {
      const msg = String(e.message || e);
      setToast(/404|unknown api/i.test(msg)
        ? "Close Family Tree and open it again from the desktop icon — the server is still the old one."
        : msg);
      throw e;
    }
  }, [load]);
  const undoEdit = useCallback(async () => {
    try {
      await api.undo();
      setHints(null);
      setHistory(null);
      await load();
      setToast("Undid last change");
    } catch (e) { setToast(e.message); }
  }, [load]);
  const exportGramps = useCallback(async () => {
    try {
      const r = await api.exportGramps();
      setToast(`Exported ${r.relative || "Gramps XML"}`);
    } catch (e) { setToast(e.message); }
  }, []);
  const exportGedcom = useCallback(async () => {
    try {
      const r = await api.exportGedcom();
      setToast(`Exported ${r.relative || "GEDCOM"} — import that file on Ancestry (photos stay local)`);
    } catch (e) { setToast(e.message); }
  }, []);
  const exportShare = useCallback(async () => {
    try {
      const r = await api.exportShare();
      setToast(`Share pack → ${r.relative || r.path} (living redacted: ${r.livingRedacted})`);
      window.open("/share/", "_blank");
    } catch (e) { setToast(e.message); }
  }, []);

  const hoverP = hover && model ? model.person(hover) : null;
  const kinPeek = useMemo(() => {
    if (!hoverP || !hover) return "";
    if (model.homeId === hover) return "home person";
    return model.kinship(model.homeId, hover);
  }, [model, hover, hoverP]);

  // keyboard
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target?.tagName || "").toLowerCase();
      const typing = tag === "input" || tag === "textarea" || e.target?.isContentEditable;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette((p) => !p); return; }
      if (e.key === "Escape") { if (palette) setPalette(false); else if (selected) setSelected(null); return; }
      if (typing) return;
      if (e.key === "/") { e.preventDefault(); setPalette(true); return; }
      const v = VIEWS.find((x) => x.key === e.key);
      if (v) { setView(v.id); return; }
      if (e.key.toLowerCase() === "h" && model) { setRootId(model.homeId); openPerson(model.homeId); return; }
      if (e.key.toLowerCase() === "p") { window.print(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [palette, selected, model, openPerson]);

  const exportPng = async () => {
    const ref = exportRef.current;
    if (!ref?.node?.()) { setToast("Nothing to export in this view"); return; }
    try {
      const node = ref.node();
      const { toPng } = await import("html-to-image");
      let dataUrl;
      if (node.tagName === "CANVAS") dataUrl = node.toDataURL("image/png");
      else dataUrl = await toPng(node, { backgroundColor: "#0b0f14", pixelRatio: 2, cacheBust: true });
      const a = document.createElement("a");
      a.href = dataUrl; a.download = `family-tree-${view}-${model?.person(rootId)?.name?.replace(/\s+/g, "_") || "root"}.png`; a.click();
    } catch (e) { setToast(`Export failed: ${e.message}`); }
  };
  const exportSvg = () => {
    const ref = exportRef.current;
    const node = ref?.node?.();
    if (!node || node.tagName !== "svg") { setToast("SVG export is available for Fan and Timeline"); return; }
    const clone = node.cloneNode(true);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("style", "background:#0b0f14;font-family:Inter,Segoe UI,sans-serif");
    const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `family-tree-${view}.svg`; a.click();
  };

  if (error && !model) {
    return (
      <div className="boot">
        <img src="/tree-icon.png" alt="" width="96" />
        <h1>Family Tree</h1>
        <p className="err">{error}</p>
        <button type="button" onClick={load}>Retry</button>
      </div>
    );
  }
  const root = model?.person(rootId);
  if (!model || !root) return <BootFallback />;
  const openHintCount = hints
    ? hints.filter((h) => h.state === "open" || h.state === "pinned").filter((h) => h.isAncestor && (h.type === "brick-wall" || h.type === "conflict")).length
    : (payload?.hintBadge || 0);

  return (
    <div className={`app ${selected ? "with-drawer" : ""}`}>
      <header className="topbar">
        <div className="brand" onClick={() => { setRootId(model.homeId); }} title="Home person">
          <img src="/tree-icon.png" alt="" />
          <div>
            <b>Family Tree</b>
            <span>{model.m.meta.counts.people} people · {model.m.meta.counts.families} families</span>
          </div>
        </div>
        {trees.length > 1 ? (
          <div className="tree-pick" ref={treePickRef}>
            <span className="muted small">Tree</span>
            <button type="button" className="tree-pick-btn" aria-expanded={treeOpen} aria-haspopup="listbox" onClick={() => setTreeOpen((o) => !o)} title="Switch family tree">
              <span>{trees.find((t) => t.id === treeId)?.title || "Tree"}</span>
              <em aria-hidden>▾</em>
            </button>
            {treeOpen ? (
              <ul className="tree-menu" role="listbox" aria-label="Family trees">
                {trees.map((t) => (
                  <li key={t.id} role="option" aria-selected={t.id === treeId}>
                    <button type="button" className={t.id === treeId ? "on" : ""} onClick={() => { switchTree(t.id); setTreeOpen(false); }}>
                      {t.title}
                      {t.local ? <span className="muted"> local</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        <nav className="tabs">
          {VIEWS.map((v) => (
            <button type="button" key={v.id} className={view === v.id ? "on" : ""} onClick={() => setView(v.id)} title={`${v.desc} (${v.key})`}>
              {v.label}{v.id === "hints" && openHintCount ? <em>{openHintCount}</em> : null}
            </button>
          ))}
        </nav>
        <div className="root-chip" onClick={() => openPerson(rootId)} title="Current root — click for details">
          <Portrait model={model} pid={rootId} size={34} />
          <div><b>{root.name}</b><span>{model.years(rootId) || "root"}{rootId === model.homeId ? " · home" : ""}</span></div>
        </div>
        <div className="search">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter / dim (hive) …  Ctrl+K to search" onKeyDown={(e) => { if (e.key === "Enter") { const r = model.search(query, 1)[0]; if (r) openPerson(r); } }} />
          {query ? <button type="button" className="clear" onClick={() => setQuery("")}>×</button> : null}
        </div>
        <div className="top-actions">
          {editable ? (
            <>
              <button
                type="button"
                className={`edit-btn ${editing ? "on" : ""}`}
                onClick={() => setEditing((v) => !v)}
                title="Edit the local SQLite tree. Sample trees stay read-only."
              >
                {editing ? "Editing" : "Edit"}
              </button>
              <button type="button" disabled={!model.settings?.canUndo} onClick={undoEdit} title="Undo the last saved change">Undo</button>
              <button type="button" onClick={exportGramps} title="Write a new timestamped Gramps XML file. Never overwrites data.gramps.">Export XML</button>
              <button type="button" onClick={exportGedcom} title="Write a new timestamped GEDCOM for Ancestry import. Photos do not travel with the file.">Export GEDCOM</button>
            </>
          ) : null}
          <button type="button" onClick={exportShare} title="Export a read-only static pack (living always redacted) and open the preview at /share/.">Share view</button>
          <button
            type="button"
            className={`privacy-btn ${model.hideLiving ? "on" : ""}`}
            onClick={() => setPrivacy(!model.hideLiving)}
            title={model.hideLiving
              ? `Living people are hidden (${model.livingCount}). Click to unlock names and portraits.`
              : `Living people are visible (${model.livingCount}). Click to hide names and portraits.`}
          >
            {model.hideLiving ? "Living hidden" : "Living shown"}
          </button>
          <button type="button" onClick={() => setPalette(true)} title="Search (Ctrl+K)">⌕</button>
          <button type="button" onClick={exportPng} title="Export PNG">PNG</button>
          <button type="button" onClick={exportSvg} title="Export SVG (Fan, Timeline)">SVG</button>
          <button type="button" onClick={() => window.print()} title="Print (P)">Print</button>
        </div>
      </header>

      {recent.length > 1 ? (
        <div className="crumbs">
          <span className="muted small">Recent</span>
          {recent.slice(0, 8).map((id) => model.person(id) ? <button type="button" key={id} className={`crumb ${id === selected ? "on" : ""}`} onClick={() => openPerson(id)}>{model.person(id).name}</button> : null)}
        </div>
      ) : null}

      <main className="stage">
        {hiveSeen ? (
          <Suspense fallback={<BootFallback />}>
            <div className={`stage-inner hive-keep ${view === "hive" ? "on" : "off"}`} aria-hidden={view !== "hive"}>
              <HiveView
                key={treeId}
                model={model}
                rootId={rootId}
                query={query}
                onSelect={onSelect}
                onHover={setHover}
                onLeave={() => setHover(null)}
                exportRef={exportRef}
                selectedId={selected}
                settings={chartSettings}
                onSettings={(s) => setChartSettings((c) => ({ ...c, ...s }))}
                active={view === "hive"}
              />
            </div>
          </Suspense>
        ) : null}
        <AnimatePresence mode="wait">
          {view !== "hive" ? (
            <motion.div key={view} className="stage-inner" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
              {["pedigree", "descendants", "hourglass"].includes(view) ? (
                <ChartView model={model} mode={view} rootId={rootId} onSelect={onSelect} onHover={setHover} onLeave={() => setHover(null)} settings={chartSettings} onSettings={(s) => setChartSettings((c) => ({ ...c, ...s }))} exportRef={exportRef} />
              ) : (
                <Suspense fallback={<BootFallback />}>
                  {view === "fan" ? <FanView model={model} rootId={rootId} onSelect={onSelect} onHover={setHover} onLeave={() => setHover(null)} exportRef={exportRef} /> : null}
                  {view === "timeline" ? <TimelineView model={model} rootId={rootId} onSelect={onSelect} onHover={setHover} onLeave={() => setHover(null)} exportRef={exportRef} /> : null}
                  {view === "sources" ? <SourcesView model={model} onOpen={openPerson} editable={editable && editing} onEdit={editTree} /> : null}
                  {view === "hints" ? <HintsView model={model} hints={hints} loading={hintsLoading} onState={hintState} onOpen={openPerson} onHoverLink={setLinkHover} onLeaveLink={() => setLinkHover(null)} onRefresh={loadHints} onToast={setToast} /> : null}
                  {view === "history" ? <HistoryView model={model} items={history} loading={historyLoading} onOpen={openPerson} onToast={setToast} /> : null}
                </Suspense>
              )}
            </motion.div>
          ) : null}
        </AnimatePresence>

        {hoverP && hover !== selected ? (
          <div className="peek">
            <Portrait model={model} pid={hover} size={54} />
            <div>
              <b>{hoverP.name}</b>
              <div className="muted small">{model.years(hover) || "no dates"}{model.generations[hover] !== undefined ? ` · gen ${model.generations[hover]}` : ""}</div>
              <div className="small">{kinPeek}</div>
              <div className="small" style={{ color: confidenceColor(model.conf(hover).score) }}>evidence {model.conf(hover).score}/100{model.isBrickWall(hover) ? " · brick wall" : ""}</div>
            </div>
          </div>
        ) : null}

        <AnimatePresence>
          {selected && model.person(selected) ? (
            <PersonDrawer key={`${selected}-${model.version}`} model={model} pid={selected} hints={hints} links={model.links} onLinksChange={linksChange} onOpen={openPerson} onClose={() => setSelected(null)} onSetRoot={(id) => setRootId(id)} onSetHome={setHome} onHoverLink={setLinkHover} onLeaveLink={() => setLinkHover(null)} onHintState={hintState} onView={goView} relateTo={relateTo} onRelateTo={setRelateTo} editable={editable} editing={editing} onEdit={editTree} onIngest={ingestMedia} />
          ) : null}
        </AnimatePresence>
      </main>

      <CommandPalette open={palette} onClose={() => setPalette(false)} model={model} onOpenPerson={openPerson} onSetRoot={(id) => { setRootId(id); openPerson(id); }} onView={setView} onHome={() => { setRootId(model.homeId); openPerson(model.homeId); }} selected={selected} onRelate={(id) => { setRelateTo(id); if (selected) openPerson(selected); else openPerson(model.homeId); }} trees={trees} treeId={treeId} onTree={switchTree} hideLiving={model.hideLiving} onPrivacy={setPrivacy} editable={editable} editing={editing} onToggleEdit={() => setEditing((v) => !v)} onUndo={undoEdit} onExport={exportGramps} onExportGedcom={exportGedcom} onExportShare={exportShare} />
      <LinkPreview target={linkHover} />
      {toast ? <div className="toast">{toast}</div> : null}
      {error ? <div className="toast err">{error}</div> : null}
    </div>
  );
}
