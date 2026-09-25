import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { classifyLink } from "./LinkPreview.jsx";

const enc = encodeURIComponent;

/** Search links built from the person's own data (never from guessed names). */
export function autoLinks(model, pid) {
  const p = model.person(pid);
  if (!p) return [];
  const v = model.vitals(pid);
  const by = v.birthLike?.date?.year;
  const dy = v.deathLike?.date?.year;
  const place = model.placeName(v.birthLike) || model.placeName(v.deathLike) || "";
  const full = `${p.first} ${p.surname}`.trim();
  const out = [
    { label: "FamilySearch", url: `https://www.familysearch.org/search/record/results?q.givenName=${enc(p.first)}&q.surname=${enc(p.surname)}${by ? `&q.birthLikeDate.from=${by - 2}&q.birthLikeDate.to=${by + 2}` : ""}${place ? `&q.anyPlace=${enc(place)}` : ""}`, kind: "search" },
    { label: "Ancestry", url: `https://www.ancestry.com/search/?name=${enc(p.first)}_${enc(p.surname)}${by ? `&birth=${by}` : ""}${dy ? `&death=${dy}` : ""}`, kind: "search" },
    { label: "Find a Grave", url: `https://www.findagrave.com/memorial/search?firstname=${enc(p.first)}&lastname=${enc(p.surname)}${by ? `&birthyear=${by}&birthyearfilter=3` : ""}${dy ? `&deathyear=${dy}&deathyearfilter=3` : ""}`, kind: "search" },
    { label: "MyHeritage", url: `https://www.myheritage.com/research?formId=master&formMode=1&action=query&qname=Name+fn.${enc(p.first)}+ln.${enc(p.surname)}${by ? `&qbirth=Event+et.birth+ey.${by}` : ""}`, kind: "search" },
    { label: "Chronicling America", url: `https://chroniclingamerica.loc.gov/search/pages/results/?andtext=${enc(full)}&dateFilterType=yearRange${by ? `&date1=${Math.max(1770, by)}&date2=${Math.min(1963, (dy || by + 80))}` : ""}`, kind: "search" },
    { label: "Google", url: `https://www.google.com/search?q=${enc(`"${full}"${by ? ` ${by}` : ""}${place ? ` ${place.split(",")[0]}` : ""} genealogy`)}`, kind: "search" },
  ];
  if (/cuba|havana|matanzas|ybor|spain|españa|canarias/i.test(place)) {
    out.push({ label: "PARES (Spanish archives)", url: `https://pares.mcu.es/ParesBusquedas20/catalogo/find?nm=&texto=${enc(full)}`, kind: "search" });
  }
  if (/ital|sicil|penne|abruzzo|napoli|palermo/i.test(place)) {
    out.push({ label: "Antenati", url: `https://antenati.cultura.gov.it/search-nominative/?cognome=${enc(p.surname)}&nome=${enc(p.first)}`, kind: "search" });
  }
  return out;
}

export function LinkRow({ link, onHover, onLeave, onRemove }) {
  const { href, isLocal, kind, path } = classifyLink(link);
  const open = (e) => {
    e.preventDefault();
    if (isLocal && path) api.openFile(path).catch(() => window.open(href, "_blank"));
    else window.open(href, "_blank", "noopener");
  };
  return (
    <div className={`link-row link-${kind}`} onMouseEnter={(e) => onHover?.({ link, x: e.clientX, y: e.clientY })} onMouseMove={(e) => onHover?.({ link, x: e.clientX, y: e.clientY })} onMouseLeave={() => onLeave?.()}>
      <a href={href} onClick={open} title={href} className="link-a">
        <span className={`link-icon link-icon-${kind}`} />
        <span className="link-label">{link.label || link.path || href}</span>
      </a>
      {isLocal && path ? <a className="link-mini" href={href} target="_blank" rel="noreferrer" title="Open in browser tab">view</a> : null}
      {onRemove ? <button type="button" className="link-x" onClick={onRemove} title="Remove">×</button> : null}
    </div>
  );
}

export default function ResourceLinks({ model, pid, links, onLinksChange, onHover, onLeave }) {
  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [fileQ, setFileQ] = useState("");
  const [files, setFiles] = useState([]);
  const own = links?.[pid] || [];
  const auto = autoLinks(model, pid);
  const noteUrls = [];
  const p = model.person(pid);
  for (const nid of p?.notes || []) for (const u of model.notes[nid]?.urls || []) noteUrls.push({ label: u.replace(/^https?:\/\//, "").slice(0, 60), url: u, kind: "note" });
  for (const u of p?.urls || []) noteUrls.push({ label: u.description || u.href, url: u.href, kind: "gramps" });

  useEffect(() => {
    if (!adding) return;
    const t = setTimeout(() => api.files(fileQ).then((r) => setFiles(r.items || [])).catch(() => setFiles([])), 200);
    return () => clearTimeout(t);
  }, [adding, fileQ]);

  const add = async (item) => {
    const all = await api.addLink(pid, item);
    onLinksChange?.(all);
    setUrl(""); setLabel(""); setAdding(false);
  };
  const remove = async (i) => {
    const all = await api.removeLink(pid, i);
    onLinksChange?.(all);
  };

  return (
    <div className="resources">
      <div className="sec-head">
        <h4>Resources</h4>
        <button type="button" className="mini" onClick={() => setAdding((a) => !a)}>{adding ? "Cancel" : "+ Add link"}</button>
      </div>
      {own.length ? own.map((l, i) => <LinkRow key={`${l.url || l.path}-${i}`} link={l} onHover={onHover} onLeave={onLeave} onRemove={() => remove(i)} />) : <div className="muted small">No saved resources yet. Add a URL or a project file.</div>}
      {noteUrls.length ? (<><h5>From Gramps notes</h5>{noteUrls.map((l, i) => <LinkRow key={`n${i}`} link={l} onHover={onHover} onLeave={onLeave} />)}</>) : null}
      {adding ? (
        <div className="add-link">
          <input placeholder="https://… (Ancestry, FamilySearch, Find a Grave, newspaper clip…)" value={url} onChange={(e) => setUrl(e.target.value)} />
          <input placeholder="Label (optional)" value={label} onChange={(e) => setLabel(e.target.value)} />
          <button type="button" disabled={!/^https?:\/\//.test(url)} onClick={() => add({ url, label: label || undefined, kind: "web" })}>Save URL</button>
          <div className="or">or pick a project file</div>
          <input placeholder="Filter files in your research folder (name, folder…)" value={fileQ} onChange={(e) => setFileQ(e.target.value)} />
          <div className="file-list">
            {files.slice(0, 40).map((f) => (
              <button type="button" key={f.path} className="file-item" onClick={() => add({ path: f.path, label: label || f.name, kind: f.kind })}>
                <span className={`link-icon link-icon-${f.kind}`} />{f.path}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <h5>Search this person</h5>
      <div className="auto-links">
        {auto.map((l) => <LinkRow key={l.label} link={l} onHover={onHover} onLeave={onLeave} />)}
      </div>
    </div>
  );
}
