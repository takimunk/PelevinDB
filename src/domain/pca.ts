import { ALL_FEATURES, FEATURE_GROUPS, vectorize, type Feature, type Fingerprint, type Weights } from "./fingerprint.ts";

export type Axis = { explained: number; positive: Feature[]; negative: Feature[] };
export type Embedding = {
  points: { id: string; x: number; y: number; z: number }[];
  axes: Axis[];
  /** Weighted, standardized rows; cosine similarity between rows ranks neighbours. */
  rows: Map<string, number[]>;
};

const groupSize = new Map(FEATURE_GROUPS.map((g) => [g.id, g.features.length]));

/** Standardizes features across the corpus, imputes missing values and applies group weights. */
export function prepare(items: { id: string; fingerprint: Fingerprint }[], weights: Weights) {
  const raw = items.map((i) => vectorize(i.fingerprint));
  const d = ALL_FEATURES.length;
  const matrix = raw.map((r) => r.slice());
  for (let j = 0; j < d; j++) {
    const known = raw.map((r) => r[j]).filter((v) => Number.isFinite(v));
    const mean = known.length ? known.reduce((s, v) => s + v, 0) / known.length : 0;
    const variance = known.length > 1 ? known.reduce((s, v) => s + (v - mean) ** 2, 0) / (known.length - 1) : 0;
    const std = Math.sqrt(variance);
    const feature = ALL_FEATURES[j];
    const w = (weights[feature.group] ?? 0) / Math.sqrt(groupSize.get(feature.group)!);
    for (const row of matrix) {
      const v = Number.isFinite(row[j]) ? row[j] : mean;
      row[j] = std > 1e-6 ? ((v - mean) / std) * w : 0;
    }
  }
  return matrix;
}

function topEigen(cov: number[][], count: number) {
  const d = cov.length;
  const work = cov.map((r) => r.slice());
  const result: { value: number; vector: number[] }[] = [];
  for (let k = 0; k < count; k++) {
    // Deterministic start vector keeps the map stable between renders.
    let v = Array.from({ length: d }, (_, i) => 1 + ((i * 7919) % 13) / 13);
    let value = 0;
    for (let iter = 0; iter < 300; iter++) {
      const next = work.map((row) => row.reduce((s, x, j) => s + x * v[j], 0));
      const norm = Math.hypot(...next);
      if (norm < 1e-12) break;
      const normalized = next.map((x) => x / norm);
      const delta = normalized.reduce((s, x, i) => s + Math.abs(x - v[i]), 0);
      v = normalized;
      value = norm;
      if (delta < 1e-10) break;
    }
    const pivot = v.reduce((best, x, i) => (Math.abs(x) > Math.abs(v[best]) ? i : best), 0);
    if (v[pivot] < 0) v = v.map((x) => -x);
    result.push({ value, vector: v });
    for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) work[i][j] -= value * v[i] * v[j];
  }
  return result;
}

export function embed(items: { id: string; fingerprint: Fingerprint }[], weights: Weights): Embedding {
  const matrix = prepare(items, weights);
  const n = matrix.length,
    d = ALL_FEATURES.length;
  const rows = new Map(items.map((item, i) => [item.id, matrix[i]]));
  if (n < 2) return { points: items.map((i) => ({ id: i.id, x: 0, y: 0, z: 0 })), axes: [], rows };
  const cov = Array.from({ length: d }, (_, i) =>
    Array.from({ length: d }, (_, j) => matrix.reduce((s, r) => s + r[i] * r[j], 0) / (n - 1)),
  );
  const trace = cov.reduce((s, r, i) => s + r[i], 0) || 1;
  const eigen = topEigen(cov, 3);
  const axes = eigen.map(({ value, vector }) => {
    const ranked = vector.map((w, j) => ({ w, feature: ALL_FEATURES[j] })).sort((a, b) => b.w - a.w);
    return {
      explained: value / trace,
      positive: ranked.filter((r) => r.w > 0.05).slice(0, 3).map((r) => r.feature),
      negative: ranked.filter((r) => r.w < -0.05).reverse().slice(0, 3).map((r) => r.feature),
    };
  });
  const points = items.map((item, i) => ({
    id: item.id,
    x: eigen[0].vector.reduce((s, w, j) => s + w * matrix[i][j], 0),
    y: eigen[1]?.vector.reduce((s, w, j) => s + w * matrix[i][j], 0) ?? 0,
    z: eigen[2]?.vector.reduce((s, w, j) => s + w * matrix[i][j], 0) ?? 0,
  }));
  return { points, axes, rows };
}

export function cosine(a: number[], b: number[]) {
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export function neighbours(rows: Map<string, number[]>, id: string, k = 4) {
  const row = rows.get(id);
  if (!row) return [];
  return [...rows]
    .filter(([other]) => other !== id)
    .map(([other, r]) => ({ id: other, similarity: cosine(row, r) }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, k);
}
