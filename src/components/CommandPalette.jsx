import { useEffect, useState } from "react";
import { Command } from "cmdk";
import Portrait from "./Portrait.jsx";
import { VIEWS } from "../lib/views.js";

export default function CommandPalette({ open, onClose, model, onOpenPerson, onSetRoot, onView, onHome, selected, onRelate, trees = [], treeId, onTree, hideLiving, onPrivacy, editable, editing, onToggleEdit, onUndo, onExport, onExportGedcom, onExportShare }) {
  const [q, setQ] = useState("");
  useEffect(() => { if (!open) setQ(""); }, [open]);
  if (!open) return null;
  const results = q.trim() ? model.search(q, 25) : model.search(model.person(model.homeId)?.surname || "a", 12);
  return (
    <div className="palette-backdrop" onMouseDown={onClose}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()}>
        <Command label="Search" shouldFilter={false}>
          <Command.Input autoFocus value={q} onValueChange={setQ} placeholder="Search people, places, years… or type a view name" />
          <Command.List>
            <Command.Empty>No matches.</Command.Empty>
            <Command.Group heading="People">
              {results.map((id) => {
                const p = model.person(id);
                const via = q.trim() ? model.matchedAlias(id, q) : "";
                return (
                  <Command.Item key={id} value={`p-${id}`} onSelect={() => { onOpenPerson(id); onClose(); }}>
                    <Portrait model={model} pid={id} size={30} ring={false} />
                    <span className="pal-name">{p.name}{via ? <span className="pal-alias"> · {via}</span> : null}</span>
                    <span className="pal-years">{model.years(id)}</span>
                    <span className="pal-id">{id}</span>
                    <button type="button" className="mini" onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); onSetRoot(id); onClose(); }}>center</button>
                    {onRelate ? <button type="button" className="mini" onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); onRelate(id); onClose(); }} title={selected ? `How is ${model.person(selected)?.name} related to this person?` : "How is the home person related to this person?"}>relate</button> : null}
                  </Command.Item>
                );
              })}
            </Command.Group>
            <Command.Group heading="Views">
              {VIEWS.filter((v) => !q || v.label.toLowerCase().includes(q.toLowerCase())).map((v) => (
                <Command.Item key={v.id} value={`v-${v.id}`} onSelect={() => { onView(v.id); onClose(); }}>
                  <span className="pal-key">{v.key}</span><span className="pal-name">{v.label}</span><span className="pal-years">{v.desc}</span>
                </Command.Item>
              ))}
              <Command.Item value="home" onSelect={() => { onHome(); onClose(); }}><span className="pal-key">H</span><span className="pal-name">Go to home person</span></Command.Item>
              {editable ? (
                <>
                  <Command.Item value="edit-tree" onSelect={() => { onToggleEdit?.(); onClose(); }}>
                    <span className="pal-key">E</span>
                    <span className="pal-name">{editing ? "Stop editing" : "Edit the tree"}</span>
                  </Command.Item>
                  <Command.Item value="undo-edit" onSelect={() => { onUndo?.(); onClose(); }}>
                    <span className="pal-name">Undo last edit</span>
                  </Command.Item>
                  <Command.Item value="export-gramps" onSelect={() => { onExport?.(); onClose(); }}>
                    <span className="pal-name">Export timestamped Gramps XML</span>
                  </Command.Item>
                  <Command.Item value="export-gedcom" onSelect={() => { onExportGedcom?.(); onClose(); }}>
                    <span className="pal-name">Export GEDCOM for Ancestry</span>
                  </Command.Item>
                </>
              ) : null}
              <Command.Item value="share-view" onSelect={() => { onExportShare?.(); onClose(); }}>
                <span className="pal-name">Share view — export a read-only pack (living redacted)</span>
              </Command.Item>
              <Command.Item value="privacy-living" onSelect={() => { onPrivacy?.(!hideLiving); onClose(); }}>
                <span className="pal-key">L</span>
                <span className="pal-name">{hideLiving ? "Unlock living names" : "Hide living names"}</span>
                <span className="pal-years">{model.livingCount ? `${model.livingCount} living` : ""}</span>
              </Command.Item>
            </Command.Group>
            {trees.length > 1 ? (
              <Command.Group heading="Trees">
                {trees.filter((t) => !q || t.title.toLowerCase().includes(q.toLowerCase()) || t.id.includes(q.toLowerCase())).map((t) => (
                  <Command.Item key={t.id} value={`tree-${t.id}`} onSelect={() => { onTree?.(t.id); onClose(); }}>
                    <span className="pal-key">{t.id === treeId ? "●" : "○"}</span>
                    <span className="pal-name">{t.title}</span>
                    <span className="pal-years">{t.local ? "local" : t.format}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            ) : null}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
