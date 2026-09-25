import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForceGraph3D from "react-force-graph-3d";
import * as THREE from "three";
import { forceY } from "d3";
import { confidenceColor, lineColor } from "../lib/color.js";
import { initials } from "../lib/format.js";
import { isHeavyGraph, LEVEL, packGenerationHive, selectHivePeople } from "../lib/hiveLayout.js";

function personColor(model, id, colorBy) {
  const p = model.person(id);
  const c = model.conf(id);
  const l = model.lineOf(id);
  if (colorBy === "confidence") return confidenceColor(c.score);
  if (l && l !== "home") return lineColor(l);
  if (l === "home") return "#f4f6fb";
  return p.gender === "M" ? "#5eb5ff" : p.gender === "F" ? "#ff7cc2" : "#b9c0d8";
}

function canvasSizeFor(node, rootId, selectedId) {
  return node.id === rootId || node.id === selectedId ? 96 : 64;
}

/** Canvas-drawn round portrait / initials disc with a name label. */
function makeNodeCanvas(node, img, S = 64) {
  const labelH = Math.max(18, Math.round(S * 0.28));
  const c = document.createElement("canvas");
  c.width = S;
  c.height = S + labelH;
  const ctx = c.getContext("2d");
  const cx = S / 2, cy = S / 2, r = S / 2 - Math.max(3, S * 0.04);
  const ringW = Math.max(2, S * 0.035);
  ctx.beginPath(); ctx.arc(cx, cy, r + ringW, 0, Math.PI * 2); ctx.fillStyle = node.wall ? "#ff5f6d" : node.color; ctx.globalAlpha = 0.95; ctx.fill(); ctx.globalAlpha = 1;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = "#0f1424"; ctx.fill();
  if (img) {
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r - 2, 0, Math.PI * 2); ctx.clip();
    const s = Math.max((r * 2) / img.width, (r * 2) / img.height);
    ctx.drawImage(img, cx - (img.width * s) / 2, cy - (img.height * s) / 2, img.width * s, img.height * s);
    ctx.restore();
  } else {
    ctx.fillStyle = node.color;
    ctx.font = `bold ${Math.round(S * 0.38)}px Inter, Segoe UI, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initials(node.name), cx, cy + S * 0.02);
  }
  ctx.beginPath();
  ctx.lineWidth = ringW;
  ctx.strokeStyle = confidenceColor(node.confidence);
  ctx.arc(cx, cy, r + ringW * 0.35, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * Math.max(0.02, node.confidence / 100)));
  ctx.stroke();
  if (node.collapse) {
    ctx.beginPath();
    ctx.lineWidth = ringW;
    ctx.strokeStyle = "#ffd34d";
    ctx.arc(cx, cy, r + ringW * 1.6, 0, Math.PI * 2);
    ctx.stroke();
    const d = S * 0.07;
    ctx.fillStyle = "#ffd34d";
    ctx.beginPath();
    ctx.moveTo(cx, S * 0.07);
    ctx.lineTo(cx + d, S * 0.14);
    ctx.lineTo(cx, S * 0.21);
    ctx.lineTo(cx - d, S * 0.14);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = "rgba(10,13,22,0.75)";
  roundRect(ctx, 3, S + 2, S - 6, labelH - 4, 4);
  ctx.fill();
  ctx.fillStyle = "#f2f4fb";
  ctx.font = `600 ${Math.max(8, Math.round(S * 0.12))}px Inter, Segoe UI, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(fit(ctx, node.name, S - 10), cx, S + labelH * 0.38);
  ctx.fillStyle = "#aab2cf";
  ctx.font = `${Math.max(7, Math.round(S * 0.09))}px Inter, Segoe UI, sans-serif`;
  ctx.fillText(node.years || "", cx, S + labelH * 0.72);
  return c;
}
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y, x, y + r, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function fit(ctx, text, max) { let t = text; while (t.length > 3 && ctx.measureText(t).width > max) t = `${t.slice(0, -2)}…`; return t; }

function paintSprite(sprite, node, img, S) {
  const canvas = makeNodeCanvas(node, img, S);
  const prev = sprite.material.map;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  sprite.material.map = tex;
  sprite.material.needsUpdate = true;
  prev?.dispose();
  const ratio = canvas.height / canvas.width;
  sprite.userData.ratio = ratio;
  sprite.userData.color = node.color;
  sprite.userData.collapse = node.collapse;
  sprite.userData.canvasSize = S;
  sprite.userData.hasPortrait = Boolean(img);
  sprite.scale.set(sprite.userData.base, sprite.userData.base * ratio, 1);
}

export default function HiveView({
  model,
  rootId,
  query,
  onSelect,
  onHover,
  onLeave,
  exportRef,
  selectedId = null,
  settings = { ancestry: 8, progeny: 6 },
  onSettings,
  active = true,
}) {
  const wrapRef = useRef(null);
  const fgRef = useRef(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [layout, setLayout] = useState("gen");
  const [colorBy, setColorBy] = useState("line");
  const treePeople = model.peopleList.length;
  const treeHeavy = treePeople > 400;
  const [scope, setScope] = useState(() => (treeHeavy ? "related" : "all"));
  const [hoverId, setHoverId] = useState(null);
  const spriteCache = useRef(new Map());
  const wallSprites = useRef(new Set());
  const nodePool = useRef(new Map());
  const linkPool = useRef(new Map());
  const fittedRef = useRef(false);
  const lastDataRef = useRef(null);
  const colorByRef = useRef(colorBy);
  colorByRef.current = colorBy;
  const ancestry = settings.ancestry ?? 8;
  const progeny = settings.progeny ?? 6;

  useEffect(() => { fittedRef.current = false; }, [layout, scope, rootId, ancestry, progeny]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth || 800, h: el.clientHeight || 600 });
    return () => ro.disconnect();
  }, []);

  const data = useMemo(() => {
    const { gens, ids, truncated, available } = selectHivePeople(model, rootId, { scope, ancestry, progeny });
    const collapsed = model.collapsedAncestors(rootId, ancestry);
    const idset = new Set(ids);
    const live = new Set();
    const nodes = ids.map((id) => {
      const p = model.person(id);
      const c = model.conf(id);
      let n = nodePool.current.get(id);
      if (!n) {
        n = { id, kind: "person" };
        nodePool.current.set(id, n);
      }
      n.kind = "person";
      n.name = p.name;
      n.years = model.years(id);
      n.color = personColor(model, id, colorByRef.current);
      n.confidence = c.score;
      n.wall = model.isBrickWall(id);
      n.collapse = collapsed.has(id);
      n.gen = gens[id] ?? 0;
      n.portrait = model.portrait(id);
      n.val = 3 + c.score / 25 + (id === rootId ? 6 : 0);
      live.add(id);
      return n;
    });
    const links = [];
    for (const f of Object.values(model.families)) {
      const parents = [f.father, f.mother].filter((x) => x && idset.has(x));
      const kids = f.children.map((c) => c.id).filter((x) => x && idset.has(x));
      if (!parents.length && kids.length < 2) continue;
      const fid = `F:${f.id}`;
      const fgen = parents.length ? gens[parents[0]] ?? 0 : (gens[kids[0]] ?? 0) + 1;
      let fn = nodePool.current.get(fid);
      if (!fn) {
        fn = { id: fid, kind: "family" };
        nodePool.current.set(fid, fn);
      }
      fn.kind = "family";
      fn.name = "";
      fn.color = "#5b64a3";
      fn.val = 0.8;
      fn.gen = fgen - 0.5;
      live.add(fid);
      nodes.push(fn);
      for (const p of parents) {
        const key = `${p}|${fid}|spouse`;
        let l = linkPool.current.get(key);
        if (!l) { l = { source: p, target: fid, kind: "spouse" }; linkPool.current.set(key, l); }
        else { l.source = p; l.target = fid; }
        links.push(l);
      }
      for (const k of kids) {
        const key = `${fid}|${k}|child`;
        let l = linkPool.current.get(key);
        if (!l) { l = { source: fid, target: k, kind: "child" }; linkPool.current.set(key, l); }
        else { l.source = fid; l.target = k; }
        links.push(l);
      }
    }
    for (const id of [...nodePool.current.keys()]) {
      if (!live.has(id)) {
        nodePool.current.delete(id);
        const sp = spriteCache.current.get(id);
        if (sp) { wallSprites.current.delete(sp); spriteCache.current.delete(id); }
      }
    }
    const personCount = ids.length;
    const heavy = isHeavyGraph(personCount, nodes.length);
    const packed = layout === "gen" && heavy;
    if (packed) packGenerationHive(nodes, links, { level: LEVEL });
    return { nodes, links, personCount, truncated, available, heavy, packed };
  }, [model, rootId, scope, ancestry, progeny, layout]);

  const heavy = data.heavy;
  const packed = data.packed;

  useEffect(() => { window.__ftvHive = fgRef.current; }, [data]);

  const visible = useMemo(() => {
    if (!query) return null;
    return new Set(model.search(query, 500));
  }, [model, query]);

  const rendererConfig = useMemo(
    () => ({ preserveDrawingBuffer: false, antialias: !treeHeavy }),
    [treeHeavy],
  );

  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    const charge = fg.d3Force("charge");
    const link = fg.d3Force("link");
    if (packed) {
      if (charge) charge.strength(0);
      if (link) link.strength(0);
      fg.d3Force("gen", null);
    } else {
      if (charge) charge.strength(layout === "free" ? -160 : -70).distanceMax(180);
      if (link) link.distance((l) => (l.kind === "spouse" ? 18 : 30)).strength(layout === "gen" ? 0.9 : 0.5);
      fg.d3Force("gen", layout === "gen" ? forceY((n) => n.gen * LEVEL).strength(1) : null);
    }
    if (lastDataRef.current === data && fg.getGraphBbox?.()) fg.d3ReheatSimulation?.();
    lastDataRef.current = data;
  }, [data, layout, packed]);

  useEffect(() => {
    let raf = 0;
    const tick = (t) => {
      if (document.hidden || !active || wallSprites.current.size === 0) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const s = 1 + 0.12 * Math.sin(t / 380);
      for (const sp of wallSprites.current) {
        if (!sp.userData) continue;
        sp.scale.set(sp.userData.base * s, sp.userData.base * s * sp.userData.ratio, 1);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  const loadPortrait = useCallback((node, sprite) => {
    if (!node.portrait || sprite.userData.loadingPortrait || sprite.userData.hasPortrait) return;
    sprite.userData.loadingPortrait = true;
    const img = new Image();
    img.onload = () => {
      sprite.userData.loadingPortrait = false;
      const S = canvasSizeFor(node, rootId, selectedId);
      paintSprite(sprite, node, img, S);
    };
    img.onerror = () => { sprite.userData.loadingPortrait = false; };
    img.src = node.portrait;
  }, [rootId, selectedId]);

  const nodeObject = useCallback((node) => {
    if (node.kind === "family") return false;
    let sprite = spriteCache.current.get(node.id);
    if (sprite) return sprite;
    const S = 64;
    const canvas = makeNodeCanvas(node, null, S);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
    sprite = new THREE.Sprite(mat);
    const base = 18 + node.val * 1.5;
    const ratio = canvas.height / canvas.width;
    sprite.scale.set(base, base * ratio, 1);
    sprite.userData = { base, ratio, node, color: node.color, collapse: node.collapse, canvasSize: S, hasPortrait: false };
    if (node.wall) wallSprites.current.add(sprite);
    spriteCache.current.set(node.id, sprite);
    return sprite;
  }, []);

  useEffect(() => {
    for (const n of data.nodes) {
      if (n.kind !== "person") continue;
      n.color = personColor(model, n.id, colorBy);
      const sp = spriteCache.current.get(n.id);
      if (!sp) continue;
      const S = canvasSizeFor(n, rootId, selectedId);
      if (sp.userData.color !== n.color || sp.userData.collapse !== n.collapse || sp.userData.canvasSize !== S) {
        paintSprite(sp, n, null, S);
        sp.userData.hasPortrait = false;
      }
      const want = !heavy || n.id === rootId || n.id === selectedId || n.id === hoverId;
      if (want && n.portrait) loadPortrait(n, sp);
    }
  }, [data, colorBy, model, heavy, rootId, selectedId, hoverId, loadPortrait]);

  useEffect(() => {
    for (const [id, sp] of spriteCache.current) {
      const dim = visible && !visible.has(id);
      sp.material.opacity = dim ? 0.12 : 1;
    }
  }, [visible, data]);

  const flyTo = useCallback((node) => {
    const fg = fgRef.current;
    if (!fg || !Number.isFinite(node.x)) return;
    const dist = 90;
    const ratio = 1 + dist / Math.hypot(node.x, node.y, node.z || 1);
    fg.cameraPosition({ x: node.x * ratio, y: node.y * ratio + 8, z: (node.z || 0) * ratio + 40 }, node, 800);
  }, []);

  useEffect(() => {
    if (!exportRef || !active) return;
    exportRef.current = {
      kind: "canvas",
      node: () => {
        const fg = fgRef.current;
        const renderer = fg?.renderer?.();
        const scene = fg?.scene?.();
        const camera = fg?.camera?.();
        if (renderer && scene && camera) renderer.render(scene, camera);
        return renderer?.domElement || wrapRef.current?.querySelector("canvas");
      },
    };
  }, [exportRef, active]);

  useEffect(() => {
    const fg = fgRef.current;
    if (!fg?.pauseAnimation) return;
    const sync = () => {
      if (!active || document.hidden) fg.pauseAnimation();
      else fg.resumeAnimation();
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, [active, size.w, size.h, data]);

  const lines = useMemo(() => [...new Set(Object.values(model.lines).filter((l) => l && l !== "home"))], [model]);

  const warmupTicks = packed ? 0 : heavy ? 20 : 60;
  const cooldownTicks = packed ? 0 : heavy ? 80 : 220;

  return (
    <div className="chart-wrap">
      <div className="chart-toolbar">
        <label>Layout
          <select value={layout} onChange={(e) => setLayout(e.target.value)}>
            <option value="gen">generation layers (ancestors up)</option>
            <option value="radialout">radial from roots</option>
            <option value="free">free hive</option>
          </select>
        </label>
        <label>Color by
          <select value={colorBy} onChange={(e) => setColorBy(e.target.value)}>
            <option value="line">ancestral line</option>
            <option value="confidence">confidence</option>
          </select>
        </label>
        <label>Scope
          <select value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="all">everyone</option>
            <option value="related">root's ancestors + descendants</option>
          </select>
        </label>
        <label>Ancestors <input type="range" min="0" max="12" value={ancestry} onChange={(e) => onSettings?.({ ancestry: Number(e.target.value) })} /> <b>{ancestry}</b></label>
        <label>Descendants <input type="range" min="0" max="10" value={progeny} onChange={(e) => onSettings?.({ progeny: Number(e.target.value) })} /> <b>{progeny}</b></label>
        <button type="button" onClick={() => fgRef.current?.zoomToFit(800, 40)}>Fit</button>
        <button type="button" onClick={() => { const n = data.nodes.find((x) => x.id === rootId); if (n) flyTo(n); }}>Root</button>
        <span className="hive-count" title={data.truncated ? "Capped for speed — tighten the generation window" : undefined}>
          {data.personCount} people · {data.links.length} links
          {data.personCount < treePeople ? ` · of ${treePeople}` : ""}
          {data.truncated ? " · capped" : ""}
          {heavy ? " · lite" : ""}
        </span>
        <span className="hint-text">Drag to orbit · scroll to zoom · click a person to fly in and open details · red ring = brick wall · gold ring = collapse</span>
      </div>
      <div className="chart-stage hive-stage" ref={wrapRef}>
        {size.w > 0 && size.h > 0 ? (
          <ForceGraph3D
            ref={fgRef}
            width={size.w}
            height={size.h}
            graphData={data}
            backgroundColor="#06070d"
            showNavInfo={false}
            dagMode={layout === "radialout" ? "radialout" : null}
            dagLevelDistance={layout === "radialout" ? 40 : undefined}
            onDagError={() => { /* tolerate loops from data quirks */ }}
            rendererConfig={rendererConfig}
            onEngineStop={() => { if (!fittedRef.current) { fittedRef.current = true; fgRef.current?.zoomToFit(700, 60); } }}
            nodeThreeObject={nodeObject}
            nodeThreeObjectExtend={false}
            nodeVal={(n) => n.val}
            nodeColor={(n) => n.color}
            nodeRelSize={4}
            nodeLabel={(n) => (n.kind === "family" ? "" : `${n.name} ${n.years}${n.collapse ? " · pedigree collapse" : ""}`)}
            linkColor={(l) => (l.kind === "spouse" ? "rgba(255, 211, 77, 0.55)" : "rgba(61, 214, 255, 0.35)")}
            linkWidth={(l) => (l.kind === "spouse" ? 1.4 : 0.8)}
            linkOpacity={0.85}
            linkDirectionalParticles={heavy ? 0 : (l) => (l.kind === "child" ? 1 : 0)}
            linkDirectionalParticleWidth={1.2}
            linkDirectionalParticleSpeed={0.004}
            linkDirectionalParticleColor={() => "rgba(140, 230, 255, 0.9)"}
            onNodeHover={(n) => {
              const id = n && n.kind === "person" ? n.id : null;
              setHoverId(id);
              if (id) onHover?.(id);
              else onLeave?.();
            }}
            onNodeClick={(n) => { if (!n || n.kind !== "person") return; flyTo(n); onSelect?.(n.id, { reroot: false }); }}
            onBackgroundClick={() => { setHoverId(null); onLeave?.(); }}
            warmupTicks={warmupTicks}
            cooldownTicks={cooldownTicks}
          />
        ) : null}
        <div className="legend">
          {colorBy === "line"
            ? lines.map((l) => (<div className="swatch" key={l} style={{ "--accent": lineColor(l) }}><i />{l}</div>))
            : [["high", 85], ["medium", 55], ["low", 20], ["none", 0]].map(([k, v]) => (<div className="swatch" key={k} style={{ "--accent": confidenceColor(v) }}><i />{k}</div>))}
          <div className="swatch" style={{ "--accent": "#ff5f6d" }}><i />brick wall</div>
          <div className="swatch" style={{ "--accent": "#ffd34d" }}><i />pedigree collapse</div>
        </div>
      </div>
    </div>
  );
}
