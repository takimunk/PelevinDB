import { useMemo, useState } from "react";
import { GROUP_COLORS, type NamedValue } from "../domain/fingerprint.ts";

/**
 * One micro-pixel per Jev parameter. Brightness is the value relative to the strongest
 * value in its group (choice groups sum to 1); the readout shows the raw number.
 */
export function PixelStrip({ values, size = 7, label = "parameters", idle }: { values: NamedValue[]; size?: number; label?: string; idle?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const peak = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of values) if (Number.isFinite(v.value)) m.set(v.group, Math.max(m.get(v.group) ?? 0, v.value));
    return m;
  }, [values]);
  const current = hover != null ? values[hover] : null;
  return (
    <div className="pixel-strip" style={{ ["--px" as string]: `${size}px` }}>
      <div className="pixels" role="img" aria-label={`${values.length} ${label}`} onMouseLeave={() => setHover(null)}>
        {values.map((v, i) => {
          const known = Number.isFinite(v.value);
          const level = known ? Math.max(0.06, v.value / Math.max(0.25, peak.get(v.group) ?? 1)) : 0;
          const breaks = i > 0 && values[i - 1].group !== v.group;
          return (
            <i
              key={`${v.group}.${v.key}`}
              className={`${breaks ? "gap" : ""} ${known ? "" : "nan"} ${hover === i ? "on" : ""}`}
              style={{ background: GROUP_COLORS[v.group], opacity: known ? level : 1 }}
              onMouseEnter={() => setHover(i)}
            />
          );
        })}
      </div>
      <div className="pixel-readout">
        {current ? (
          <>
            <span style={{ color: GROUP_COLORS[current.group] }}>{current.group}</span>.{current.key}
            <span className="dim"> {current.label.toLowerCase() === current.key.toLowerCase() ? "" : current.label.toLowerCase()} </span>
            <b>{Number.isFinite(current.value) ? current.value.toFixed(3) : "n/a"}</b>
          </>
        ) : (
          <span className="dim">{idle ?? `${values.length} ${label} · hover a pixel`}</span>
        )}
      </div>
    </div>
  );
}

export function GroupLegend() {
  return (
    <div className="group-legend">
      {Object.entries(GROUP_COLORS).map(([g, c]) => (
        <span key={g}>
          <i style={{ background: c }} />
          {g}
        </span>
      ))}
    </div>
  );
}
