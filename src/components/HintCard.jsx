import { useState } from "react";
import { HINT_COLORS } from "../lib/color.js";
import { LinkRow } from "./ResourceLinks.jsx";

export const HINT_LABEL = {
  "brick-wall": "Brick wall",
  "missing-birth": "Missing birth",
  "missing-birthplace": "Missing birthplace",
  "missing-death": "Missing death",
  "missing-marriage": "Missing marriage",
  "missing-spouse": "Missing spouse",
  uncited: "Uncited",
  "member-tree-only": "Member-tree only",
  conflict: "Conflict",
  duplicate: "Possible duplicate",
};

export default function HintCard({ hint, model, onState, onOpenPerson, onHoverLink, onLeaveLink, compact = false }) {
  const [open, setOpen] = useState(!compact);
  const color = HINT_COLORS[hint.type] || "#9aa3c7";
  const p = model.person(hint.personId);
  const set = (state) => onState?.(hint.id, state);
  return (
    <div className={`hint-card state-${hint.state} ${open ? "open" : ""}`} style={{ "--accent": color }}>
      <div className="hint-head" onClick={() => setOpen((o) => !o)}>
        <span className="hint-type">{HINT_LABEL[hint.type] || hint.type}</span>
        <span className="hint-title">{hint.title}</span>
        <span className="hint-prio" title="Priority (closeness to home person × severity)">{hint.priority}</span>
        <span className={`hint-conf conf-${hint.suggestionConfidence}`} title="How confident the engine is that this record class exists for this place/era">{hint.suggestionConfidence}</span>
      </div>
      {open ? (
        <div className="hint-body">
          <div className="hint-why">{hint.why}</div>
          {hint.wall ? (
            <div className="hint-wall">
              <b>brick-walls/OPEN.md #{hint.wall.n}</b> · {hint.wall.status}
              {hint.wall.nextRecord ? <div><span className="muted">Next record:</span> {hint.wall.nextRecord}</div> : null}
              {hint.wall.missing ? <div><span className="muted">Missing:</span> {hint.wall.missing}</div> : null}
            </div>
          ) : null}
          {hint.suggestedRecords?.length ? (
            <ul className="hint-records">{hint.suggestedRecords.map((r, i) => <li key={i}>{r}</li>)}</ul>
          ) : null}
          {hint.searchLinks?.length ? (
            <div className="hint-links">{hint.searchLinks.map((l) => <LinkRow key={l.url} link={l.local ? { label: l.label, url: l.url, kind: "pdf" } : l} onHover={onHoverLink} onLeave={onLeaveLink} />)}</div>
          ) : null}
          <div className="hint-actions">
            {p ? <button type="button" className="mini" onClick={() => onOpenPerson?.(hint.personId)}>Open {p.first || p.name}</button> : null}
            {hint.otherId ? <button type="button" className="mini" onClick={() => onOpenPerson?.(hint.otherId)}>Open other</button> : null}
            <span className="spacer" />
            <button type="button" className={`mini ${hint.state === "pinned" ? "on" : ""}`} onClick={() => set(hint.state === "pinned" ? "open" : "pinned")}>{hint.state === "pinned" ? "Unpin" : "Pin"}</button>
            <button type="button" className={`mini ${hint.state === "done" ? "on" : ""}`} onClick={() => set(hint.state === "done" ? "open" : "done")}>{hint.state === "done" ? "Reopen" : "Done"}</button>
            <button type="button" className={`mini ${hint.state === "dismissed" ? "on" : ""}`} onClick={() => set(hint.state === "dismissed" ? "open" : "dismissed")}>{hint.state === "dismissed" ? "Restore" : "Dismiss"}</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
