export default function PlacesList({ stops, onSelect }) {
  if (!stops?.length) return <div className="muted small">No places recorded.</div>;
  return (
    <ol className="places-list-ol">
      {stops.map((s, i) => (
        <li key={`${s.eventId || s.placeId || i}-${i}`}>
          <button type="button" className="places-stop" onClick={() => onSelect?.(s.personId)} title={s.title}>
            <span className="places-yr">{s.year ?? "—"}</span>
            <span className="places-type">{s.type}</span>
            <span className="places-name">{s.title}</span>
            {s.lat == null ? <span className="places-unmapped">unmapped</span> : null}
          </button>
        </li>
      ))}
    </ol>
  );
}
