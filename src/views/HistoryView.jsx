import { useState } from "react";
import Portrait from "../components/Portrait.jsx";
import { api } from "../lib/api.js";

function whenLabel(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export default function HistoryView({ model, items, loading, onOpen, onToast }) {
  const [exporting, setExporting] = useState(false);
  const [lastExport, setLastExport] = useState("");
  const [exportMsg, setExportMsg] = useState("");
  const personal = Boolean(model?.settings?.editable);
  const rows = items || [];

  const exportLog = async () => {
    setExporting(true);
    try {
      const r = await api.exportHistory();
      if (!r.ok) {
        setExportMsg(r.error || "Nothing to export");
        onToast?.(r.error || "Nothing to export");
        return;
      }
      const msg = `Wrote ${r.count} change${r.count === 1 ? "" : "s"} to ${r.relative}`;
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
        <h2>History <span className="muted small">{loading ? "loading…" : `${rows.length} change${rows.length === 1 ? "" : "s"}`}</span></h2>
        <div className="row">
          {personal ? (
            <>
              <button type="button" disabled={exporting || !rows.length} onClick={exportLog}>Export log</button>
              {lastExport ? <button type="button" className="ghost" onClick={openLog}>Open last log</button> : null}
            </>
          ) : null}
        </div>
      </div>
      <p className="muted small">
        Every saved edit on My tree is listed here. Undo reverses the last change and marks that row undone — it stays in the diary.
        Session backups of <code>tree.db</code> still go to <code>data/backups/</code>.
      </p>
      {exportMsg ? <p className="muted small">{exportMsg}</p> : null}
      {!personal ? (
        <p className="muted">History is only on My tree (local). Sample trees stay read-only.</p>
      ) : null}
      {personal && !loading && !rows.length ? (
        <p className="muted">No edits yet. Turn on Edit, change a person, then come back here.</p>
      ) : null}
      <ol className="hist-list">
        {rows.map((row) => (
          <li key={row.id} className={`hist-row ${row.undone ? "undone" : ""}`}>
            <div className="hist-when">{whenLabel(row.at)}</div>
            <div className="hist-sum">{row.summary}{row.undone ? " · undone" : ""}</div>
            {row.personIds?.length ? (
              <div className="hist-people">
                {row.personIds.map((id) => model.person(id) ? (
                  <button type="button" key={id} className="chip" onClick={() => onOpen(id)}>
                    <Portrait model={model} pid={id} size={24} ring={false} />
                    <span className="chip-name">{model.person(id).name}</span>
                  </button>
                ) : <span key={id} className="muted small">{id}</span>)}
              </div>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
