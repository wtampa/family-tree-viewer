import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import { confidenceColor, lineColor } from "../lib/color.js";

/**
 * Radial ancestor fan. Root in the centre; generation g occupies ring g with 2^g slots (ahnentafel order).
 */
export default function FanView({ model, rootId, onSelect, onHover, onLeave, exportRef }) {
  const svgRef = useRef(null);
  const [gens, setGens] = useState(7);
  const [sweep, setSweep] = useState(220); // degrees
  const [colorBy, setColorBy] = useState("line"); // line | confidence | gender

  const collapsed = useMemo(() => model.collapsedAncestors(rootId, gens), [model, rootId, gens]);

  const slots = useMemo(() => {
    // ahnentafel: index 1 = root; father = 2i; mother = 2i+1
    const out = [];
    const walk = (pid, idx, g) => {
      out.push({ pid, idx, g });
      if (g >= gens) return;
      const f = pid ? model.father(pid) : null;
      const m = pid ? model.mother(pid) : null;
      const hasKnown = (x) => x && !model.isBrickWall(x) ? true : Boolean(x);
      // keep drawing unknown wedges one generation past the last known person
      if (pid) {
        walk(f || null, idx * 2, g + 1);
        walk(m || null, idx * 2 + 1, g + 1);
      }
    };
    walk(rootId, 1, 0);
    return out;
  }, [model, rootId, gens]);

  useEffect(() => {
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    const W = svgRef.current.clientWidth || 1200;
    const H = svgRef.current.clientHeight || 800;
    const R0 = 70;
    const ringW = Math.max(46, Math.min(110, (Math.min(W, H) * 0.95 - R0 * 2) / 2 / Math.max(1, gens)));
    const total = (sweep * Math.PI) / 180;
    const start = -total / 2 - Math.PI / 2 + (total < 2 * Math.PI ? 0 : 0);

    const g = svg.append("g").attr("class", "fan-root").attr("transform", `translate(${W / 2},${H / 2 + (sweep < 360 ? ringW * 0.8 : 0)})`);
    const zoom = d3.zoom().scaleExtent([0.3, 6]).on("zoom", (ev) => g.attr("transform", ev.transform.toString()));
    svg.call(zoom).call(zoom.transform, d3.zoomIdentity.translate(W / 2, H / 2 + (sweep < 360 ? ringW * 0.8 : 0)));

    const arc = d3.arc();
    const fill = (s) => {
      if (!s.pid) return "rgba(255,255,255,0.03)";
      const p = model.person(s.pid);
      if (colorBy === "confidence") return confidenceColor(model.conf(s.pid).score);
      if (colorBy === "gender") return p.gender === "M" ? "#3b82f6" : p.gender === "F" ? "#ec4899" : "#94a3b8";
      const l = model.lineOf(s.pid);
      return l && l !== "home" ? lineColor(l) : lineColor(model.person(s.pid).surname);
    };

    const wedges = g.selectAll("path.wedge").data(slots.filter((s) => s.g > 0)).join("path").attr("class", (s) => `wedge ${s.pid ? "" : "wedge-unknown"} ${s.pid && model.isBrickWall(s.pid) ? "wedge-wall" : ""} ${s.pid && collapsed.has(s.pid) ? "wedge-collapse" : ""}`)
      .attr("d", (s) => {
        const n = 2 ** s.g;
        const pos = s.idx - n; // 0..n-1
        const a0 = start + (pos / n) * total;
        const a1 = start + ((pos + 1) / n) * total;
        return arc({ innerRadius: R0 + (s.g - 1) * ringW, outerRadius: R0 + s.g * ringW - 3, startAngle: a0 + Math.PI / 2, endAngle: a1 + Math.PI / 2, padAngle: 0.004 });
      })
      .attr("fill", fill)
      .attr("fill-opacity", (s) => (s.pid ? 0.28 + Math.min(0.5, model.conf(s.pid).score / 160) : 1))
      .attr("stroke", (s) => (s.pid && collapsed.has(s.pid) ? "#ffd34d" : (s.pid ? fill(s) : "rgba(255,255,255,0.12)")))
      .attr("stroke-width", (s) => (s.pid && collapsed.has(s.pid) ? 2.4 : 1.2))
      .attr("stroke-dasharray", (s) => (s.pid ? null : "4 4"))
      .style("cursor", (s) => (s.pid ? "pointer" : "default"))
      .on("mouseenter", (_e, s) => s.pid && onHover?.(s.pid))
      .on("mouseleave", () => onLeave?.())
      .on("click", (e, s) => { if (!s.pid) return; onSelect?.(s.pid, { reroot: !e.shiftKey }); });

    wedges.append("title").text((s) => {
      if (!s.pid) return "Unknown";
      const extra = collapsed.has(s.pid) ? " · pedigree collapse (two slots)" : "";
      return `${model.person(s.pid).name} ${model.years(s.pid)}${extra}`;
    });

    const diamond = d3.symbol().type(d3.symbolDiamond).size(48);
    g.selectAll("path.fan-diamond").data(slots.filter((s) => s.g > 0 && s.pid && collapsed.has(s.pid))).join("path")
      .attr("class", "fan-diamond")
      .attr("d", diamond)
      .attr("fill", "#ffd34d")
      .attr("transform", (s) => {
        const n = 2 ** s.g;
        const pos = s.idx - n;
        const a0 = start + (pos / n) * total;
        const a1 = start + ((pos + 1) / n) * total;
        const am = (a0 + a1) / 2;
        const r = R0 + (s.g - 0.5) * ringW;
        return `translate(${Math.cos(am) * r},${Math.sin(am) * r})`;
      })
      .style("pointer-events", "none");

    // labels
    const label = g.selectAll("g.lbl").data(slots.filter((s) => s.g > 0)).join("g").attr("class", "lbl").style("pointer-events", "none");
    label.each(function (s) {
      const n = 2 ** s.g;
      const pos = s.idx - n;
      const a0 = start + (pos / n) * total;
      const a1 = start + ((pos + 1) / n) * total;
      const am = (a0 + a1) / 2;
      const rIn = R0 + (s.g - 1) * ringW;
      const rOut = R0 + s.g * ringW - 3;
      const rm = (rIn + rOut) / 2;
      const p = s.pid ? model.person(s.pid) : null;
      const name = p ? p.name : "?";
      const years = p ? model.years(s.pid) : "";
      const el = d3.select(this);
      const arcLen = (a1 - a0) * rm;
      const fontSize = s.g <= 2 ? 13 : s.g <= 4 ? 11 : s.g <= 6 ? 9.5 : 8;
      if (s.g <= 3 && arcLen > 90) {
        // curved text along the arc midline
        const id = `fanpath-${s.idx}`;
        const flip = Math.cos(am) < 0 && sweep >= 300 ? false : am > 0 && am < Math.PI; // keep text readable
        const pathArc = d3.arc()({ innerRadius: rm, outerRadius: rm, startAngle: (flip ? a1 : a0) + Math.PI / 2, endAngle: (flip ? a0 : a1) + Math.PI / 2 });
        el.append("path").attr("id", id).attr("d", pathArc).attr("fill", "none");
        const t = el.append("text").attr("font-size", fontSize).attr("fill", "#eef1fa").attr("dy", -4);
        t.append("textPath").attr("href", `#${id}`).attr("startOffset", "25%").attr("text-anchor", "middle").text(name);
        if (years) {
          const t2 = el.append("text").attr("font-size", fontSize - 2).attr("fill", "#aab2cf").attr("dy", 12);
          t2.append("textPath").attr("href", `#${id}`).attr("startOffset", "25%").attr("text-anchor", "middle").text(years);
        }
      } else {
        // radial text
        const deg = (am * 180) / Math.PI;
        const flip = Math.cos(am) < 0;
        const tx = Math.cos(am) * (rIn + 6);
        const ty = Math.sin(am) * (rIn + 6);
        const maxChars = Math.max(6, Math.floor((ringW - 10) / (fontSize * 0.55)));
        const short = name.length > maxChars ? `${name.slice(0, maxChars - 1)}…` : name;
        el.append("text")
          .attr("transform", `translate(${tx},${ty}) rotate(${flip ? deg + 180 : deg})`)
          .attr("text-anchor", flip ? "end" : "start")
          .attr("dominant-baseline", "middle")
          .attr("font-size", fontSize)
          .attr("fill", p ? "#eef1fa" : "rgba(255,255,255,.35)")
          .text(short + (years && s.g <= 5 ? `  ${years}` : ""));
      }
    });

    // centre
    const root = model.person(rootId);
    const c = g.append("g").attr("class", "fan-centre").style("cursor", "pointer").on("click", () => onSelect?.(rootId, { reroot: false })).on("mouseenter", () => onHover?.(rootId)).on("mouseleave", () => onLeave?.());
    c.append("circle").attr("r", R0 - 4).attr("fill", "#111626").attr("stroke", "#3dd6ff").attr("stroke-width", 2);
    const img = model.portrait(rootId);
    if (img) {
      const clipId = "fan-clip";
      svg.append("defs").append("clipPath").attr("id", clipId).append("circle").attr("r", R0 - 8);
      c.append("image").attr("href", img).attr("x", -(R0 - 8)).attr("y", -(R0 - 8)).attr("width", (R0 - 8) * 2).attr("height", (R0 - 8) * 2).attr("preserveAspectRatio", "xMidYMid slice").attr("clip-path", `url(#${clipId})`);
    } else {
      c.append("text").attr("text-anchor", "middle").attr("dominant-baseline", "middle").attr("fill", "#fff").attr("font-size", 12).attr("font-weight", 600).text(root?.first || "");
      c.append("text").attr("text-anchor", "middle").attr("dominant-baseline", "middle").attr("dy", 16).attr("fill", "#aab2cf").attr("font-size", 10).text(root?.surname || "");
    }
    if (exportRef) exportRef.current = { node: () => svgRef.current, kind: "svg" };
  }, [model, rootId, slots, gens, sweep, colorBy, collapsed, onSelect, onHover, onLeave, exportRef]);

  return (
    <div className="chart-wrap">
      <div className="chart-toolbar">
        <label>Generations <input type="range" min="2" max="10" value={gens} onChange={(e) => setGens(Number(e.target.value))} /> <b>{gens}</b></label>
        <label>Sweep <input type="range" min="120" max="360" step="10" value={sweep} onChange={(e) => setSweep(Number(e.target.value))} /> <b>{sweep}°</b></label>
        <label>Color by
          <select value={colorBy} onChange={(e) => setColorBy(e.target.value)}>
            <option value="line">ancestral line</option>
            <option value="confidence">confidence</option>
            <option value="gender">gender</option>
          </select>
        </label>
        <span className="hint-text">Click a wedge to re-root · Shift-click for details · dashed = unknown · gold diamond = pedigree collapse</span>
      </div>
      <svg className="chart-stage fan-svg" ref={svgRef} />
    </div>
  );
}
