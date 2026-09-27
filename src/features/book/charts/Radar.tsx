import { useState } from "react";
import { highOf, labelOf, lowOf, PROFILE_SCALES, TEXTURES, type ProfileScaleId, type TextureId } from "../../../../shared/catalog.ts";
import type { Fingerprint } from "../../../domain/fingerprint.ts";
import { useLang, useT, type Lang } from "../../../i18n/index.ts";

const T = {
  en: {
    emotion: "emotion",
    emotionHint: "strongest mean emotion",
    whole: "whole book",
    mean: "library mean",
    idle: "0 centre → 100 rim",
    dashed: "dashed",
    hover: "hover a spoke",
    chart: "Star chart",
  },
  ru: {
    emotion: "эмоция",
    emotionHint: "самая сильная средняя эмоция",
    whole: "вся книга",
    mean: "среднее по библиотеке",
    idle: "0 в центре → 100 на краю",
    dashed: "пунктир",
    hover: "наведите на луч",
    chart: "Звёздная диаграмма",
  },
};

export type RadarAxis = { id: string; label: string; hint: string; value: number; ref?: number };

const TEXTURE_AXES: TextureId[] = ["tension", "pace", "valence", "humor", "imagery", "ideas", "interiority"];
const PROFILE_AXES: { id: ProfileScaleId; label: string; ru: string }[] = [
  { id: "complexity", label: "dense", ru: "плотность" },
  { id: "scope", label: "epic", ru: "размах" },
  { id: "drive", label: "plot", ru: "сюжет" },
  { id: "realism", label: "fantastic", ru: "фантастика" },
];

type Source = Pick<Fingerprint, "emotions" | "texture"> & { profile?: { scales: NonNullable<Fingerprint["profile"]>["scales"] } };

function average<K extends string>(rows: Record<K, number>[]): Record<K, number> {
  const keys = Object.keys(rows[0]) as K[];
  return Object.fromEntries(keys.map((k) => [k, rows.reduce((s, r) => s + r[k], 0) / rows.length])) as Record<K, number>;
}

/** The average book, for the comparison outline. */
export function meanSource(list: Fingerprint[]): Source | undefined {
  if (!list.length) return undefined;
  const profiled = list.flatMap((f) => (f.profile ? [f.profile.scales] : []));
  return { emotions: average(list.map((f) => f.emotions)), texture: average(list.map((f) => f.texture)), profile: profiled.length ? { scales: average(profiled) } : undefined };
}

/** Book-level axes where outward always means "more": texture, emotional charge and the whole-book scales. */
export function radarAxes(f: Source, ref?: Source, lang: Lang = "en"): RadarAxis[] {
  const t = T[lang];
  const charge = (x: Source) => Math.max(...Object.values<number>(x.emotions));
  const axes: RadarAxis[] = TEXTURE_AXES.map((id) => {
    const tx = TEXTURES.find((x) => x.id === id)!;
    return { id, label: labelOf(tx, lang).toLowerCase(), hint: `${lowOf(tx, lang).toLowerCase()} → ${highOf(tx, lang).toLowerCase()}`, value: f.texture[id], ref: ref?.texture[id] };
  });
  axes.splice(2, 0, { id: "emotion", label: t.emotion, hint: t.emotionHint, value: charge(f), ref: ref && charge(ref) });
  if (f.profile)
    for (const p of PROFILE_AXES) {
      const s = PROFILE_SCALES.find((x) => x.id === p.id)!;
      axes.push({
        id: p.id,
        label: lang === "ru" ? p.ru : p.label,
        hint: `${lowOf(s, lang).toLowerCase()} → ${highOf(s, lang).toLowerCase()} · ${t.whole}`,
        value: f.profile.scales[p.id],
        ref: ref?.profile?.scales[p.id],
      });
    }
  return axes;
}

const SIZE = 320;
const R = 100;

/** Star chart: one spoke per axis, 0 at the centre, 1 at the rim. The dashed outline is the library mean. */
export function Radar({ axes, color = "var(--d1)", refLabel }: { axes: RadarAxis[]; color?: string; refLabel?: string }) {
  const t = useT(T);
  useLang();
  const [hover, setHover] = useState<number | null>(null);
  const n = axes.length;
  const c = SIZE / 2;
  const at = (i: number, v: number) => {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    return [c + Math.cos(a) * R * v, c + Math.sin(a) * R * v] as const;
  };
  const poly = (vals: number[]) => vals.map((v, i) => at(i, Math.max(0.02, Math.min(1, v))).join(",")).join(" ");
  const hasRef = axes.every((a) => a.ref != null);
  const h = hover != null ? axes[hover] : null;
  return (
    <figure className="radar">
      <svg viewBox={`-56 0 ${SIZE + 112} ${SIZE}`} role="img" aria-label={`${t.chart}: ${axes.map((a) => `${a.label} ${Math.round(a.value * 100)}`).join(", ")}`}>
        {[0.25, 0.5, 0.75, 1].map((r) => (
          <polygon key={r} points={poly(axes.map(() => r))} className={r === 1 ? "rim" : "ring"} />
        ))}
        {axes.map((_, i) => {
          const [x, y] = at(i, 1);
          return <line key={i} x1={c} y1={c} x2={x} y2={y} className="spoke" />;
        })}
        {hasRef && <polygon points={poly(axes.map((a) => a.ref!))} className="ref" />}
        <polygon points={poly(axes.map((a) => a.value))} className="shape" style={{ stroke: color, fill: color }} />
        {axes.map((a, i) => {
          const [x, y] = at(i, Math.max(0.02, Math.min(1, a.value)));
          const [lx, ly] = at(i, 1.2);
          const anchor = Math.abs(lx - c) < 8 ? "middle" : lx > c ? "start" : "end";
          return (
            <g key={a.id} className={hover === i ? "axis on" : "axis"} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <circle cx={x} cy={y} r={hover === i ? 3.5 : 2.2} style={{ fill: color }} />
              <text x={lx} y={ly} textAnchor={anchor} dominantBaseline="middle">
                {a.label} <tspan className="val">{Math.round(a.value * 100)}</tspan>
              </text>
              <line x1={c} y1={c} x2={at(i, 1)[0]} y2={at(i, 1)[1]} className="hit" />
            </g>
          );
        })}
      </svg>
      <figcaption className="readout">
        {h ? (
          <>
            <b>{h.label}</b> {Math.round(h.value * 100)}{" "}
            <span className="dim">
              · {h.hint}
              {h.ref != null ? ` · ${t.mean} ${Math.round(h.ref * 100)}` : ""}
            </span>
          </>
        ) : (
          <span className="dim">
            {t.idle}
            {hasRef ? ` · ${t.dashed} = ${refLabel ?? t.mean}` : ""} · {t.hover}
          </span>
        )}
      </figcaption>
    </figure>
  );
}
