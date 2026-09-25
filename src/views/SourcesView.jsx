import { useMemo, useState } from "react";
import { confidenceColor } from "../lib/color.js";
import { CONFIDENCE_LABEL } from "../lib/format.js";
import Portrait from "../components/Portrait.jsx";
import { SourceForm } from "../components/SourceEdit.jsx";

export default function SourcesView({ model, onOpen, editable, onEdit }) {
  const [sort, setSort] = useState("conf-asc");
  const [filter, setFilter] = useState("");
  const [tab, setTab] = useState("people");

  const people = useMemo(() => {
    const arr = Object.values(model.people).map((p) => ({ p, c: model.conf(p.id), gen: model.generations[p.id] })).filter(({ p }) => p.first && !/^unknown$/i.test(p.first));
    const f = filter.toLowerCase();
    const out = f ? arr.filter(({ p }) => p.name.toLowerCase().includes(f)) : arr;
    out.sort((a, b) => {
      if (sort === "conf-asc") return a.c.score - b.c.score || a.p.name.localeCompare(b.p.name);
      if (sort === "conf-desc") return b.c.score - a.c.score;
      if (sort === "gen") return (a.gen ?? 99) - (b.gen ?? 99) || a.c.score - b.c.score;
      return a.p.name.localeCompare(b.p.name);
    });
    return out;
  }, [model, sort, filter]);

  const citations = useMemo(() => Object.values(model.citations).map((c) => ({ ...c, src: model.sources[c.source] })).sort((a, b) => (a.src?.title || "").localeCompare(b.src?.title || "") || a.confidence - b.confidence), [model]);
  const sources = useMemo(() => Object.values(model.sources).sort((a, b) => b.citationCount - a.citationCount), [model]);

  // per-line meters
  const lines = useMemo(() => {
    const acc = {};
    for (const [pid, l] of Object.entries(model.lines)) {
      if (!l || l === "home") continue;
      (acc[l] ||= []).push(model.conf(pid).score);
    }
    return Object.entries(acc).map(([l, arr]) => ({ line: l, n: arr.length, avg: Math.round(arr.reduce((s, x) => s + x, 0) / arr.length) })).sort((a, b) => a.avg - b.avg);
  }, [model]);

  const overall = useMemo(() => {
    const arr = Object.values(model.confidence).map((c) => c.score);
    return arr.length ? Math.round(arr.reduce((s, x) => s + x, 0) / arr.length) : 0;
  }, [model]);

  return (
    <div className="page">
      <div className="page-head">
        <h2>Sources &amp; confidence</h2>
        <div className="stats">
          <div className="stat"><b style={{ color: confidenceColor(overall) }}>{overall}</b><span>avg evidence /100</span></div>
          <div className="stat"><b>{Object.keys(model.citations).length}</b><span>citations</span></div>
          <div className="stat"><b>{Object.keys(model.sources).length}</b><span>sources</span></div>
          <div className="stat"><b>{Object.values(model.confidence).filter((c) => c.memberOnly).length}</b><span>member-tree only</span></div>
          <div className="stat"><b>{Object.values(model.confidence).filter((c) => c.citations === 0).length}</b><span>uncited people</span></div>
        </div>
      </div>
      <div className="line-meters">
        {lines.map((l) => (
          <div className="meter" key={l.line}>
            <span className="meter-label">{l.line} <span className="muted">({l.n})</span></span>
            <span className="bar"><i style={{ width: `${l.avg}%`, background: confidenceColor(l.avg) }} /></span>
            <span className="meter-num" style={{ color: confidenceColor(l.avg) }}>{l.avg}</span>
          </div>
        ))}
      </div>
      <div className="drawer-tabs page-tabs">
        {[["people", "People"], ["citations", `Citations ${citations.length}`], ["sources", `Sources ${sources.length}`]].map(([k, l]) => <button type="button" key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>)}
        <span className="spacer" />
        {tab === "people" ? (<>
          <input placeholder="Filter by name" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="conf-asc">weakest first</option>
            <option value="conf-desc">strongest first</option>
            <option value="gen">by generation</option>
            <option value="name">by name</option>
          </select>
        </>) : null}
      </div>
      {tab === "people" ? (
        <table className="table">
          <thead><tr><th></th><th>Person</th><th>Gen</th><th>Score</th><th>Birth</th><th>Parents</th><th>Death</th><th>Marriage</th><th>Cites</th><th>Classes</th></tr></thead>
          <tbody>
            {people.map(({ p, c, gen }) => {
              const f = (k) => c.facts?.find((x) => x.key === k);
              const cell = (k) => { const x = f(k); if (!x) return <td className="muted">n/a</td>; return <td><span className="pill" style={{ background: x.has ? confidenceColor(x.score) : "transparent", color: x.has ? "#0b0f14" : "#6b7394", border: x.has ? "none" : "1px dashed #3a4160" }}>{x.has ? x.score : "missing"}</span></td>; };
              return (
                <tr key={p.id} onClick={() => onOpen(p.id)} className="row-click">
                  <td><Portrait model={model} pid={p.id} size={34} ring={false} /></td>
                  <td><b>{p.name}</b><div className="muted small">{model.years(p.id)}</div></td>
                  <td className="muted">{gen ?? "—"}</td>
                  <td><b style={{ color: confidenceColor(c.score) }}>{c.score}</b></td>
                  {cell("birth")}{cell("parents")}{cell("death")}{cell("marriage")}
                  <td>{c.citations}</td>
                  <td className="small muted">{c.classes ? `${c.classes.primary}p · ${c.classes.index}i · ${c.classes["member-tree"]}t` : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}
      {tab === "citations" ? (
        <table className="table">
          <thead><tr><th>Source</th><th>Page / detail</th><th>Confidence</th><th>Supports</th></tr></thead>
          <tbody>
            {citations.map((c) => (
              <tr key={c.id}>
                <td><b>{c.src?.title || "(no source)"}</b><div className="muted small">{c.id}</div></td>
                <td className="small">{c.page}</td>
                <td><span style={{ color: confidenceColor(c.confidence * 25) }}>{CONFIDENCE_LABEL[c.confidence] || c.confidence}</span></td>
                <td className="small">{(c.usedBy || []).map((u, i) => {
                  if (u.kind === "event") { const e = model.events[u.id]; const who = e?.people?.[0]?.id || e?.families?.[0]?.id; const pp = who && model.person(who); return <span key={i} className="use" onClick={() => pp && onOpen(pp.id)}>{e?.type}{pp ? ` — ${pp.name}` : ""}</span>; }
                  if (u.kind === "person" || u.kind === "name") { const pp = model.person(u.id); return <span key={i} className="use" onClick={() => pp && onOpen(pp.id)}>{u.kind} — {pp?.name}</span>; }
                  if (u.kind === "family") { const f = model.family(u.id); return <span key={i} className="use">family {f?.father ? model.person(f.father)?.name : "?"} × {f?.mother ? model.person(f.mother)?.name : "?"}</span>; }
                  return <span key={i} className="use">{u.kind}</span>;
                })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {tab === "sources" && editable ? <SourceForm onSave={(body) => onEdit?.("source", body)} /> : null}
      {tab === "sources" ? (
        <table className="table">
          <thead><tr><th>Title</th><th>Author / publication</th><th>Citations</th><th>Repository</th></tr></thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.id}>
                <td><b>{s.title}</b><div className="muted small">{s.id}{s.abbrev ? ` · ${s.abbrev}` : ""}</div></td>
                <td className="small">{[s.author, s.pubinfo].filter(Boolean).join(" · ")}</td>
                <td>{s.citationCount}</td>
                <td className="small">{s.repositories.map((r) => model.m.repositories[r.id]?.name).filter(Boolean).join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
