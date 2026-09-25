import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import Portrait from "./Portrait.jsx";
import ResourceLinks from "./ResourceLinks.jsx";
import HintCard from "./HintCard.jsx";
import PlacesList from "./PlacesList.jsx";
import { confidenceColor, lineColor } from "../lib/color.js";
import { CONFIDENCE_LABEL } from "../lib/format.js";
import { api } from "../lib/api.js";
import { personStops, uniqueMappedPlaces } from "../lib/places.js";
import { EventForm, IdentityForm, MediaForm, NoteEditor, NoteForm, RelativeForm } from "./PersonEdit.jsx";
import { CitationForm } from "./SourceEdit.jsx";

const PlacesMap = lazy(() => import("../views/PlacesMap.jsx"));

function PersonChip({ model, pid, onOpen, rel }) {
  const p = model.person(pid);
  if (!p) return null;
  return (
    <button type="button" className="chip" onClick={() => onOpen(pid)} title={model.years(pid)}>
      <Portrait model={model} pid={pid} size={30} ring={false} />
      <span className="chip-name">{p.name}</span>
      {rel ? <span className="chip-rel">{rel}</span> : null}
      <span className="chip-years">{model.years(pid)}</span>
    </button>
  );
}

function linkify(text) {
  const parts = String(text || "").split(/(https?:\/\/[^\s<>"')\]]+)/g);
  return parts.map((s, i) => (/^https?:\/\//.test(s) ? <a key={i} href={s} target="_blank" rel="noreferrer">{s}</a> : <span key={i}>{s}</span>));
}

function KinPaths({ model, report, onOpen }) {
  if (!report?.paths?.length) return <div className="muted small">Not a blood relative (and no single marriage hop).</div>;
  return (
    <ul className="kin-paths">
      {report.paths.map((p, i) => (
        <li key={`${p.label}-${p.via?.join("-")}-${i}`} className={p.collapse ? "collapse" : ""}>
          <span className="kin-label">{p.label}</span>
          {p.collapse ? <span className="tag collapse" title="Same ancestor reached by two routes">◇ collapse</span> : null}
          {p.via?.length && p.label !== "self" && !(p.via.length === 1 && (p.da === 0 || p.db === 0)) ? (
            <span className="kin-via">
              via {p.via.map((id, j) => (
                <span key={id}>
                  {j ? " × " : null}
                  <button type="button" className="linkish" onClick={() => onOpen(id)}>{model.person(id)?.name || id}</button>
                </span>
              ))}
              {p.hop ? <> · hop <button type="button" className="linkish" onClick={() => onOpen(p.hop)}>{model.person(p.hop)?.name || p.hop}</button></> : null}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function CensusRow({ census, onHoverLink, onLeaveLink }) {
  if (!census?.applicable || !census.years?.length) return null;
  return (
    <section>
      <h4>Census years</h4>
      <div className="census-row" title={census.place || ""}>
        {census.years.map((y) => {
          const href = y.links?.[0]?.url;
          return (
            <a
              key={`${y.kind}-${y.year}`}
              className={`census-chip ${y.have ? "have" : "miss"} ${y.kind}`}
              href={href}
              target="_blank"
              rel="noreferrer"
              title={`${y.kind === "florida" ? "Florida state" : "US federal"} ${y.year} — ${y.have ? "on file" : "not in tree"}${census.place ? ` · ${census.place}` : ""}`}
              onMouseEnter={(e) => href && onHoverLink?.({ link: { url: href, label: `${y.year} census` }, x: e.clientX, y: e.clientY })}
              onMouseLeave={() => onLeaveLink?.()}
            >
              {y.year}{y.kind === "florida" ? " FL" : ""}
            </a>
          );
        })}
      </div>
      <div className="muted small">Green = a census event or citation is already attached · click a year to search</div>
    </section>
  );
}

export default function PersonDrawer({ model, pid, hints, links, onLinksChange, onOpen, onClose, onSetRoot, onSetHome, onHoverLink, onLeaveLink, onHintState, onView, relateTo, onRelateTo, editable, editing, onEdit, onIngest }) {
  const [tab, setTab] = useState("overview");
  const [busy, setBusy] = useState(false);
  const [eventEdit, setEventEdit] = useState(null);
  const p = model.person(pid);
  const v = model.vitals(pid);
  const c = model.conf(pid);
  const gen = model.generations[pid];
  const kinHome = useMemo(() => (model.homeId && model.homeId !== pid ? model.kinshipReport(model.homeId, pid) : { primary: "home person", collapse: false, paths: [] }), [model, pid]);
  const kin = kinHome.primary;
  const [relateId, setRelateId] = useState(relateTo || null);
  const [relateQ, setRelateQ] = useState("");
  const [relateOpen, setRelateOpen] = useState(false);
  useEffect(() => { if (relateTo) setRelateId(relateTo); }, [relateTo]);
  const kinOther = useMemo(() => (relateId && relateId !== pid ? model.kinshipReport(pid, relateId) : null), [model, pid, relateId]);
  const census = model.census?.[pid];
  const relateHits = relateQ.trim() ? model.search(relateQ, 8).filter((id) => id !== pid) : [];
  const myHints = useMemo(() => (hints || []).filter((h) => h.personId === pid || h.otherId === pid), [hints, pid]);
  const media = model.mediaFor(pid);
  const line = model.lineOf(pid);
  const events = v.all;
  const placeStops = useMemo(() => personStops(model, pid), [model, pid]);
  const placePoints = useMemo(() => uniqueMappedPlaces(placeStops), [placeStops]);
  const nameAliases = useMemo(() => model.visibleNameAliases(pid), [model, pid]);
  const citationIds = useMemo(() => {
    const s = new Set(p?.citations || []);
    for (const e of events) for (const cid of e.citations || []) s.add(cid);
    for (const f of model.spouseFamilies(pid)) for (const cid of f.citations) s.add(cid);
    for (const f of model.parentFamilies(pid)) for (const cid of f.citations) s.add(cid);
    for (const n of p?.names || []) for (const cid of n.citations) s.add(cid);
    return [...s];
  }, [model, p, events, pid]);
  const places = useMemo(() => Object.values(model.places).sort((a, b) => (a.title || a.name || "").localeCompare(b.title || b.name || "")), [model]);
  const sources = useMemo(() => Object.values(model.sources).sort((a, b) => (a.title || "").localeCompare(b.title || "")), [model]);

  if (!p) return null;
  const openHints = myHints.filter((h) => h.state !== "done" && h.state !== "dismissed");
  const famOptions = model.spouseFamilies(pid).map((f) => ({
    id: f.id,
    label: [f.father, f.mother].map((id) => model.person(id)?.name || "unknown").join(" × ") || f.id,
  }));
  const save = async (kind, body) => {
    if (!onEdit) return;
    setBusy(true);
    try {
      const r = await onEdit(kind, body);
      setEventEdit(null);
      if (kind === "relative" && r?.id) onOpen(r.id);
    } finally { setBusy(false); }
  };

  return (
    <motion.aside className="drawer" initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }} transition={{ type: "spring", stiffness: 380, damping: 34 }}>
      <div className="drawer-head" style={{ "--line": line && line !== "home" ? lineColor(line) : "#3dd6ff" }}>
        <button type="button" className="close" onClick={onClose} title="Close (Esc)">×</button>
        <Portrait model={model} pid={pid} size={84} />
        <div className="drawer-title">
          <h2>{p.name}</h2>
          {nameAliases.length ? (
            <div className="name-aliases" title="Indexed variants — the Gramps name is unchanged">
              <span className="muted">Also </span>
              {nameAliases.map((a) => <span className="alias-chip" key={a}>{a}</span>)}
            </div>
          ) : null}
          <div className="sub">
            <span>{model.years(pid) || "no dates"}</span>
            {gen !== undefined ? <span className="tag">gen {gen}</span> : null}
            {line && line !== "home" ? <span className="tag" style={{ color: lineColor(line) }}>{line} line</span> : null}
            {model.isBrickWall(pid) ? <span className="tag wall">brick wall</span> : null}
          </div>
          <div className={`kin ${kinHome.collapse ? "kin-collapse" : ""}`}>{kin}{kinHome.collapse ? " ◇" : ""}{kinHome.paths.length > 1 ? <span className="muted"> · {kinHome.paths.length} paths</span> : null}</div>
          <div className="conf-line">
            <span className="conf-num" style={{ color: confidenceColor(c.score) }}>{c.score}</span>
            <span className="muted">/100 evidence · {c.citations} citation{c.citations === 1 ? "" : "s"}{c.memberOnly ? " · member trees only" : ""}{c.living ? " · likely living" : ""}</span>
          </div>
        </div>
      </div>
      <div className="drawer-actions">
        <button type="button" onClick={() => onSetRoot(pid)}>Center tree</button>
        <button type="button" onClick={() => onView("pedigree", pid)}>Pedigree</button>
        <button type="button" onClick={() => onView("fan", pid)}>Fan</button>
        <button type="button" onClick={() => onView("hive", pid)}>Hive</button>
        <button type="button" onClick={() => onView("timeline", pid)}>Timeline</button>
        <button type="button" className="ghost" onClick={() => onSetHome(pid)} title="Make this the home person (kinship + generations are computed from home)">Set as home</button>
        {editable ? <span className="muted small">{editing ? "Editing this person" : "Turn on Edit in the top bar to change the tree"}</span> : null}
      </div>
      <div className="drawer-tabs">
        {[["overview", "Overview"], ["events", `Events ${events.length}`], ["sources", `Sources ${citationIds.length}`], ["media", `Media ${media.length}`], ["resources", "Resources"], ["hints", `Hints ${openHints.length}`]].map(([k, l]) => (
          <button type="button" key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      <div className="drawer-body">
        {tab === "overview" ? (
          <>
            {editing ? (
              <>
                <IdentityForm person={p} onSave={(body) => save("person", body)} busy={busy} />
                <RelativeForm person={p} families={famOptions} onAdd={(body) => save("relative", body)} busy={busy} />
              </>
            ) : null}
            {p.privateLiving ? (
              <p className="privacy-note">This person is treated as living. Name, dates, notes, and portraits are hidden until you click <b>Living hidden</b> in the top bar.</p>
            ) : null}
            <section>
              <h4>Related to {model.person(model.homeId)?.name || "home"}</h4>
              {model.homeId === pid ? <div className="muted small">This is the home person.</div> : <KinPaths model={model} report={kinHome} onOpen={onOpen} />}
              <div className="relate-box">
                <button type="button" className="ghost" onClick={() => setRelateOpen((o) => !o)}>{relateOpen || relateId ? "Relate to…" : "Relate to someone else…"}</button>
                {relateId ? (
                  <button type="button" className="ghost" onClick={() => { setRelateId(null); onRelateTo?.(null); }}>Clear</button>
                ) : null}
              </div>
              {relateOpen ? (
                <div className="relate-search">
                  <input value={relateQ} onChange={(e) => setRelateQ(e.target.value)} placeholder="Type a name…" autoFocus />
                  {relateHits.map((id) => (
                    <button type="button" key={id} className="chip" onClick={() => { setRelateId(id); onRelateTo?.(id); setRelateQ(""); setRelateOpen(false); }}>
                      <Portrait model={model} pid={id} size={28} ring={false} />
                      <span className="chip-name">{model.person(id).name}</span>
                      <span className="chip-years">{model.years(id)}</span>
                    </button>
                  ))}
                </div>
              ) : null}
              {relateId && kinOther ? (
                <div className="relate-result">
                  <h5>vs {model.person(relateId)?.name} <button type="button" className="mini" onClick={() => onOpen(relateId)}>open</button></h5>
                  <KinPaths model={model} report={kinOther} onOpen={onOpen} />
                </div>
              ) : null}
            </section>
            <CensusRow census={census} onHoverLink={onHoverLink} onLeaveLink={onLeaveLink} />
            {placeStops.length || placePoints.length ? (
              <section>
                <h4>Places</h4>
                <Suspense fallback={<div className="muted small">Loading map…</div>}>
                  <div className="places-panel stack compact">
                    <PlacesMap points={placePoints} path={placeStops} height={150} compact onSelect={onOpen} />
                    <div className="places-list">
                      <PlacesList stops={placeStops} onSelect={onOpen} />
                    </div>
                  </div>
                </Suspense>
                {!placePoints.length ? (
                  <div className="muted small">Place names from the tree. Add coordinates in Gramps to plot them — this app does not geocode.</div>
                ) : null}
              </section>
            ) : null}
            <section>
              <h4>Parents</h4>
              {model.parents(pid).length ? model.parents(pid).map((id) => <PersonChip key={id} model={model} pid={id} onOpen={onOpen} rel={model.person(id).gender === "M" ? "father" : model.person(id).gender === "F" ? "mother" : "parent"} />) : <div className="muted small">Unknown — this is an end of line.</div>}
            </section>
            {model.spouseFamilies(pid).map((f) => {
              const sp = f.father === pid ? f.mother : f.father;
              const m = f.events.map((e) => model.events[e.id]).find((e) => e && /Marriage/.test(e.type));
              return (
                <section key={f.id}>
                  <h4>{f.relType === "Married" || m ? "Spouse" : "Partner"} {m ? <span className="muted small">· m. {m.date?.text || "date unknown"}{m.place ? `, ${model.shortPlace(m)}` : ""}</span> : null}</h4>
                  {sp ? <PersonChip model={model} pid={sp} onOpen={onOpen} /> : <div className="muted small">Unknown</div>}
                  {f.children.length ? (<><h5>Children</h5>{f.children.map((ch) => <PersonChip key={ch.id} model={model} pid={ch.id} onOpen={onOpen} rel={ch.frel !== "Birth" ? ch.frel.toLowerCase() : ""} />)}</>) : null}
                </section>
              );
            })}
            {model.siblings(pid).length ? (<section><h4>Siblings</h4>{model.siblings(pid).map((id) => <PersonChip key={id} model={model} pid={id} onOpen={onOpen} />)}</section>) : null}
            {p.names.length > 1 ? (
              <section><h4>Other names</h4>{p.names.slice(1).map((n, i) => <div key={i} className="small">{[n.first, n.surname, n.suffix].filter(Boolean).join(" ")} <span className="muted">({n.type})</span></div>)}</section>
            ) : null}
            <section>
              <h4>Evidence breakdown</h4>
              <div className="facts">
                {c.facts?.map((f) => (
                  <div className="fact" key={f.key}>
                    <span className="fact-label">{f.label}</span>
                    <span className="bar"><i style={{ width: `${f.score}%`, background: confidenceColor(f.score) }} /></span>
                    <span className="fact-num">{f.has ? f.score : "—"}</span>
                  </div>
                ))}
              </div>
            </section>
            {p.notes.length || editing ? (
              <section>
                <h4>Notes</h4>
                {p.notes.map((nid) => model.notes[nid]).filter((n) => n && n.type !== "GEDCOM import").map((n) => (
                  <div key={n.id} className="note">
                    <span className="muted small">{n.type}</span>
                    {editing ? <NoteEditor note={n} onSave={(body) => save("note", body)} busy={busy} /> : <div>{linkify(n.text)}</div>}
                  </div>
                ))}
                {editing ? <NoteForm person={p} onSave={(body) => save("note", body)} busy={busy} /> : null}
              </section>
            ) : null}
            {openHints.length ? (
              <section><h4>Top hint</h4><HintCard hint={openHints[0]} model={model} onState={onHintState} onOpenPerson={onOpen} onHoverLink={onHoverLink} onLeaveLink={onLeaveLink} compact /></section>
            ) : null}
          </>
        ) : null}

        {tab === "events" ? (
          <>
          {editing ? (
            <>
            <EventForm
              key={eventEdit?.id || "new"}
              personId={pid}
              event={eventEdit}
              places={places}
              onSave={(body) => save("event", body)}
              onDelete={eventEdit ? (id) => save("event", { id, delete: true }) : null}
              busy={busy}
            />
            {eventEdit?.id ? (
              <CitationForm
                sources={sources}
                attach={{ kind: "event", id: eventEdit.id }}
                busy={busy}
                onSave={(body) => save("citation", body)}
                onCreateSource={async (body) => onEdit?.("source", body)}
              />
            ) : null}
            </>
          ) : null}
          <table className="events">
            <thead><tr><th>Event</th><th>Date</th><th>Place</th><th>Cites</th></tr></thead>
            <tbody>
              {events.map((e, i) => (
                <tr key={`${e.id}-${i}`} className={e.role === "Family" ? "fam" : ""}>
                  <td>
                    {e.type}{e.description ? <div className="muted small">{e.description}</div> : null}{e.role === "Family" ? <div className="muted small">family</div> : null}
                    {editing && e.role !== "Family" ? <div><button type="button" className="mini" onClick={() => setEventEdit(e)}>Edit</button></div> : null}
                  </td>
                  <td>{e.date?.text || <span className="muted">—</span>}</td>
                  <td title={model.placeName(e)}>{model.placeName(e) || <span className="muted">—</span>}</td>
                  <td>{e.citations.length ? e.citations.map((cid) => <span key={cid} className="dot" style={{ background: confidenceColor((model.citations[cid]?.confidence ?? 2) * 25) }} title={`${model.sources[model.citations[cid]?.source]?.title || ""} — ${CONFIDENCE_LABEL[model.citations[cid]?.confidence ?? 2]}`} />) : <span className="dot none" title="Uncited" />}</td>
                </tr>
              ))}
              {events.length ? null : <tr><td colSpan={4} className="muted">No events recorded.</td></tr>}
              {events.filter((e) => e.notes?.length).map((e) => e.notes.map((nid) => model.notes[nid]).filter(Boolean).map((n) => <tr key={n.id} className="evnote"><td colSpan={4}><span className="muted small">{e.type} note · </span>{linkify(n.text)}</td></tr>))}
            </tbody>
          </table>
          </>
        ) : null}

        {tab === "sources" ? (
          <div className="citations">
            {editing ? (
              <CitationForm
                sources={sources}
                attach={{ kind: "person", id: pid }}
                busy={busy}
                onSave={(body) => save("citation", body)}
                onCreateSource={async (body) => {
                  const r = await onEdit?.("source", body);
                  return r;
                }}
              />
            ) : null}
            {citationIds.length ? citationIds.map((cid) => {
              const cit = model.citations[cid];
              if (!cit) return null;
              const src = model.sources[cit.source];
              const uses = cit.usedBy?.filter((u) => u.kind === "event").map((u) => model.events[u.id]?.type).filter(Boolean) || [];
              return (
                <div className="cit" key={cid}>
                  <div className="cit-head"><b>{src?.title || "(no source)"}</b><span className="cit-conf" style={{ color: confidenceColor(cit.confidence * 25) }}>{CONFIDENCE_LABEL[cit.confidence] || cit.confidence}</span></div>
                  {cit.page ? <div className="small">{linkify(cit.page)}</div> : null}
                  {src?.author || src?.pubinfo ? <div className="muted small">{[src.author, src.pubinfo].filter(Boolean).join(" · ")}</div> : null}
                  {uses.length ? <div className="muted small">supports: {[...new Set(uses)].join(", ")}</div> : null}
                  {cit.notes.map((nid) => model.notes[nid]).filter(Boolean).map((n) => <div className="small note" key={n.id}>{linkify(n.text)}</div>)}
                </div>
              );
            }) : <div className="muted">No citations attached to this person or their events.</div>}
          </div>
        ) : null}

        {tab === "media" ? (
          <>
            {editing ? (
              <MediaForm
                person={p}
                busy={busy}
                onAttach={(body) => save("media", { action: "attach", personId: pid, ...body })}
                onIngest={async (form) => {
                  if (!onIngest) return;
                  setBusy(true);
                  try { await onIngest(form); }
                  finally { setBusy(false); }
                }}
              />
            ) : null}
            <div className="gallery">
              {media.length ? media.map((m) => {
                const onPerson = (p.media || []).some((x) => (x.id || x.ref) === m.id);
                const isPortrait = (p.media || [])[0] && ((p.media[0].id || p.media[0].ref) === m.id);
                return (
                  <figure key={m.id} className={`${m.resolved ? "" : "missing"} ${isPortrait ? "portrait" : ""}`.trim()}>
                    {m.resolved?.kind === "image" ? <img src={m.resolved.url} alt={m.description} loading="lazy" onClick={() => api.openFile(m.resolved.file)} /> : <div className="ph" onClick={() => m.resolved && api.openFile(m.resolved.file)}>{m.resolved ? "PDF" : "file not found"}</div>}
                    <figcaption title={m.resolved?.file || m.src}>
                      {isPortrait ? "Portrait · " : ""}{m.description || m.src}
                    </figcaption>
                    {editing && onPerson ? (
                      <div className="gallery-actions">
                        {isPortrait ? null : <button type="button" className="mini" disabled={busy} onClick={() => save("media", { action: "portrait", personId: pid, mediaId: m.id })}>Set as portrait</button>}
                        <button type="button" className="mini ghost" disabled={busy} onClick={() => save("media", { action: "detach", personId: pid, mediaId: m.id })}>Detach</button>
                      </div>
                    ) : null}
                  </figure>
                );
              }) : <div className="muted">No media attached.</div>}
            </div>
          </>
        ) : null}

        {tab === "resources" ? <ResourceLinks model={model} pid={pid} links={links} onLinksChange={onLinksChange} onHover={onHoverLink} onLeave={onLeaveLink} /> : null}

        {tab === "hints" ? (
          <div className="hint-list">
            {myHints.length ? myHints.map((h) => <HintCard key={h.id} hint={h} model={model} onState={onHintState} onOpenPerson={onOpen} onHoverLink={onHoverLink} onLeaveLink={onLeaveLink} compact />) : <div className="muted">No hints. This person is well documented.</div>}
          </div>
        ) : null}
      </div>
    </motion.aside>
  );
}
