/**
 * Share-lite viewer. Loads ./tree.json from the static pack — no server API, no editing,
 * no living unlock. Three views only: Tree (pedigree), Fan, Hive.
 */
import React, { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { TreeModel } from "../lib/model.js";
import ChartView from "../views/ChartView.jsx";
import Portrait from "../components/Portrait.jsx";
import ShareCard from "./ShareCard.jsx";
import SharePeople from "./SharePeople.jsx";

const FanView = lazy(() => import("../views/FanView.jsx"));
const HiveView = lazy(() => import("../views/HiveView.jsx"));

// Namespaced so the desktop app (ftv:) and the pack never fight over keys.
const LS = {
  get(k, d) { try { const v = localStorage.getItem(`fts:${k}`); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(`fts:${k}`, JSON.stringify(v)); } catch { /* ignore */ } },
};

const SHARE_VIEWS = [
  { id: "pedigree", label: "Tree" },
  { id: "fan", label: "Fan" },
  { id: "hive", label: "Hive" },
];

function BootFallback({ text = "Loading tree…" }) {
  return (
    <div className="boot">
      <img src="./tree-icon.png" alt="" width="96" />
      <h1>Family Tree</h1>
      <p>{text}</p>
    </div>
  );
}

/** Hive needs WebGL; if it dies, keep Tree and Fan alive. */
class HiveBoundary extends React.Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) {
      return <div className="boot"><p className="err">Hive needs a newer browser — use Tree or Fan.</p></div>;
    }
    return this.props.children;
  }
}

export default function ShareApp() {
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState("");
  const [view, setView] = useState(() => {
    const v = LS.get("view", "pedigree");
    return SHARE_VIEWS.some((x) => x.id === v) ? v : "pedigree";
  });
  const [rootId, setRootId] = useState(() => LS.get("root", null));
  const [selected, setSelected] = useState(null);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [peopleQuery, setPeopleQuery] = useState("");
  const [chartSettings, setChartSettings] = useState(() => ({ ancestry: 4, progeny: 3, siblings: true, horizontal: false, compact: false, ...LS.get("chart", {}) }));

  const model = useMemo(() => (payload ? new TreeModel(payload) : null), [payload]);

  useEffect(() => {
    let alive = true;
    fetch("./tree.json", { cache: "no-store" })
      .then((r) => { if (!r.ok) throw new Error(`tree.json → ${r.status}`); return r.json(); })
      .then((p) => { if (alive) { setPayload(p); setError(""); } })
      .catch((e) => { if (alive) setError(e.message || String(e)); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!model) return;
    if (!rootId || !model.person(rootId)) setRootId(model.homeId);
  }, [model, rootId]);

  useEffect(() => { LS.set("view", view); }, [view]);
  useEffect(() => { if (rootId) LS.set("root", rootId); }, [rootId]);
  useEffect(() => { LS.set("chart", chartSettings); }, [chartSettings]);

  const onSelect = useCallback((id, { reroot = true } = {}) => {
    setSelected(id);
    if (reroot) setRootId(id);
  }, []);
  const centerOn = useCallback((id) => {
    setRootId(id);
    setSelected(id);
    setPeopleOpen(false);
    setPeopleQuery("");
  }, []);
  const noHover = useCallback(() => {}, []);

  useEffect(() => {
    if (!peopleOpen) return;
    const onKey = (e) => { if (e.key === "Escape") setPeopleOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [peopleOpen]);

  if (error && !model) {
    return (
      <div className="boot">
        <img src="./tree-icon.png" alt="" width="96" />
        <h1>Family Tree</h1>
        <p className="err">{error}</p>
      </div>
    );
  }
  const root = model?.person(rootId);
  if (!model || !root) return <BootFallback />;

  return (
    <div className={`app share-app ${selected ? "with-drawer" : ""}`}>
      <header className="topbar">
        <div className="brand" onClick={() => setPeopleOpen(true)} title="Find someone — search or scroll all names">
          <img src="./tree-icon.png" alt="" />
          <div>
            <b>Family Tree</b>
            <span>{model.m.meta?.counts?.people ?? Object.keys(model.people).length} people — tap to find</span>
          </div>
        </div>
        <nav className="tabs share-tabs">
          {SHARE_VIEWS.map((v) => (
            <button type="button" key={v.id} className={view === v.id ? "on" : ""} onClick={() => setView(v.id)}>
              {v.label}
            </button>
          ))}
          <button type="button" className={peopleOpen ? "on" : ""} onClick={() => setPeopleOpen(true)}>People</button>
        </nav>
        <div className="root-chip" onClick={() => setSelected(rootId)} title="Current root — tap for details">
          <Portrait model={model} pid={rootId} size={34} />
          <div><b>{root.name}</b><span>{model.years(rootId) || "root"}</span></div>
        </div>
      </header>
      {view === "hive" ? (
        <p className="share-hive-note">Hive is best on a tablet. On a phone, use Tree or Fan.</p>
      ) : null}

      <main className="stage">
        <div className="stage-inner">
          {view === "pedigree" ? (
            <ChartView
              model={model}
              mode="hourglass"
              rootId={rootId}
              onSelect={onSelect}
              onHover={noHover}
              onLeave={noHover}
              settings={chartSettings}
              onSettings={(s) => setChartSettings((c) => ({ ...c, ...s }))}
            />
          ) : null}
          {view === "fan" ? (
            <Suspense fallback={<BootFallback />}>
              <FanView model={model} rootId={rootId} onSelect={onSelect} onHover={noHover} onLeave={noHover} />
            </Suspense>
          ) : null}
          {view === "hive" ? (
            <HiveBoundary>
              <Suspense fallback={<BootFallback text="Loading hive…" />}>
                <HiveView
                  model={model}
                  rootId={rootId}
                  query=""
                  onSelect={onSelect}
                  onHover={noHover}
                  onLeave={noHover}
                  selectedId={selected}
                  settings={chartSettings}
                  onSettings={(s) => setChartSettings((c) => ({ ...c, ...s }))}
                  active
                />
              </Suspense>
            </HiveBoundary>
          ) : null}
        </div>

        {selected && model.person(selected) ? (
          <ShareCard
            model={model}
            pid={selected}
            onOpen={centerOn}
            onSetRoot={centerOn}
            onClose={() => setSelected(null)}
          />
        ) : null}
        {peopleOpen ? (
          <SharePeople
            model={model}
            query={peopleQuery}
            onQuery={setPeopleQuery}
            currentId={rootId}
            onPick={centerOn}
            onClose={() => setPeopleOpen(false)}
          />
        ) : null}
      </main>
    </div>
  );
}
