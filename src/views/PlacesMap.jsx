import { useEffect, useRef } from "react";
import * as d3 from "d3";
import { eventDotColor, mappedLine } from "../lib/places.js";

function distinctCoords(rows) {
  const seen = new Set();
  const out = [];
  for (const r of rows || []) {
    if (r.lat == null || r.long == null) continue;
    const k = `${r.lat.toFixed(5)},${r.long.toFixed(5)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

export default function PlacesMap({
  points = [],
  path = [],
  height = 220,
  compact = false,
  onSelect,
  onHover,
  onLeave,
}) {
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const selectRef = useRef(onSelect);
  const hoverRef = useRef(onHover);
  const leaveRef = useRef(onLeave);
  selectRef.current = onSelect;
  hoverRef.current = onHover;
  leaveRef.current = onLeave;
  const mapped = points.length > 0 || path.some((p) => p.lat != null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const svgEl = svgRef.current;
    if (!wrap || !svgEl) return;

    const draw = () => {
      const svg = d3.select(svgEl);
      svg.selectAll("*").remove();
      const w = wrap.clientWidth || 400;
      const h = height;
      svg.attr("width", w).attr("height", h).attr("viewBox", `0 0 ${w} ${h}`);

      if (!mapped) {
        if (!path.length) return;
        const schematic = [];
        for (const s of path) {
          const last = schematic[schematic.length - 1];
          if (last && last.placeId === s.placeId) continue;
          schematic.push(s);
        }
        const n = schematic.length;
        const padX = compact ? 18 : 28;
        const y = h / 2;
        const xAt = (i) => (n === 1 ? w / 2 : padX + (i * (w - padX * 2)) / (n - 1));
        const g = svg.append("g");
        g.append("path")
          .attr("d", schematic.map((_s, i) => `${i ? "L" : "M"}${xAt(i)},${y}`).join(" "))
          .attr("fill", "none")
          .attr("stroke", "#3dd6ff")
          .attr("stroke-width", 2)
          .attr("stroke-opacity", 0.7);
        const stop = g.selectAll("g.stop").data(schematic).join("g").attr("class", "stop")
          .attr("transform", (_s, i) => `translate(${xAt(i)},${y})`)
          .style("cursor", "pointer")
          .on("click", (_e, s) => selectRef.current?.(s.personId))
          .on("mouseenter", (_e, s) => hoverRef.current?.(s.personId))
          .on("mouseleave", () => leaveRef.current?.());
        stop.append("circle").attr("r", 6).attr("fill", (s) => eventDotColor(s.type)).attr("stroke", "#0b0f14").attr("stroke-width", 1.5);
        stop.append("text").attr("y", -12).attr("text-anchor", "middle").attr("font-size", 10).attr("fill", "#e9ecf7")
          .text((s, i) => (n > 10 && i !== 0 && i !== n - 1 && i % 2 ? "" : (s.year ?? s.type)));
        stop.filter((_s, i) => n <= 7 || i === 0 || i === n - 1).append("text")
          .attr("y", 18).attr("text-anchor", "middle").attr("font-size", 10).attr("fill", "#8d95b4")
          .text((s) => {
            const t = s.short || s.title || "";
            return t.length > 18 ? `${t.slice(0, 16)}…` : t;
          });
        stop.append("title").text((s) => `${s.year ?? "—"} · ${s.type} · ${s.title}`);
        return;
      }

      const line = mappedLine(path);
      const coords = distinctCoords([...points, ...line]);
      const projection = d3.geoMercator();
      if (coords.length === 1) {
        projection.center([coords[0].long, coords[0].lat]).scale(6500).translate([w / 2, h / 2]);
      } else {
        projection.fitExtent([[18, 18], [w - 18, h - 18]], {
          type: "MultiPoint",
          coordinates: coords.map((c) => [c.long, c.lat]),
        });
        if (projection.scale() > 11000) {
          const c = d3.geoCentroid({ type: "MultiPoint", coordinates: coords.map((x) => [x.long, x.lat]) });
          projection.center(c).scale(11000).translate([w / 2, h / 2]);
        }
      }

      const geo = d3.geoPath(projection);
      const graticule = d3.geoGraticule().step([15, 15]);
      svg.append("rect").attr("width", w).attr("height", h).attr("fill", "#080c14");
      svg.append("path").datum(graticule()).attr("d", geo).attr("fill", "none")
        .attr("stroke", "rgba(255,255,255,0.07)").attr("stroke-width", 0.6);

      if (!compact && points.length) {
        svg.append("g").selectAll("circle.scope").data(points).join("circle").attr("class", "scope")
          .attr("cx", (p) => projection([p.long, p.lat])[0])
          .attr("cy", (p) => projection([p.long, p.lat])[1])
          .attr("r", (p) => Math.min(7, 3 + Math.sqrt(p.count || 1)))
          .attr("fill", "#9aa3c7")
          .attr("fill-opacity", 0.35)
          .attr("stroke", "rgba(255,255,255,0.2)")
          .attr("stroke-width", 0.6)
          .style("cursor", "pointer")
          .on("click", (_e, p) => selectRef.current?.(p.people?.[0]))
          .on("mouseenter", (_e, p) => hoverRef.current?.(p.people?.[0]))
          .on("mouseleave", () => leaveRef.current?.())
          .append("title").text((p) => `${p.title}${p.count > 1 ? ` · ${p.count} events` : ""}`);
      }

      if (line.length > 1) {
        svg.append("path")
          .attr("d", geo({ type: "LineString", coordinates: line.map((s) => [s.long, s.lat]) }))
          .attr("fill", "none")
          .attr("stroke", "#3dd6ff")
          .attr("stroke-width", 2.2)
          .attr("stroke-linejoin", "round")
          .attr("stroke-linecap", "round")
          .attr("stroke-opacity", 0.85);
      }

      const stops = svg.append("g").selectAll("g.path-stop").data(line).join("g").attr("class", "path-stop")
        .attr("transform", (s) => {
          const [x, y] = projection([s.long, s.lat]);
          return `translate(${x},${y})`;
        })
        .style("cursor", "pointer")
        .on("click", (_e, s) => selectRef.current?.(s.personId))
        .on("mouseenter", (_e, s) => hoverRef.current?.(s.personId))
        .on("mouseleave", () => leaveRef.current?.());
      stops.append("circle").attr("r", 6.5).attr("fill", (s) => eventDotColor(s.type)).attr("stroke", "#0b0f14").attr("stroke-width", 1.6);
      if (line.length > 1) {
        stops.append("text").attr("y", 3).attr("text-anchor", "middle").attr("font-size", 8).attr("font-weight", 700).attr("fill", "#0b0f14")
          .text((_s, i) => i + 1);
      }
      const labelEvery = line.length > 8 ? 2 : 1;
      stops.filter((_s, i) => i === 0 || i === line.length - 1 || i % labelEvery === 0).append("text")
        .attr("y", -11)
        .attr("text-anchor", "middle")
        .attr("font-size", compact ? 9 : 10)
        .attr("fill", "#e9ecf7")
        .attr("stroke", "#080c14")
        .attr("stroke-width", 3)
        .attr("paint-order", "stroke")
        .text((s) => s.short || s.title);
      stops.append("title").text((s) => `${s.year ?? "—"} · ${s.type} · ${s.title}`);
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [points, path, height, compact, mapped]);

  return (
    <div className={`places-map ${compact ? "compact" : ""} ${mapped ? "geo" : "schematic"}`} ref={wrapRef} style={{ height }}>
      <svg ref={svgRef} role="img" aria-label={mapped ? "Places with coordinates from the tree" : "Place path from event names"} />
      {!path.length && !points.length ? (
        <div className="places-empty">No places on these events.</div>
      ) : null}
    </div>
  );
}
