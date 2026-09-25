import { confidenceColor } from "../lib/color.js";
import { initials } from "../lib/format.js";

export function ConfidenceRing({ score, size = 56, stroke = 4, children, title }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (Math.max(0, Math.min(100, score || 0)) / 100) * c;
  return (
    <div className="ring-wrap" style={{ width: size, height: size }} title={title ?? `Confidence ${score ?? 0}/100`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="ring-svg">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,.10)" strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={confidenceColor(score)} strokeWidth={stroke} fill="none" strokeDasharray={`${dash.toFixed(1)} ${c.toFixed(1)}`} strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div className="ring-inner">{children}</div>
    </div>
  );
}

export default function Portrait({ model, pid, size = 56, ring = true }) {
  const p = model.person(pid);
  const src = model.portrait(pid);
  const c = model.conf(pid);
  const inner = src ? (
    <img className="portrait-img" src={src} alt="" style={{ width: size - 10, height: size - 10 }} loading="lazy" />
  ) : (
    <div className="portrait-init" style={{ width: size - 10, height: size - 10, "--c": model.colorOf(pid), fontSize: Math.max(10, (size - 10) / 2.6) }}>{initials(p?.name)}</div>
  );
  if (!ring) return <div className="portrait-plain" style={{ width: size, height: size }}>{inner}</div>;
  return <ConfidenceRing score={c.score} size={size}>{inner}</ConfidenceRing>;
}
