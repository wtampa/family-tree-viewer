import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import { confidenceColor, lineColor } from "../lib/color.js";
import { personStops, uniqueMappedPlaces } from "../lib/places.js";
import PlacesMap from "./PlacesMap.jsx";
import PlacesList from "../components/PlacesList.jsx";

const ERAS = [
  { from: 1762, to: 1763, label: "British Havana", color: "#6fa8ff" },
  { from: 1775, to: 1783, label: "American Revolution · Loyalists to Bahamas", color: "#8bff9a" },
  { from: 1834, to: 1838, label: "Bahamas emancipation", color: "#8bff9a" },
  { from: 1861, to: 1865, label: "US Civil War", color: "#ffb86b" },
  { from: 1868, to: 1878, label: "Ten Years' War (Cuba) · Key West exile", color: "#ff7a59" },
  { from: 1879, to: 1880, label: "Guerra Chiquita", color: "#ff7a59" },
  { from: 1886, to: 1886, label: "Ybor City founded", color: "#3dd6ff" },
  { from: 1895, to: 1898, label: "Cuban War of Independence · 1898 war", color: "#ff5f6d" },
  { from: 1914, to: 1918, label: "WWI", color: "#c58bff" },
  { from: 1918, to: 1919, label: "Influenza", color: "#facc15" },
  { from: 1929, to: 1939, label: "Depression", color: "#94a3b8" },
  { from: 1941, to: 1945, label: "WWII", color: "#c58bff" },
  { from: 1959, to: 1962, label: "Cuban Revolution · exile wave", color: "#ff7a59" },
];

export default function TimelineView({ model, rootId, onSelect, onHover, onLeave, exportRef }) {
  const svgRef = useRef(null);
  const wrapRef = useRef(null);
  const [scope, setScope] = useState("ancestors"); // ancestors | descendants | all
  const [showEras, setShowEras] = useState(true);
  const [showMap, setShowMap] = useState(true);

  const scopeIds = useMemo(() => {
    if (scope === "all") return Object.keys(model.people);
    if (scope === "descendants") return [rootId, ...model.descendants(rootId).keys(), ...model.spouses(rootId)];
    return [rootId, ...model.ancestors(rootId).keys()];
  }, [model, rootId, scope]);

  const rootStops = useMemo(() => personStops(model, rootId), [model, rootId]);
  const scopeStops = useMemo(() => {
    const out = [];
    for (const id of scopeIds) out.push(...personStops(model, id));
    return out;
  }, [model, scopeIds]);
  const mapPoints = useMemo(() => uniqueMappedPlaces(scopeStops), [scopeStops]);

  const rows = useMemo(() => {
    const ids = scopeIds;
    const gen = model.generationsFrom(rootId);
    const out = [];
    for (const id of new Set(ids)) {
      const v = model.vitals(id);
      const b = v.birthLike?.date?.year;
      const d = v.deathLike?.date?.year;
      if (!b && !d) continue;
      const start = b ?? d - 70;
      const end = d ?? (v.living ? new Date().getFullYear() : Math.min(new Date().getFullYear(), b + 75));
      out.push({ id, name: model.person(id).name, start, end, estStart: !b, estEnd: !d, gen: gen[id] ?? 0, events: v.all.filter((e) => e.date?.year), living: v.living });
    }
    out.sort((a, b) => b.gen - a.gen || a.start - b.start);
    return out;
  }, [model, rootId, scopeIds]);

  useEffect(() => {
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    if (!rows.length) return;
    const W = wrapRef.current?.clientWidth || 1200;
    const rowH = 22;
    const margin = { top: 46, right: 30, bottom: 30, left: 250 };
    const H = margin.top + margin.bottom + rows.length * rowH;
    svg.attr("width", W).attr("height", H);
    const minY = d3.min(rows, (r) => r.start) - 5;
    const maxY = d3.max(rows, (r) => r.end) + 5;
    const x = d3.scaleLinear().domain([minY, maxY]).range([margin.left, W - margin.right]);

    // eras
    if (showEras) {
      const eg = svg.append("g").attr("class", "eras");
      for (const e of ERAS) {
        if (e.to < minY || e.from > maxY) continue;
        const x0 = x(Math.max(e.from, minY)), x1 = x(Math.min(e.to + 1, maxY));
        eg.append("rect").attr("x", x0).attr("y", margin.top - 8).attr("width", Math.max(2, x1 - x0)).attr("height", H - margin.top - margin.bottom + 8).attr("fill", e.color).attr("fill-opacity", 0.07);
        eg.append("text").attr("x", x0 + 3).attr("y", margin.top - 26).attr("font-size", 9).attr("fill", e.color).attr("fill-opacity", 0.9).text(e.label);
      }
    }

    // axis
    const axis = d3.axisTop(x).ticks(Math.min(20, Math.floor((maxY - minY) / 10))).tickFormat(d3.format("d"));
    svg.append("g").attr("transform", `translate(0,${margin.top - 10})`).attr("class", "axis").call(axis);
    svg.append("g").attr("class", "grid").selectAll("line").data(x.ticks(Math.floor((maxY - minY) / 10))).join("line")
      .attr("x1", (d) => x(d)).attr("x2", (d) => x(d)).attr("y1", margin.top - 8).attr("y2", H - margin.bottom).attr("stroke", "rgba(255,255,255,0.05)");

    // generation bands
    let lastGen = null;
    rows.forEach((r, i) => {
      if (r.gen !== lastGen) {
        lastGen = r.gen;
        svg.append("text").attr("x", 8).attr("y", margin.top + i * rowH + rowH / 2 + 4).attr("font-size", 10).attr("fill", "#6b7394").text(r.gen > 0 ? `+${r.gen}` : r.gen === 0 ? "root" : `${r.gen}`);
        svg.append("line").attr("x1", 0).attr("x2", W).attr("y1", margin.top + i * rowH - 1).attr("y2", margin.top + i * rowH - 1).attr("stroke", "rgba(255,255,255,0.08)");
      }
    });

    const g = svg.append("g");
    const row = g.selectAll("g.row").data(rows).join("g").attr("class", "row").attr("transform", (_r, i) => `translate(0,${margin.top + i * rowH})`)
      .style("cursor", "pointer")
      .on("mouseenter", (_e, r) => onHover?.(r.id)).on("mouseleave", () => onLeave?.())
      .on("click", (e, r) => onSelect?.(r.id, { reroot: !e.shiftKey && e.detail === 2 }));
    row.append("rect").attr("x", 0).attr("y", 0).attr("width", W).attr("height", rowH).attr("fill", "transparent").attr("class", "row-bg");
    row.append("text").attr("x", margin.left - 10).attr("y", rowH / 2 + 4).attr("text-anchor", "end").attr("font-size", 11.5).attr("fill", (r) => (r.id === rootId ? "#3dd6ff" : "#e6e9f5")).text((r) => r.name);
    row.append("rect").attr("class", "life")
      .attr("x", (r) => x(r.start)).attr("y", 5).attr("width", (r) => Math.max(3, x(r.end) - x(r.start))).attr("height", rowH - 10).attr("rx", 5)
      .attr("fill", (r) => { const l = model.lineOf(r.id); return l && l !== "home" ? lineColor(l) : lineColor(model.person(r.id).surname); })
      .attr("fill-opacity", (r) => 0.35 + model.conf(r.id).score / 250)
      .attr("stroke", (r) => confidenceColor(model.conf(r.id).score)).attr("stroke-width", 1)
      .attr("stroke-dasharray", (r) => (r.estStart || r.estEnd ? "4 3" : null));
    row.selectAll("circle.ev").data((r) => r.events.map((e) => ({ ...e, pid: r.id }))).join("circle").attr("class", "ev")
      .attr("cx", (e) => x(e.date.year)).attr("cy", rowH / 2).attr("r", 3.2)
      .attr("fill", (e) => (/Birth|Baptism/.test(e.type) ? "#8bff9a" : /Death|Burial/.test(e.type) ? "#ff5f6d" : /Marriage/.test(e.type) ? "#ffd34d" : "#cbd5e1"))
      .attr("stroke", "#0b0f14").attr("stroke-width", 1)
      .append("title").text((e) => `${e.type} ${e.date.text}${e.place ? ` — ${model.placeName(e)}` : ""}`);
    if (exportRef) exportRef.current = { node: () => svgRef.current, kind: "svg" };
  }, [rows, showEras, model, rootId, onSelect, onHover, onLeave, exportRef]);

  return (
    <div className="chart-wrap">
      <div className="chart-toolbar">
        <label>Scope
          <select value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="ancestors">ancestors of root</option>
            <option value="descendants">descendants of root</option>
            <option value="all">everyone with dates</option>
          </select>
        </label>
        <label className="chk"><input type="checkbox" checked={showEras} onChange={(e) => setShowEras(e.target.checked)} /> Historical eras</label>
        <label className="chk"><input type="checkbox" checked={showMap} onChange={(e) => setShowMap(e.target.checked)} /> Places map</label>
        <span className="hint-text">{rows.length} people · {mapPoints.length} mapped places · green = birth, gold = marriage, red = death · dashed = estimated end · double-click to re-root</span>
      </div>
      {showMap ? (
        <div className="places-panel">
          <PlacesMap
            points={mapPoints}
            path={rootStops}
            height={220}
            onSelect={onSelect}
            onHover={onHover}
            onLeave={onLeave}
          />
          <div className="places-list">
            <div className="places-list-head">
              <b>Path of {model.person(rootId)?.name}</b>
              <span className="muted small">{rootStops.length ? `${rootStops.length} stop${rootStops.length === 1 ? "" : "s"}` : "no places"}</span>
            </div>
            <PlacesList stops={rootStops} onSelect={onSelect} />
            {!mapPoints.length && rootStops.length ? (
              <div className="muted small places-note">Names come from the tree. Add coordinates in Gramps to plot them — this app does not geocode.</div>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="chart-stage timeline-scroll" ref={wrapRef}>
        <svg className="timeline-svg" ref={svgRef} />
      </div>
    </div>
  );
}
