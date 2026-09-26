import { FEATURE_GROUPS, type Feature } from "../../domain/fingerprint.ts";
import type { Embedding } from "../../domain/pca.ts";
import type { Star } from "./corpus.ts";

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
const names = (list: Feature[]) => list.map((f) => f.label.toLowerCase()).join(" · ");

export function axisOptions(embedding: Embedding) {
  return [
    {
      group: "principal components",
      options: [0, 1, 2].map((k) => ({
        id: `pc${k}`,
        label: embedding.axes[k] ? `PC${k + 1} · ${Math.round(embedding.axes[k].explained * 100)}% · ${embedding.axes[k].positive[0]?.label.toLowerCase() ?? "—"}` : `PC${k + 1}`,
      })),
    },
    ...FEATURE_GROUPS.map((g) => ({ group: g.label.toLowerCase(), options: g.features.map((f) => ({ id: `${g.id}:${f.key}`, label: f.label.toLowerCase() })) })),
  ];
}

export function buildAxis(choice: AxisChoice, stars: Star[], embedding: Embedding): GraphAxis {
  const pc = /^pc(\d)$/.exec(choice);
  if (pc) {
    const k = Number(pc[1]);
    const axis = embedding.axes[k];
    const coord = (["x", "y", "z"] as const)[k];
    return {
      plus: axis?.positive[0]?.label.toLowerCase() ?? "—",
      minus: axis?.negative[0]?.label.toLowerCase() ?? "—",
      legend: axis ? `PC${k + 1} · ${Math.round(axis.explained * 100)}% of variance · − ${names(axis.negative) || "—"} / + ${names(axis.positive) || "—"}` : `PC${k + 1} · needs at least 2 books`,
      values: new Map(embedding.points.map((p) => [p.id, p[coord]])),
    };
  }
  const feature = features.get(choice)!;
  const raw = stars.map((s) => feature.read(s.fingerprint));
  const known = raw.filter(Number.isFinite);
  const mean = known.length ? known.reduce((s, v) => s + v, 0) / known.length : 0;
  const lo = known.length ? Math.min(...known) : 0,
    hi = known.length ? Math.max(...known) : 0;
  const label = feature.label.toLowerCase();
  return {
    plus: `more ${label}`,
    minus: `less ${label}`,
    legend: `${label} · raw jev value ${lo.toFixed(2)} → ${hi.toFixed(2)} · centred on the mean ${mean.toFixed(2)}`,
    values: new Map(stars.map((s, i) => [s.id, (Number.isFinite(raw[i]) ? raw[i] : mean) - mean])),
  };
}
