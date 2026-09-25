import { useState } from "react";
import { CONFIDENCE_LABEL } from "../lib/format.js";

function Field({ label, children }) {
  return (
    <label className="edit-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function SourceForm({ source, onSave, busy }) {
  const [title, setTitle] = useState(source?.title || "");
  const [author, setAuthor] = useState(source?.author || "");
  const [pubinfo, setPubinfo] = useState(source?.pubinfo || "");
  const [abbrev, setAbbrev] = useState(source?.abbrev || "");
  const submit = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({ id: source?.id, title: title.trim(), author, pubinfo, abbrev });
  };
  return (
    <form className="edit-form" onSubmit={submit}>
      <h4>{source ? "Edit source" : "New source"}</h4>
      <div className="edit-grid">
        <Field label="Title"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What the record is, not a person name" required /></Field>
        <Field label="Author"><input value={author} onChange={(e) => setAuthor(e.target.value)} /></Field>
        <Field label="Publication"><input value={pubinfo} onChange={(e) => setPubinfo(e.target.value)} /></Field>
        <Field label="Abbreviation"><input value={abbrev} onChange={(e) => setAbbrev(e.target.value)} /></Field>
      </div>
      <div className="edit-actions">
        <button type="submit" disabled={busy || !title.trim()}>{source ? "Save source" : "Add source"}</button>
      </div>
    </form>
  );
}

export function CitationForm({ sources, attach, onSave, onCreateSource, busy }) {
  const [source, setSource] = useState(sources[0]?.id || "");
  const [page, setPage] = useState("");
  const [confidence, setConfidence] = useState(2);
  const [newTitle, setNewTitle] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    let sourceId = source;
    if (!sourceId && newTitle.trim() && onCreateSource) {
      const created = await onCreateSource({ title: newTitle.trim() });
      sourceId = created?.id;
    }
    if (!sourceId) return;
    onSave({ source: sourceId, page, confidence: Number(confidence), attach });
    setPage("");
    setNewTitle("");
  };
  return (
    <form className="edit-form" onSubmit={submit}>
      <h4>Attach a citation</h4>
      <div className="edit-grid">
        <Field label="Source">
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">— pick or create below —</option>
            {sources.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
        </Field>
        {!source ? (
          <Field label="New source title">
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Census, certificate, book…" />
          </Field>
        ) : null}
        <Field label="Page / detail">
          <input value={page} onChange={(e) => setPage(e.target.value)} placeholder="volume, page, household, image" />
        </Field>
        <Field label="Confidence">
          <select value={confidence} onChange={(e) => setConfidence(e.target.value)}>
            {CONFIDENCE_LABEL.map((label, i) => <option key={i} value={i}>{label}</option>)}
          </select>
        </Field>
      </div>
      <div className="edit-actions">
        <button type="submit" disabled={busy || (!source && !newTitle.trim())}>Attach citation</button>
      </div>
    </form>
  );
}
