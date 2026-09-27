import { ALL_FEATURES, vectorize, type Fingerprint, type Weights } from "./fingerprint.ts";
import { agree, PLACES, PLACES_RU, REGION_WORDS, REGION_WORDS_RU } from "./region-words.ts";

/** A group of books that sit together on the current view, named after what sets them apart. */
export type Region = {
  name: string;
  /** Adjectives of the features that most distinguish the region, strongest first. */
  traits: string[];
  /** The same name and traits in Russian, with the adjective agreeing with the place word. */
  ru: { name: string; traits: string[] };
  members: string[];
  /** Mean position in the clustered coordinates. */
  centre: number[];
};

/** What the view is about: group weights and the features on its axes steer the names. */
export type RegionFocus = { weights: Weights; axes: string[] };

// Seeded PRNG (mulberry32) keeps regions identical between renders.
const random = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const dist2 = (a: number[], b: number[]) => a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0);
const nearest = (p: number[], centroids: number[][]) => centroids.reduce((best, c, j) => (dist2(p, c) < dist2(p, centroids[best]) ? j : best), 0);
const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;

/** k-means with k-means++ seeding; the best of several restarts. Labels are compact (no empty clusters). */
export function kmeans(points: number[][], k: number, restarts = 8, seed = 7) {
  const rand = random(seed);
  let best: { labels: number[]; inertia: number } | null = null;
  for (let r = 0; r < restarts; r++) {
    const centroids = [points[Math.floor(rand() * points.length)].slice()];
    while (centroids.length < k) {
      const d = points.map((p) => Math.min(...centroids.map((c) => dist2(p, c))));
      let pick = rand() * d.reduce((s, v) => s + v, 0);
      if (pick <= 0) break;
      let i = 0;
      while (i < d.length - 1 && (pick -= d[i]) > 0) i++;
      centroids.push(points[i].slice());
    }
    const labels = new Array<number>(points.length).fill(-1);
    for (let iter = 0; iter < 100; iter++) {
      let changed = false;
      points.forEach((p, i) => {
        const j = nearest(p, centroids);
        if (j !== labels[i]) ((labels[i] = j), (changed = true));
      });
      if (!changed) break;
      centroids.forEach((c, j) => {
        const members = points.filter((_, i) => labels[i] === j);
        if (members.length) for (let d = 0; d < c.length; d++) c[d] = mean(members.map((p) => p[d]));
      });
    }
    const inertia = points.reduce((s, p, i) => s + dist2(p, centroids[labels[i]]), 0);
    if (!best || inertia < best.inertia - 1e-12) best = { labels, inertia };
  }
  const order = [...new Set(best!.labels)];
  return best!.labels.map((l) => order.indexOf(l));
}

/** Mean silhouette: how much closer each point is to its own cluster than to the next one (−1..1). */
export function silhouette(points: number[][], labels: number[]) {
  const k = Math.max(...labels) + 1;
  if (k < 2) return 0;
  let total = 0;
  points.forEach((p, i) => {
    const sums = new Array<number>(k).fill(0),
      counts = new Array<number>(k).fill(0);
    points.forEach((q, j) => {
      if (i === j) return;
      sums[labels[j]] += Math.sqrt(dist2(p, q));
      counts[labels[j]]++;
    });
    const own = labels[i];
    if (!counts[own]) return;
    const a = sums[own] / counts[own];
    const b = Math.min(...sums.map((s, c) => (c === own || !counts[c] ? Infinity : s / counts[c])));
    total += (b - a) / Math.max(a, b, 1e-12);
  });
  return total / points.length;
}

/** Chooses the number of clusters by silhouette; null when there are too few points to group. */
export function cluster(points: number[][]) {
  const n = points.length;
  const lo = n >= 15 ? 3 : 2,
    hi = Math.min(7, Math.floor(n / 4));
  let best: { labels: number[]; score: number } | null = null;
  for (let k = lo; k <= hi; k++) {
    const labels = kmeans(points, k);
    const score = silhouette(points, labels);
    if (!best || score > best.score + 1e-9) best = { labels, score };
  }
  return best?.labels ?? null;
}

type Pick = { noun: string; adj: string; ruNoun: string; ruAdj: string; score: number };

/** Features ranked by how far the members' mean sits from the corpus mean, in standard deviations. */
function distinctive(members: number[][], stats: { mean: number; std: number }[], focus: RegionFocus, everything = false): Pick[] {
  const picks = ALL_FEATURES.flatMap((f, j) => {
    const id = `${f.group}:${f.key}`;
    const words = REGION_WORDS[id];
    const weight = focus.axes.includes(id) ? 1.5 : everything ? 1 : Math.min(1.5, focus.weights[f.group]);
    if (!words || weight <= 0 || stats[j].std < 1e-6) return [];
    const values = members.map((r) => r[j]).filter(Number.isFinite);
    if (!values.length) return [];
    const z = (mean(values) - stats[j].mean) / stats[j].std;
    const side = z >= 0 ? words : words.low;
    const ru = z >= 0 ? REGION_WORDS_RU[id] : REGION_WORDS_RU[id]?.low;
    return side ? [{ noun: side.noun, adj: side.adj, ruNoun: ru?.noun ?? side.noun, ruAdj: ru?.adj ?? side.adj, score: Math.abs(z) * weight }] : [];
  });
  if (!picks.length && !everything) return distinctive(members, stats, focus, true);
  return picks.sort((a, b) => b.score - a.score);
}

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const capital = (s: string) => s[0].toUpperCase() + s.slice(1);

/**
 * Groups the books by where they sit on the view (`coords`, one vector per id) and names each group
 * from its most distinctive Jev features, e.g. "Calm corner of hope". Largest region first.
 */
export function findRegions(items: { id: string; fingerprint: Fingerprint }[], coords: Map<string, number[]>, focus: RegionFocus): Region[] {
  const placed = items.filter((i) => coords.has(i.id));
  const labels = cluster(placed.map((i) => coords.get(i.id)!));
  if (!labels) return [];
  const rows = placed.map((i) => vectorize(i.fingerprint));
  const stats = ALL_FEATURES.map((_, j) => {
    const known = rows.map((r) => r[j]).filter(Number.isFinite);
    const m = known.length ? mean(known) : 0;
    return { mean: m, std: known.length > 1 ? Math.sqrt(known.reduce((s, v) => s + (v - m) ** 2, 0) / (known.length - 1)) : 0 };
  });
  const groups = Array.from({ length: Math.max(...labels) + 1 }, (_, c) => placed.flatMap((_, i) => (labels[i] === c ? [i] : []))).sort((a, b) => b.length - a.length || a[0] - b[0]);
  const nouns = new Set<string>(),
    places = new Set<string>();
  return groups.map((group) => {
    const ranked = distinctive(
      group.map((i) => rows[i]),
      stats,
      focus,
    );
    const noun = ranked.find((p) => !nouns.has(p.noun)) ?? ranked[0];
    const adj = ranked.find((p) => p !== noun && p.adj !== noun?.adj && p.noun !== noun?.noun);
    const size = group.length / placed.length < 0.12 ? "small" : group.length / placed.length < 0.25 ? "medium" : "large";
    const tier = PLACES[size];
    const start = hash(noun?.noun ?? "") % tier.length;
    const slot = tier.map((_, i) => (start + i) % tier.length).find((k) => !places.has(tier[k])) ?? start;
    const place = tier[slot],
      ruPlace = PLACES_RU[size][slot];
    if (noun) nouns.add(noun.noun);
    places.add(place);
    const name = noun ? (adj ? `${capital(adj.adj)} ${place} of ${noun.noun}` : `${capital(place)} of ${noun.noun}`) : capital(place);
    const ruName = noun ? (adj ? `${capital(agree(adj.ruAdj, ruPlace.gender))} ${ruPlace.word} ${noun.ruNoun}` : `${capital(ruPlace.word)} ${noun.ruNoun}`) : capital(ruPlace.word);
    const ids = group.map((i) => placed[i].id);
    const dims = coords.get(ids[0])!.length;
    return {
      name,
      traits: [...new Set(ranked.map((p) => p.adj))].slice(0, 3),
      ru: { name: ruName, traits: [...new Set(ranked.map((p) => agree(p.ruAdj, "p")))].slice(0, 3) },
      members: ids,
      centre: Array.from({ length: dims }, (_, d) => mean(ids.map((id) => coords.get(id)![d]))),
    };
  });
}
