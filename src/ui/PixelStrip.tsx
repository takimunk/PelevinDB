import { useMemo, useState } from "react";
import { FEATURE_GROUPS, GROUP_COLORS, type FeatureGroupId, type NamedValue } from "../domain/fingerprint.ts";
import { locale, useLang, useT } from "../i18n/index.ts";

const T = {
  en: { hover: "hover a pixel", params: "parameters", none: "n/a" },
  ru: { hover: "наведите на пиксель", params: "параметров", none: "н/д" },
};

const groupName = (g: FeatureGroupId, lang: "en" | "ru") => {
  const group = FEATURE_GROUPS.find((x) => x.id === g);
  return group ? (lang === "ru" ? group.ru : group.label) : g;
};

/**
 * One micro-pixel per Jev parameter. Brightness is the value relative to the strongest
 * value in its group (choice groups sum to 1); the readout shows the raw number.
 */
export function PixelStrip({ values, size = 7, label, idle }: { values: NamedValue[]; size?: number; label?: string; idle?: string }) {
  const t = useT(T);
  const lang = useLang();
  const [hover, setHover] = useState<number | null>(null);
  const peak = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of values) if (Number.isFinite(v.value)) m.set(v.group, Math.max(m.get(v.group) ?? 0, v.value));
    return m;
  }, [values]);
  const current = hover != null ? values[hover] : null;
  const name = label ?? t.params;
  const number = new Intl.NumberFormat(locale(lang), { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  return (
    <div className="pixel-strip" style={{ ["--px" as string]: `${size}px` }}>
      <div className="pixels" role="img" aria-label={`${values.length} ${name}`} onMouseLeave={() => setHover(null)}>
        {values.map((v, i) => {
          const known = Number.isFinite(v.value);
          const level = known ? Math.max(0.08, v.value / Math.max(0.25, peak.get(v.group) ?? 1)) : 0;
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
            <i className="key-swatch" style={{ background: GROUP_COLORS[current.group] }} aria-hidden="true" />
            <span className="dim">{groupName(current.group, lang).toLowerCase()} · </span>
            {(lang === "ru" && current.ru ? current.ru : current.label).toLowerCase()} <b>{Number.isFinite(current.value) ? number.format(current.value) : t.none}</b>
          </>
        ) : (
          <span className="dim">{idle ?? `${values.length} ${name} · ${t.hover}`}</span>
        )}
      </div>
    </div>
  );
}

export function GroupLegend() {
  const lang = useLang();
  return (
    <div className="group-legend">
      {(Object.entries(GROUP_COLORS) as [FeatureGroupId, string][]).map(([g, c]) => (
        <span key={g}>
          <i style={{ background: c }} />
          {groupName(g, lang).toLowerCase()}
        </span>
      ))}
    </div>
  );
}
