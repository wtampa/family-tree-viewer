import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api.js";
import { destRelative, defaultIngestKind, fileExt } from "../lib/media-name.js";

const EVENT_TYPES = [
  "Birth", "Baptism", "Christening", "Death", "Burial", "Cremation",
  "Marriage", "Divorce", "Census", "Residence", "Occupation", "Immigration",
  "Emigration", "Naturalization", "Military Service", "Probate", "Will",
  "Education", "Graduation", "Religion", "Election", "Other",
];

function Field({ label, children }) {
  return (
    <label className="edit-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function IdentityForm({ person, onSave, busy }) {
  const primary = person.names?.find((n) => !n.alt) || person.names?.[0] || { first: "", surname: "", suffix: "" };
  const alts = (person.names || []).filter((n) => n.alt);
  const [first, setFirst] = useState(primary.first || "");
  const [surname, setSurname] = useState(primary.surname || "");
  const [suffix, setSuffix] = useState(primary.suffix || "");
  const [gender, setGender] = useState(person.gender || "U");
  const [altFirst, setAltFirst] = useState(alts[0]?.first || "");
  const [altSurname, setAltSurname] = useState(alts[0]?.surname || "");

  const submit = (e) => {
    e.preventDefault();
    const names = [{ type: "Birth Name", first, surname, suffix, alt: false }];
    if (altFirst || altSurname) names.push({ type: "Also Known As", first: altFirst, surname: altSurname, alt: true });
    for (const extra of alts.slice(1)) names.push(extra);
    onSave({ id: person.id, gender, names });
  };

  return (
    <form className="edit-form" onSubmit={submit}>
      <h4>Identity</h4>
      <div className="edit-grid">
        <Field label="Given name">
          <input value={first} onChange={(e) => setFirst(e.target.value)} placeholder="Leave blank if unknown" />
        </Field>
        <Field label="Surname">
          <input value={surname} onChange={(e) => setSurname(e.target.value)} placeholder="Leave blank if unknown" />
        </Field>
        <Field label="Suffix">
          <input value={suffix} onChange={(e) => setSuffix(e.target.value)} />
        </Field>
        <Field label="Gender">
          <select value={gender} onChange={(e) => setGender(e.target.value)}>
            <option value="M">Male</option>
            <option value="F">Female</option>
            <option value="U">Unknown</option>
          </select>
        </Field>
        <Field label="Also known as (given)">
          <input value={altFirst} onChange={(e) => setAltFirst(e.target.value)} />
        </Field>
        <Field label="Also known as (surname)">
          <input value={altSurname} onChange={(e) => setAltSurname(e.target.value)} />
        </Field>
      </div>
      <div className="edit-actions">
        <button type="submit" disabled={busy}>Save names</button>
      </div>
    </form>
  );
}

export function RelativeForm({ person, families, onAdd, busy }) {
  const [role, setRole] = useState("father");
  const [first, setFirst] = useState("");
  const [surname, setSurname] = useState(person.surname || "");
  const [gender, setGender] = useState("M");
  const [familyId, setFamilyId] = useState(person.families?.[0] || "");

  const submit = (e) => {
    e.preventDefault();
    onAdd({ personId: person.id, role, first, surname, gender, familyId: role === "child" ? familyId : undefined });
    setFirst("");
  };

  return (
    <form className="edit-form" onSubmit={submit}>
      <h4>Add a relative</h4>
      <p className="muted small">Type what you know. Leave the given name blank if it is unknown — the app will not invent one.</p>
      <div className="edit-grid">
        <Field label="Relationship">
          <select value={role} onChange={(e) => {
            const r = e.target.value;
            setRole(r);
            setGender(r === "father" ? "M" : r === "mother" ? "F" : "U");
          }}>
            <option value="father">Parent (father)</option>
            <option value="mother">Parent (mother)</option>
            <option value="spouse">Spouse / partner</option>
            <option value="child">Child</option>
          </select>
        </Field>
        <Field label="Given name">
          <input value={first} onChange={(e) => setFirst(e.target.value)} placeholder="Leave blank if unknown" />
        </Field>
        <Field label="Surname">
          <input value={surname} onChange={(e) => setSurname(e.target.value)} placeholder="Leave blank if unknown" />
        </Field>
        <Field label="Gender">
          <select value={gender} onChange={(e) => setGender(e.target.value)}>
            <option value="M">Male</option>
            <option value="F">Female</option>
            <option value="U">Unknown</option>
          </select>
        </Field>
        {role === "child" && families?.length > 1 ? (
          <Field label="Family">
            <select value={familyId} onChange={(e) => setFamilyId(e.target.value)}>
              {families.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          </Field>
        ) : null}
      </div>
      <div className="edit-actions">
        <button type="submit" disabled={busy}>Add relative</button>
      </div>
    </form>
  );
}

export function EventForm({ personId, event, places, onSave, onDelete, busy }) {
  const [type, setType] = useState(event?.type || "Birth");
  const [custom, setCustom] = useState(EVENT_TYPES.includes(event?.type) ? "" : (event?.type || ""));
  const [dateText, setDateText] = useState(event?.date?.text || "");
  const [placeId, setPlaceId] = useState(event?.place || "");
  const [placeName, setPlaceName] = useState("");
  const [description, setDescription] = useState(event?.description || "");

  const submit = (e) => {
    e.preventDefault();
    onSave({
      id: event?.id,
      personId,
      type: type === "Other" ? (custom || "Other") : type,
      dateText,
      placeId: placeId || undefined,
      placeName: placeId ? undefined : placeName,
      description,
    });
  };

  return (
    <form className="edit-form" onSubmit={submit}>
      <h4>{event ? "Edit event" : "Add event"}</h4>
      <div className="edit-grid">
        <Field label="Type">
          <select value={EVENT_TYPES.includes(type) ? type : "Other"} onChange={(e) => setType(e.target.value)}>
            {EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        {type === "Other" || !EVENT_TYPES.includes(type) ? (
          <Field label="Custom type"><input value={custom} onChange={(e) => setCustom(e.target.value)} /></Field>
        ) : null}
        <Field label="Date">
          <input value={dateText} onChange={(e) => setDateText(e.target.value)} placeholder="14 Feb 1885, abt 1840, before 1900" />
        </Field>
        <Field label="Place on file">
          <select value={placeId} onChange={(e) => setPlaceId(e.target.value)}>
            <option value="">— none / new —</option>
            {places.map((p) => <option key={p.id} value={p.id}>{p.title || p.name}</option>)}
          </select>
        </Field>
        {!placeId ? (
          <Field label="New place name">
            <input value={placeName} onChange={(e) => setPlaceName(e.target.value)} placeholder="Only if not already in the list" />
          </Field>
        ) : null}
        <Field label="Description">
          <input value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
      </div>
      <div className="edit-actions">
        <button type="submit" disabled={busy}>{event ? "Save event" : "Add event"}</button>
        {event && onDelete ? <button type="button" className="ghost danger" disabled={busy} onClick={() => onDelete(event.id)}>Remove event</button> : null}
      </div>
    </form>
  );
}

export function NoteForm({ person, onSave, busy }) {
  const [text, setText] = useState("");
  const [type, setType] = useState("Person Note");
  const submit = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSave({ personId: person.id, type, text });
    setText("");
  };
  return (
    <form className="edit-form" onSubmit={submit}>
      <h4>Add note</h4>
      <div className="edit-grid">
        <Field label="Type">
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option>Person Note</option>
            <option>Research</option>
            <option>General</option>
          </select>
        </Field>
      </div>
      <textarea className="edit-area" value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder="What the record actually says — not a guessed name" />
      <div className="edit-actions">
        <button type="submit" disabled={busy || !text.trim()}>Add note</button>
      </div>
    </form>
  );
}

function ingestError(msg) {
  const s = String(msg || "");
  if (/404|unknown api/i.test(s)) {
    return "Close Family Tree and open it again from the desktop icon. This window updated, but the server is still the old one and cannot copy files yet.";
  }
  return s;
}

export function MediaForm({ person, onAttach, onIngest, busy }) {
  const inputRef = useRef(null);
  const [picks, setPicks] = useState([]);
  const [kind, setKind] = useState("portrait");
  const [kindTouched, setKindTouched] = useState(false);
  const [caption, setCaption] = useState("");
  const [adding, setAdding] = useState(false);
  const [fileQ, setFileQ] = useState("");
  const [files, setFiles] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!adding) return;
    const t = setTimeout(() => api.files(fileQ).then((r) => setFiles(r.items || [])).catch(() => setFiles([])), 200);
    return () => clearTimeout(t);
  }, [adding, fileQ]);

  const dests = useMemo(() => picks.map((f) => destRelative({
    person,
    kind,
    originalName: f.name,
    caption: caption.trim(),
    ext: fileExt(f.name),
  })), [picks, person, kind, caption]);

  const pickExisting = (f) => {
    onAttach({ path: f.path, description: caption.trim() || f.name });
    setCaption("");
    setFileQ("");
    setAdding(false);
  };

  const ingestList = async (list, useKind) => {
    const chosen = [...(list || [])].filter(Boolean);
    if (!chosen.length) return;
    if (!onIngest) {
      setErr("Editing is not available on this tree.");
      return;
    }
    setErr("");
    try {
      for (const file of chosen) {
        const form = new FormData();
        form.append("personId", person.id);
        form.append("kind", useKind || kind);
        form.append("caption", caption.trim());
        form.append("file", file, file.name);
        await onIngest(form);
      }
      setPicks([]);
      setCaption("");
      setKindTouched(false);
      if (inputRef.current) inputRef.current.value = "";
    } catch (e) {
      setErr(ingestError(e.message || String(e)));
    }
  };

  const takeFiles = (list) => {
    const next = [...(list || [])];
    setPicks(next);
    let nextKind = kind;
    if (!kindTouched && next[0]) {
      nextKind = defaultIngestKind(person, fileExt(next[0].name));
      setKind(nextKind);
    }
    ingestList(next, nextKind);
  };

  return (
    <div
      className={`edit-form${dragOver ? " drop-active" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); takeFiles(e.dataTransfer.files); }}
    >
      <h4>Attach a file</h4>
      <p className="muted small">Choose a photo or PDF. It is copied into your research folder as soon as you pick it — nothing is sent to the internet.</p>
      <div className="edit-grid">
        <label className="edit-field">
          <span>Kind</span>
          <select value={kind} onChange={(e) => { setKind(e.target.value); setKindTouched(true); }}>
            <option value="portrait">Portrait</option>
            <option value="document">Document</option>
          </select>
        </label>
        <label className="edit-field">
          <span>Caption (optional)</span>
          <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Wedding, 1920 census…" />
        </label>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.pdf"
        multiple
        hidden
        onChange={(e) => takeFiles(e.target.files)}
      />
      <div className="edit-actions">
        <button type="button" className="mini" disabled={busy} onClick={() => inputRef.current?.click()}>Choose files…</button>
        {picks.length ? <button type="button" disabled={busy} onClick={() => ingestList(picks, kind)}>Retry copy</button> : null}
      </div>
      {picks.length ? (
        <ul className="ingest-dests">
          {picks.map((f, i) => (
            <li key={`${f.name}-${i}`}><code>{dests[i]}</code> <span className="muted">← {f.name}</span></li>
          ))}
        </ul>
      ) : <p className="muted small">Or drop files on this box. Portrait → <code>sources/portraits/</code>. Document → <code>sources/people/</code>.</p>}
      {err ? <p className="privacy-note">{err}</p> : null}
      <div className="edit-actions">
        <button type="button" className="mini ghost" disabled={busy} onClick={() => setAdding((a) => !a)}>
          {adding ? "Hide research folder" : "or pick a file already in the research folder"}
        </button>
      </div>
      {adding ? (
        <div className="add-link">
          <input placeholder="Filter files in your research folder…" value={fileQ} onChange={(e) => setFileQ(e.target.value)} />
          <div className="file-list">
            {files.slice(0, 40).map((f) => (
              <button type="button" key={f.path} className="file-item" disabled={busy} onClick={() => pickExisting(f)}>
                <span className={`link-icon link-icon-${f.kind}`} />{f.path}
              </button>
            ))}
            {files.length ? null : <div className="muted small">No matching images or PDFs.</div>}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function NoteEditor({ note, onSave, busy }) {
  const [text, setText] = useState(note.text || "");
  return (
    <form className="edit-form compact" onSubmit={(e) => { e.preventDefault(); onSave({ id: note.id, text }); }}>
      <textarea className="edit-area" value={text} onChange={(e) => setText(e.target.value)} rows={3} />
      <div className="edit-actions">
        <button type="submit" disabled={busy}>Save note</button>
      </div>
    </form>
  );
}
