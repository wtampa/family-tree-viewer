import { useEffect, useMemo, useRef, useState } from "react";
import * as f3 from "family-chart";
import "family-chart/styles/family-chart.css";
import { pedigreeData } from "../lib/chart-data.js";
import { confidenceColor } from "../lib/color.js";
import { initials } from "../lib/format.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function ring(score, size = 44) {
  const r = (size - 4) / 2;
  const c = 2 * Math.PI * r;
  const dash = (Math.max(0, Math.min(100, score || 0)) / 100) * c;
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="rgba(255,255,255,.10)" stroke-width="3" fill="none"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="${confidenceColor(score)}" stroke-width="3" fill="none"
      stroke-dasharray="${dash.toFixed(1)} ${c.toFixed(1)}" stroke-linecap="round" transform="rotate(-90 ${size / 2} ${size / 2})"/>
  </svg>`;
}

export function cardHtml(d, { compact = false, collapse = false } = {}) {
  const x = d.data.data;
  if (d.data.to_add || d.data.unknown) {
    return `<div class="card-inner ft-card ft-card-empty"><div class="ft-name">Unknown</div></div>`;
  }
  const name = `${x["first name"] || ""} ${x["last name"] || ""}`.trim() || "(unnamed)";
  const years = x.birthday || x.deathday ? `${x.birthday || "?"} – ${x.deathday || (x.living ? "" : "?")}` : "";
  const place = x.birthPlace || x.deathPlace || "";
  const avatar = x.avatar
    ? `<img class="ft-avatar" src="${esc(x.avatar)}" alt="" loading="lazy"/>`
    : `<div class="ft-avatar ft-avatar-init" style="--c:${esc(x.color)}">${esc(initials(name))}</div>`;
  return `
    <div class="card-inner ft-card ${x.wall ? "ft-wall" : ""} ${x.placeholder ? "ft-placeholder" : ""} ${d.data.main ? "ft-main" : ""} ${collapse ? "ft-collapse" : ""}" style="--line:${esc(x.color)}">
      <div class="ft-avatar-wrap">${avatar}${ring(x.confidence, 48)}</div>
      <div class="ft-text">
        <div class="ft-name">${esc(name)}</div>
        ${years ? `<div class="ft-years">${esc(years)}</div>` : ""}
        ${!compact && place ? `<div class="ft-place">${esc(place)}</div>` : ""}
      </div>
      ${x.wall ? `<div class="ft-badge" title="Brick wall: parents unknown">wall</div>` : ""}
      ${collapse ? `<div class="ft-diamond" title="Pedigree collapse: this person occupies two ancestor slots">◇</div>` : ""}
    </div>`;
}

/** family-chart throws `no parents` when siblings are on but the main card has no parent nodes (ancestry depth 0). */
function safeUpdateTree(chart, opts, { allowSiblings } = {}) {
  try {
    chart.updateTree(opts);
  } catch (e) {
    if (!/no parents/i.test(e?.message || "") || allowSiblings === false) throw e;
    chart.setShowSiblingsOfMain(false);
    chart.updateTree(opts);
  }
}

/**
 * Pedigree / Descendants / Hourglass with family-chart.
 */
export default function ChartView({ model, mode, rootId, onSelect, onHover, onLeave, settings, onSettings, exportRef }) {
  const contRef = useRef(null);
  const chartRef = useRef(null);
  const collapsedRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [chartError, setChartError] = useState("");

  const ancestry = mode === "descendants" ? 0 : Math.max(0, Math.min(12, Number(settings.ancestry) || 0));
  const progeny = mode === "pedigree" ? 0 : Math.max(0, Math.min(10, Number(settings.progeny) || 0));
  const showSiblings = Boolean(settings.siblings && ancestry > 0);

  const collapsed = useMemo(() => model.collapsedAncestors(rootId, Math.max(ancestry, 1)), [model, rootId, ancestry]);
  collapsedRef.current = collapsed;

  const data = useMemo(
    () => pedigreeData(model, { rootId, ancestry, progeny, siblings: showSiblings }),
    [model, rootId, ancestry, progeny, showSiblings],
  );

  // create chart once per dataset
  useEffect(() => {
    const cont = contRef.current;
    if (!cont) return;
    cont.innerHTML = "";
    if (!data.length) {
      setChartError("This person is not in the tree.");
      return;
    }
    try {
      const chart = f3
        .createChart(cont, data)
        .setTransitionTime(650)
        .setCardXSpacing(settings.compact ? 210 : 260)
        .setCardYSpacing(settings.compact ? 130 : 170)
        .setSingleParentEmptyCard(false)
        .setShowSiblingsOfMain(showSiblings)
        .setAncestryDepth(ancestry)
        .setProgenyDepth(progeny);
      if (settings.horizontal) chart.setOrientationHorizontal(); else chart.setOrientationVertical();

      const card = chart
        .setCardHtml()
        .setStyle("rect")
        .setCardInnerHtmlCreator((d) => cardHtml(d, { compact: settings.compact, collapse: collapsedRef.current?.has(d.data.id) }))
        .setOnHoverPathToMain()
        .setOnCardClick((e, d) => {
          const id = d.data.id;
          if (e.shiftKey || e.ctrlKey || e.metaKey) { onSelect?.(id, { reroot: false }); return; }
          onSelect?.(id, { reroot: true });
          chart.updateMainId(id);
          safeUpdateTree(chart, { tree_position: "main_to_middle" }, { allowSiblings: showSiblings });
        })
        .setOnCardUpdate(function (d) {
          const el = this.querySelector(".card");
          if (!el) return;
          el.addEventListener("mouseenter", () => onHover?.(d.data.id));
          el.addEventListener("mouseleave", () => onLeave?.());
        });
      chart.updateMainId(rootId);
      safeUpdateTree(chart, { initial: true, tree_position: "fit" }, { allowSiblings: showSiblings });
      chartRef.current = { chart, card, applied: JSON.stringify([ancestry, progeny, showSiblings, rootId]) };
      setChartError("");
      setReady(true);
    } catch (e) {
      chartRef.current = null;
      setChartError(e?.message || "The chart could not be drawn.");
    }
    return () => { chartRef.current = null; cont.innerHTML = ""; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, settings.horizontal, settings.compact]);

  // update depth / siblings / root
  useEffect(() => {
    const ref = chartRef.current;
    const c = ref?.chart;
    if (!c) return;
    const key = JSON.stringify([ancestry, progeny, showSiblings, rootId]);
    if (ref.applied === key) return;
    const rootChanged = c.store.getMainId?.() !== rootId;
    ref.applied = key;
    c.setAncestryDepth(ancestry).setProgenyDepth(progeny).setShowSiblingsOfMain(showSiblings);
    if (rootId && rootChanged) c.updateMainId(rootId);
    safeUpdateTree(c, { tree_position: rootChanged ? "main_to_middle" : "fit" }, { allowSiblings: showSiblings });
  }, [ancestry, progeny, showSiblings, rootId, ready]);

  useEffect(() => {
    if (exportRef) exportRef.current = { node: () => contRef.current, kind: "html" };
  }, [exportRef]);

  return (
    <div className="chart-wrap">
      <div className="chart-toolbar">
        <label>Ancestors <input type="range" min="0" max="12" value={settings.ancestry} disabled={mode === "descendants"} onChange={(e) => onSettings({ ancestry: Number(e.target.value) })} /> <b>{mode === "descendants" ? "—" : settings.ancestry}</b></label>
        <label>Descendants <input type="range" min="0" max="10" value={settings.progeny} disabled={mode === "pedigree"} onChange={(e) => onSettings({ progeny: Number(e.target.value) })} /> <b>{mode === "pedigree" ? "—" : settings.progeny}</b></label>
        <label className="chk"><input type="checkbox" checked={settings.siblings} disabled={mode === "descendants"} onChange={(e) => onSettings({ siblings: e.target.checked })} /> Siblings</label>
        <label className="chk"><input type="checkbox" checked={settings.horizontal} onChange={(e) => onSettings({ horizontal: e.target.checked })} /> Horizontal</label>
        <label className="chk"><input type="checkbox" checked={settings.compact} onChange={(e) => onSettings({ compact: e.target.checked })} /> Compact</label>
        <button type="button" onClick={() => { const c = chartRef.current?.chart; if (c) safeUpdateTree(c, { tree_position: "fit" }, { allowSiblings: showSiblings }); }}>Fit</button>
        <button type="button" onClick={() => { const c = chartRef.current?.chart; if (!c) return; c.updateMainId(model.homeId); safeUpdateTree(c, { tree_position: "main_to_middle" }, { allowSiblings: showSiblings }); onSelect?.(model.homeId, { reroot: true }); }}>Home</button>
        <span className="hint-text">Click a card to re-center · scroll to zoom · drag to pan · Shift-click for details · ◇ = pedigree collapse</span>
      </div>
      {chartError ? <p className="chart-error">{chartError}</p> : null}
      <div className="f3 chart-stage" ref={contRef} />
    </div>
  );
}
