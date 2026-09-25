/**
 * Searchable people directory for the share pack. Tap a name to center the tree.
 */
import { useMemo } from "react";
import Portrait from "../components/Portrait.jsx";

export default function SharePeople({ model, query, onQuery, currentId, onPick, onClose }) {
  const ids = useMemo(() => {
    const q = String(query || "").trim();
    if (q) return model.search(q, 80);
    return model.peopleList.map((p) => p.id);
  }, [model, query]);

  return (
    <aside className="share-people" role="dialog" aria-label="People">
      <div className="share-people-head">
        <div>
          <h2>People</h2>
          <p className="small muted">Type a name, or scroll. Tap someone to center the tree there.</p>
        </div>
        <button type="button" className="close" onClick={onClose} title="Close">×</button>
      </div>
      <div className="share-people-search">
        <input
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search names…"
          autoFocus
        />
        {query ? <button type="button" className="clear" onClick={() => onQuery("")}>Clear</button> : null}
      </div>
      <div className="share-people-list">
        {ids.length ? ids.map((id) => {
          const p = model.person(id);
          if (!p) return null;
          return (
            <button
              type="button"
              key={id}
              className={`chip ${id === currentId ? "on" : ""}`}
              onClick={() => onPick(id)}
            >
              <Portrait model={model} pid={id} size={30} ring={false} />
              <span className="chip-name">{p.name}</span>
              <span className="chip-years">{model.years(id)}</span>
            </button>
          );
        }) : <p className="muted small">No names match.</p>}
      </div>
    </aside>
  );
}
