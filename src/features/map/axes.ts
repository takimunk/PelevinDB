import { FEATURE_GROUPS, type Feature } from "../../domain/fingerprint.ts";
import type { Embedding } from "../../domain/pca.ts";
import type { Lang } from "../../i18n/index.ts";
import type { Star } from "./corpus.ts";

const T = {
  en: {
    pcs: "principal components",
    variance: "of variance",
    needs: "needs at least 2 books",
    more: (l: string) => `more ${l}`,
    less: (l: string) => `less ${l}`,
    raw: (l: string, lo: string, hi: string, mean: string) => `${l} · raw Jev value ${lo} → ${hi} · centred on the mean ${mean}`,
  },
  ru: {
    pcs: "главные компоненты",
    variance: "дисперсии",
    needs: "нужно хотя бы 2 книги",
    more: (l: string) => `больше: ${l}`,
    less: (l: string) => `меньше: ${l}`,
    raw: (l: string, lo: string, hi: string, mean: string) => `${l} · ответ Jev от ${lo} до ${hi} · центр — среднее ${mean}`,
  },
};
const nameOf = (f: { label: string; ru?: string }, lang: Lang) => ((lang === "ru" && f.ru) || f.label).toLowerCase();
const fixed = (v: number, lang: Lang) => (lang === "ru" ? v.toFixed(2).replace(".", ",") : v.toFixed(2));

/** "pc0".."pc2" for principal components, or "group:key" for a single fingerprint feature. */
export type AxisChoice = string;
export const DEFAULT_AXES: AxisChoice[] = ["pc0", "pc1", "pc2"];

export type GraphAxis = {
  /** Strongest meaning at each end, for the labels on the canvas. */
  plus: string;
  minus: string;
  /** Full description for the legend. */
  legend: string;
  /** Centred coordinate per star id. */
  values: Map<string, number>;
};

const features = new Map<string, Feature>(FEATURE_GROUPS.flatMap((g) => g.features.map((f) => [`${g.id}:${f.key}`, f] as const)));
/** Loadings carry the feature label only; look the Russian one up by the English label. */
const ruByLabel = new Map(FEATURE_GROUPS.flatMap((g) => g.features.map((f) => [f.label, f.ru] as const)));
const loadingName = (f: { label: string }, lang: Lang) => nameOf({ label: f.label, ru: ruByLabel.get(f.label) }, lang);
const names = (list: { label: string }[], lang: Lang) => list.map((f) => loadingName(f, lang)).join(" · ");

export function axisOptions(embedding: Embedding, lang: Lang = "en") {
  return [
    {
      group: T[lang].pcs,
      options: [0, 1, 2].map((k) => ({
        id: `pc${k}`,
        label: embedding.axes[k]
          ? `PC${k + 1} · ${Math.round(embedding.axes[k].explained * 100)}% · ${embedding.axes[k].positive[0] ? loadingName(embedding.axes[k].positive[0], lang) : "—"}`
          : `PC${k + 1}`,
      })),
    },
    ...FEATURE_GROUPS.map((g) => ({ group: (lang === "ru" ? g.ru : g.label).toLowerCase(), options: g.features.map((f) => ({ id: `${g.id}:${f.key}`, label: nameOf(f, lang) })) })),
  ];
}

/** Where each star sits on the shown axes, squashed into −1..1 so outliers stay on screen. */
export function placeStars(ids: string[], axes: GraphAxis[], dims: number) {
  const fitters = axes.slice(0, dims).map((a) => {
    const std = Math.sqrt(ids.reduce((sum, id) => sum + (a.values.get(id) ?? 0) ** 2, 0) / Math.max(1, ids.length)) || 1;
    return (id: string) => Math.tanh((a.values.get(id) ?? 0) / std / 2);
  });
  return new Map(ids.map((id) => [id, fitters.map((f) => f(id))]));
}

export function buildAxis(choice: AxisChoice, stars: Star[], embedding: Embedding, lang: Lang = "en"): GraphAxis {
  const t = T[lang];
  const pc = /^pc(\d)$/.exec(choice);
  if (pc) {
    const k = Number(pc[1]);
    const axis = embedding.axes[k];
    const coord = (["x", "y", "z"] as const)[k];
    return {
      plus: axis?.positive[0] ? loadingName(axis.positive[0], lang) : "—",
      minus: axis?.negative[0] ? loadingName(axis.negative[0], lang) : "—",
      legend: axis ? `PC${k + 1} · ${Math.round(axis.explained * 100)}% ${t.variance} · − ${names(axis.negative, lang) || "—"} / + ${names(axis.positive, lang) || "—"}` : `PC${k + 1} · ${t.needs}`,
      values: new Map(embedding.points.map((p) => [p.id, p[coord]])),
    };
  }
  const feature = features.get(choice)!;
  const raw = stars.map((s) => feature.read(s.fingerprint));
  const known = raw.filter(Number.isFinite);
  const mean = known.length ? known.reduce((s, v) => s + v, 0) / known.length : 0;
  const lo = known.length ? Math.min(...known) : 0,
    hi = known.length ? Math.max(...known) : 0;
  const label = nameOf(feature, lang);
  return {
    plus: t.more(label),
    minus: t.less(label),
    legend: t.raw(label, fixed(lo, lang), fixed(hi, lang), fixed(mean, lang)),
    values: new Map(stars.map((s, i) => [s.id, (Number.isFinite(raw[i]) ? raw[i] : mean) - mean])),
  };
}
