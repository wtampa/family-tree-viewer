import { useMemo, useState } from "react";
import HintCard, { HINT_LABEL } from "../components/HintCard.jsx";
import { HINT_COLORS } from "../lib/color.js";
import { api } from "../lib/api.js";

export default function HintsView({ model, hints, loading, onState, onOpen, onHoverLink, onLeaveLink, onRefresh, onToast }) {
  const [types, setTypes] = useState(() => new Set(Object.keys(HINT_LABEL)));
  const [scope, setScope] = useState("ancestors"); // ancestors | all
  const [status, setStatus] = useState("open"); // open | pinned | done | dismissed | all
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(60);
  const [includeOpen, setIncludeOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [lastExport, setLastExport] = useState("");
  const [exportMsg, setExportMsg] = useState("");

  const counts = useMemo(() => {
    const c = {};
    for (const h of hints || []) if (h.state !== "done" && h.state !== "dismissed") c[h.type] = (c[h.type] || 0) + 1;
    return c;
  }, [hints]);

  const list = useMemo(() => {
    let arr = hints || [];
    if (scope === "ancestors") arr = arr.filter((h) => h.isAncestor);
    if (status === "open") arr = arr.filter((h) => h.state === "open" || h.state === "pinned");
    else if (status !== "all") arr = arr.filter((h) => h.state === status);
    arr = arr.filter((h) => types.has(h.type));
    if (q.trim()) { const s = q.toLowerCase(); arr = arr.filter((h) => h.title.toLowerCase().includes(s) || (model.person(h.personId)?.name || "").toLowerCase().includes(s)); }
    return arr;
  }, [hints, scope, status, types, q, model]);

  const toggle = (t) => setTypes((s) => { const n = new Set(s); if (n.has(t)) n.delete(t); else n.add(t); return n; });
  const only = (t) => setTypes(new Set([t]));
  const all = () => setTypes(new Set(Object.keys(HINT_LABEL)));

  const exportLog = async () => {
    setExporting(true);
    try {
      const r = await api.exportHints({ includeOpenAncestors: includeOpen });
      if (!r.ok) {
        setExportMsg(r.error || "Nothing to export");
        onToast?.(r.error || "Nothing to export");
        return;
      }
      const msg = `Wrote ${r.count} hint${r.count === 1 ? "" : "s"} to ${r.relative}`;
      setLastExport(r.relative);
      setExportMsg(msg);
      onToast?.(msg);
    } catch (e) {
      setExportMsg(e.message);
      onToast?.(e.message);
    } finally {
      setExporting(false);
    }
  };

  const openLog = async () => {
    if (!lastExport) return;
    try { await api.openFile(lastExport); } catch (e) { onToast?.(e.message); }
  };

  return (
    <div className="page">
      <div className="page-head">
        <h2>Research hints <span className="muted small">{loading ? "computing…" : `${list.length} shown · ${(hints || []).length} total`}</span></h2>
        <div className="row">
          <input placeholder="Filter by person or title" value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="ancestors">direct ancestors of home</option>
            <option value="all">everyone</option>
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="open">open + pinned</option>
            <option value="pinned">pinned</option>
            <option value="done">done</option>
            <option value="dismissed">dismissed</option>
            <option value="all">all</option>
          </select>
          <button type="button" onClick={onRefresh}>Recompute</button>
          <label className="export-opt">
            <input type="checkbox" checked={includeOpen} onChange={(e) => setIncludeOpen(e.target.checked)} />
            include open ancestors
          </label>
          <button type="button" onClick={exportLog} disabled={exporting}>{exporting ? "Exporting…" : "Export log"}</button>
          {lastExport ? <button type="button" onClick={openLog}>Open log</button> : null}
        </div>
      </div>
      {exportMsg ? <div className="muted small export-msg">{exportMsg}</div> : null}
      <div className="type-chips">
        {Object.entries(HINT_LABEL).map(([t, l]) => (
          <button type="button" key={t} className={`tchip ${types.has(t) ? "on" : ""}`} style={{ "--accent": HINT_COLORS[t] }} onClick={() => toggle(t)} onDoubleClick={() => only(t)} title="Click to toggle · double-click for only this type">
            <i />{l} <b>{counts[t] || 0}</b>
          </button>
        ))}
        <button type="button" className="tchip" onClick={all}>all</button>
      </div>
      <div className="hint-grid">
        {list.slice(0, limit).map((h, i) => <HintCard key={h.id} hint={h} model={model} onState={onState} onOpenPerson={onOpen} onHoverLink={onHoverLink} onLeaveLink={onLeaveLink} compact={i > 2} />)}
        {list.length > limit ? <button type="button" className="more" onClick={() => setLimit((l) => l + 60)}>Show {Math.min(60, list.length - limit)} more</button> : null}
        {!list.length && !loading ? <div className="muted">Nothing here. Change the filters or recompute.</div> : null}
      </div>
    </div>
  );
}
