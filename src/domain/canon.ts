import { ARC_SHAPES, pearson, type ArcId } from "./analysis.ts";
import { ALL_FEATURES, ARC_POINTS, DEFAULT_WEIGHTS, type Feature, type Fingerprint } from "./fingerprint.ts";
import { cosine, embed, type Axis } from "./pca.ts";

export type CanonBook = { id: string; title: string; author: string; rank: number | null; fingerprint: Fingerprint };
export type Pair = { a: CanonBook; b: CanonBook; similarity: number };

/** Book-level patterns across a shelf of fingerprints; every number is recomputed from the current data. */
export type Findings = {
  count: number;
  /** Closest pairs by different authors. */
  twins: Pair[];
  opposites: Pair;
  /** The book whose nearest neighbour is furthest away. */
  loneliest: Pair;
  /** Highest mean similarity to every other book. */
  typical: { book: CanonBook; similarity: number };
  /** Correlation of the light in each act with the whole-book worldview. */
  worldview: number[] | null;
  endsDarker: number;
  arcs: { id: ArcId; label: string; count: number }[];
  /** Features that best predict a higher place on the canon lists; positive r means more of it ranks higher. */
  rank: { feature: Feature; r: number }[];
  axis: Axis | null;
};

const MIN_BOOKS = 4;
const read = (key: string) => ALL_FEATURES.find((f) => `${f.group}:${f.key}` === key)!;

export function canonFindings(books: CanonBook[]): Findings | null {
  if (books.length < MIN_BOOKS) return null;
  const { rows, axes } = embed(books, DEFAULT_WEIGHTS);
  const sim = books.map((a) => books.map((b) => cosine(rows.get(a.id)!, rows.get(b.id)!)));

  const pairs: Pair[] = [];
  for (let i = 0; i < books.length; i++) for (let j = i + 1; j < books.length; j++) pairs.push({ a: books[i], b: books[j], similarity: sim[i][j] });
  pairs.sort((x, y) => y.similarity - x.similarity);

  const nearest = books.map((a, i) => {
    let best = i === 0 ? 1 : 0;
    books.forEach((_, j) => j !== i && sim[i][j] > sim[i][best] && (best = j));
    return { a, b: books[best], similarity: sim[i][best] };
  });
  const means = books.map((book, i) => ({ book, similarity: sim[i].reduce((s, v, j) => (j === i ? s : s + v), 0) / (books.length - 1) }));

  const worldview = read("profile:worldview");
  const profiled = books.filter((b) => Number.isFinite(worldview.read(b.fingerprint)) && b.fingerprint.arc.length === ARC_POINTS);
  const hope = profiled.map((b) => worldview.read(b.fingerprint));

  const ranked = books.filter((b) => b.rank != null);
  const position = ranked.map((b) => -b.rank!);
  const rank =
    ranked.length >= MIN_BOOKS
      ? ALL_FEATURES.map((feature) => {
          const values = ranked.map((b) => feature.read(b.fingerprint));
          return { feature, r: values.every(Number.isFinite) ? pearson(values, position) : NaN };
        })
          .filter((x) => Number.isFinite(x.r))
          .sort((x, y) => Math.abs(y.r) - Math.abs(x.r))
          .slice(0, 4)
      : [];

  const arcCount = new Map<ArcId, number>();
  for (const b of books) arcCount.set(b.fingerprint.arcShape, (arcCount.get(b.fingerprint.arcShape) ?? 0) + 1);

  return {
    count: books.length,
    twins: pairs.filter((p) => p.a.author !== p.b.author).slice(0, 4),
    opposites: pairs.at(-1)!,
    loneliest: nearest.sort((x, y) => x.similarity - y.similarity)[0],
    typical: means.sort((x, y) => y.similarity - x.similarity)[0],
    worldview:
      profiled.length >= MIN_BOOKS
        ? Array.from({ length: ARC_POINTS }, (_, act) =>
            pearson(
              profiled.map((b) => b.fingerprint.arc[act]),
              hope,
            ),
          )
        : null,
    endsDarker: books.filter((b) => b.fingerprint.arc.length >= 2 && b.fingerprint.arc.at(-1)! < b.fingerprint.arc[0]).length,
    arcs: [...arcCount]
      .map(([id, count]) => ({ id, label: ARC_SHAPES.find((a) => a.id === id)?.label ?? "Flat line", count }))
      .sort((x, y) => y.count - x.count),
    rank,
    axis: axes[0] ?? null,
  };
}
