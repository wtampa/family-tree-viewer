import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";

let pdfjsPromise = null;
async function pdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((mod) => {
      mod.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
      return mod;
    });
  }
  return pdfjsPromise;
}

const thumbCache = new Map();
export async function pdfThumb(url, width = 320) {
  if (thumbCache.has(url)) return thumbCache.get(url);
  const p = (async () => {
    const lib = await pdfjs();
    const doc = await lib.getDocument({ url }).promise;
    const page = await doc.getPage(1);
    const vp = page.getViewport({ scale: 1 });
    const scale = width / vp.width;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    const out = { dataUrl: canvas.toDataURL("image/png"), pages: doc.numPages };
    doc.destroy?.();
    return out;
  })();
  thumbCache.set(url, p);
  return p;
}

export function classifyLink(link) {
  const href = link.url || (link.path ? api.fileUrl(link.path) : "");
  const isLocal = Boolean(link.path) || href.startsWith("/api/file");
  let path = link.path || "";
  if (!path && isLocal) {
    try { path = new URL(href, location.origin).searchParams.get("p") || ""; } catch { path = ""; }
  }
  const ext = (path || href).split("?")[0].split(".").pop().toLowerCase();
  const kind = isLocal ? (/^(jpe?g|png|gif|webp|bmp)$/.test(ext) ? "image" : ext === "pdf" ? "pdf" : "file") : "web";
  return { href, isLocal, kind, path };
}

/**
 * Floating hover preview. `target` = { link, x, y } or null.
 */
export default function LinkPreview({ target }) {
  const [state, setState] = useState({ status: "idle" });
  const timer = useRef(0);
  useEffect(() => {
    clearTimeout(timer.current);
    if (!target) { setState({ status: "idle" }); return; }
    const { href, kind, path } = classifyLink(target.link);
    setState({ status: "loading", kind, href, path });
    timer.current = setTimeout(async () => {
      try {
        if (kind === "web") {
          const d = await api.preview(href);
          setState({ status: "ready", kind, href, path, data: d });
        } else if (kind === "image") {
          setState({ status: "ready", kind, href, path, data: { image: href } });
        } else if (kind === "pdf") {
          const t = await pdfThumb(href);
          setState({ status: "ready", kind, href, path, data: { image: t.dataUrl, pages: t.pages } });
        } else {
          setState({ status: "ready", kind, href, path, data: {} });
        }
      } catch (e) {
        setState({ status: "error", kind, href, path, error: e.message });
      }
    }, 220);
    return () => clearTimeout(timer.current);
  }, [target]);

  if (!target || state.status === "idle") return null;
  const W = 340;
  const x = Math.min(window.innerWidth - W - 16, Math.max(8, target.x + 14));
  const y = Math.min(window.innerHeight - 300, Math.max(8, target.y + 14));
  const link = target.link;
  const d = state.data || {};
  return (
    <div className="link-preview" style={{ left: x, top: y, width: W }}>
      {state.status === "loading" ? <div className="lp-loading">Loading preview…</div> : null}
      {state.status === "error" ? <div className="lp-error">No preview ({state.error})</div> : null}
      {state.status === "ready" ? (
        <>
          {d.image ? <img className="lp-image" src={d.image} alt="" /> : null}
          <div className="lp-body">
            <div className="lp-title">{d.title || link.label || link.path || state.href}</div>
            {d.description ? <div className="lp-desc">{d.description}</div> : null}
            <div className="lp-meta">
              {state.kind === "web" ? <img src={d.favicon || `https://www.google.com/s2/favicons?sz=64&domain=${new URL(state.href).hostname}`} alt="" className="lp-favicon" /> : null}
              {state.kind === "web" ? (d.siteName || new URL(state.href).hostname) : state.kind === "pdf" ? `PDF · ${d.pages || "?"} page${d.pages === 1 ? "" : "s"}` : state.kind === "image" ? "Image" : "File"}
              {state.path ? <span className="lp-path"> · {state.path}</span> : null}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
