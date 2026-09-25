/**
 * Slim read-only person card for the share pack. Name, years, family chips.
 * No edit, no media attach, no hints, no resources, no census, no map.
 */
import Portrait from "../components/Portrait.jsx";

function Chip({ model, pid, onOpen }) {
  const p = model.person(pid);
  if (!p) return null;
  return (
    <button type="button" className="chip" onClick={() => onOpen(pid)}>
      <Portrait model={model} pid={pid} size={30} ring={false} />
      <span className="chip-name">{p.name}</span>
      <span className="chip-years">{model.years(pid)}</span>
    </button>
  );
}

function ChipGroup({ title, ids, model, onOpen }) {
  if (!ids.length) return null;
  return (
    <section>
      <h4>{title}</h4>
      {ids.map((id) => <Chip key={id} model={model} pid={id} onOpen={onOpen} />)}
    </section>
  );
}

export default function ShareCard({ model, pid, onOpen, onSetRoot, onClose }) {
  const p = model.person(pid);
  if (!p) return null;
  const v = model.vitals(pid);
  const birthPlace = model.placeName(v.birthLike);
  const deathPlace = model.placeName(v.deathLike);
  return (
    <aside className="drawer">
      <div className="drawer-head">
        <Portrait model={model} pid={pid} size={64} />
        <div className="drawer-title">
          <h2>{p.name}</h2>
          <div className="sub">
            <span>{model.years(pid) || "no dates"}</span>
            {pid === model.homeId ? <span>home person</span> : null}
          </div>
        </div>
        <button type="button" className="close" onClick={onClose} title="Close">×</button>
      </div>
      <div className="drawer-actions">
        <button type="button" onClick={() => onSetRoot(pid)}>Center tree here</button>
      </div>
      <div className="drawer-body">
        {birthPlace || deathPlace ? (
          <section>
            <h4>Places</h4>
            {birthPlace ? <div className="small">Born · {birthPlace}</div> : null}
            {deathPlace ? <div className="small">Died · {deathPlace}</div> : null}
          </section>
        ) : null}
        <ChipGroup title="Parents" ids={model.parents(pid)} model={model} onOpen={onOpen} />
        <ChipGroup title="Spouses" ids={model.spouses(pid)} model={model} onOpen={onOpen} />
        <ChipGroup title="Children" ids={model.children(pid)} model={model} onOpen={onOpen} />
        <ChipGroup title="Siblings" ids={model.siblings(pid)} model={model} onOpen={onOpen} />
      </div>
    </aside>
  );
}
