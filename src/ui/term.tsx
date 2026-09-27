// Small chart primitives shared by the book page, the reader and the map card.
import "./term.css";
// Chrome is ink on paper; `color` is a data colour and is only ever used for the mark itself.
import type { CSSProperties } from "react";

/** A thin horizontal meter, 0 → 1. Replaces the old `████░░░` text gauges. */
export function Meter({ value, color, className = "", label }: { value: number; color?: string; className?: string; label?: string }) {
  const v = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  return (
    <span className={`meter ${className}`} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <i style={{ width: `${v * 100}%`, ...(color ? { background: color } : null) } as CSSProperties} />
    </span>
  );
}

/** A bipolar scale: a hairline with a centre tick and a dot at the value, 0 (left pole) → 1 (right pole). */
export function Track({ value, color, label, reference }: { value: number; color?: string; label?: string; reference?: number }) {
  const v = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.5;
  return (
    <span className="track" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {reference != null && Number.isFinite(reference) && <i className="track-ref" style={{ left: `${Math.max(0, Math.min(1, reference)) * 100}%` }} />}
      <i className="track-fill" style={{ left: `${Math.min(50, v * 100)}%`, width: `${Math.abs(v - 0.5) * 100}%`, ...(color ? { background: color } : null) }} />
      <i className="track-dot" style={{ left: `${v * 100}%`, ...(color ? { borderColor: color } : null) }} />
    </span>
  );
}

/** A coloured key: a small square key-swatch before a label. */
export const Swatch = ({ color, round = false }: { color: string; round?: boolean }) => <i className={`key-swatch ${round ? "round" : ""}`} style={{ background: color }} aria-hidden="true" />;

/** A 100% stacked bar: one segment per category, width = share, colour = category. Hover names the segment. */
export function StackBar({ items, onHover }: { items: { id: string; label: string; value: number; color: string }[]; onHover?: (id: string | null) => void }) {
  const total = items.reduce((sum, i) => sum + Math.max(0, i.value), 0) || 1;
  return (
    <span className="stack-bar" role="img" aria-label={items.map((i) => `${i.label} ${Math.round((i.value / total) * 100)}%`).join(", ")} onMouseLeave={() => onHover?.(null)}>
      {items.map((i) => (
        <i key={i.id} style={{ flexGrow: Math.max(0, i.value) / total, background: i.color }} title={`${i.label} ${Math.round((i.value / total) * 100)}%`} onMouseEnter={() => onHover?.(i.id)} />
      ))}
    </span>
  );
}
