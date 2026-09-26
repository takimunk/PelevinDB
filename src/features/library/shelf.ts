import { EMOTIONS, ERAS, GENRES, MOODS, THEMES } from "../../../shared/catalog.ts";
import { argmax, ARC_SHAPES, topEntries } from "../../domain/analysis.ts";
import type { Fingerprint } from "../../domain/fingerprint.ts";
import type { CanonRow } from "../../storage/corpus.ts";

/** Colour family per column group: feel is red, craft is blue, world is green. */
export type Tint = "r" | "g" | "b" | null;
export type Column = {
  id: string;
  label: string;
  hint: string;
  width: string;
  tint: Tint;
  /** Numbers sort and get a heat cell; strings sort alphabetically. */
  value: (r: CanonRow) => number | string | null;
  /** 0–1 averages of Jev answers print as two decimals; others as they are. */
  score?: boolean;
};

const fp = (read: (f: Fingerprint) => number | undefined) => (r: CanonRow) => {
  const v = r.fingerprint ? read(r.fingerprint) : undefined;
  return v == null || !Number.isFinite(v) ? null : v;
};
const label = <T extends { id: string; label: string }>(list: readonly T[], id: string | undefined) => list.find((x) => x.id === id)?.label.toLowerCase() ?? null;
const score = (id: string, name: string, hint: string, tint: Tint, read: (f: Fingerprint) => number | undefined): Column => ({
  id,
  label: name,
  hint,
  width: "7ch",
  tint,
  value: fp(read),
  score: true,
});
const tag = (id: string, name: string, hint: string, width: string, value: (f: Fingerprint) => string | null): Column => ({
  id,
  label: name,
  hint,
  width,
  tint: null,
  value: (r) => (r.fingerprint ? value(r.fingerprint) : null),
});

const era = (f: Fingerprint) => {
  if (!f.profile) return null;
  const { unclear: _, ...known } = f.profile.era;
  return label(ERAS, argmax(known));
};

export const COLUMNS: Column[] = [
  { id: "rank", label: "#", hint: "Place on the combined canon lists", width: "4ch", tint: null, value: (r) => r.rank },
  { id: "title", label: "title", hint: "", width: "34ch", tint: null, value: (r) => r.title },
  { id: "author", label: "author", hint: "", width: "20ch", tint: null, value: (r) => r.author },
  { id: "pages", label: "pages", hint: "Pages of up to 1,800 characters", width: "6ch", tint: null, value: (r) => r.pages },
  { id: "jev", label: "read", hint: "Share of pages Jev has read", width: "6ch", tint: null, value: (r) => (r.pages ? r.analysed / r.pages : 0) },
  tag("genre", "genre", "Most likely genre from the whole-book profile", "16ch", (f) => (f.profile ? label(GENRES, argmax(f.profile.genre)) : null)),
  tag("era", "era", "When the story is set", "13ch", era),
  tag("arc", "arc", "Closest of Vonnegut's six story shapes, from the light curve", "15ch", (f) => label(ARC_SHAPES, f.arcShape) ?? "flat line"),
  tag("mood", "mood", "Most frequent page mood", "12ch", (f) => label(MOODS, argmax(f.mood))),
  tag("emotion", "emotion", "Strongest emotion on average", "13ch", (f) => label(EMOTIONS, argmax(f.emotions))),
  tag("themes", "themes", "Three strongest themes", "28ch", (f) =>
    topEntries(f.themes, 3)
      .map(([id]) => label(THEMES, id))
      .join(", "),
  ),

  score("light", "light", "Mean light of every page: 0 bleak, 1 radiant", "r", (f) => f.texture.valence),
  score("tension", "tension", "Mean tension, conflict and suspense", "r", (f) => f.texture.tension),
  score("pace", "pace", "How much happens per page", "r", (f) => f.texture.pace),
  score("humor", "humor", "Humour, irony and playfulness", "r", (f) => f.texture.humor),
  score("joy", "joy", "Mean joy score", "r", (f) => f.emotions.joy),
  score("fear", "fear", "Mean fear score", "r", (f) => f.emotions.fear),
  score("sadness", "sad", "Mean sadness score", "r", (f) => f.emotions.sadness),
  score("anger", "anger", "Mean anger score", "r", (f) => f.emotions.anger),
  score("opening", "start", "Light in the first fifth of the book", "r", (f) => f.arc[0]),
  score("ending", "end", "Light in the last fifth of the book", "r", (f) => f.arc.at(-1)),
  {
    id: "turn",
    label: "Δ light",
    hint: "Ending light minus opening light: negative ends darker",
    width: "8ch",
    tint: "r",
    value: fp((f) => (f.arc.length >= 2 ? f.arc.at(-1)! - f.arc[0] : undefined)),
    score: true,
  },
  score("volatility", "swing", "Mean page-to-page change in light", "r", (f) => f.volatility),

  score("dialogue", "dialog", "Share of pages led by dialogue", "b", (f) => f.mode.dialogue),
  score("introspection", "inner", "Share of pages led by a character's thoughts", "b", (f) => f.mode.introspection),
  score("description", "descr", "Share of pages led by description", "b", (f) => f.mode.description),
  score("digression", "essay", "Share of pages where the narrator argues directly", "b", (f) => f.mode.essay),
  score("interiority", "mind", "How much happens inside a character's head", "b", (f) => f.texture.interiority),
  score("imagery", "image", "Sensory and figurative richness", "b", (f) => f.texture.imagery),
  score("ideas", "ideas", "Abstract reflection: philosophy, morality, society", "b", (f) => f.texture.ideas),
  score("complexity", "dense", "How demanding the prose is", "b", (f) => f.profile?.scales.complexity),

  score("worldview", "hope", "Whole-book worldview: 0 despairing, 1 hopeful", "g", (f) => f.profile?.scales.worldview),
  score("scope", "epic", "0 intimate, 1 epic", "g", (f) => f.profile?.scales.scope),
  score("realism", "fantasy", "0 strict realism, 1 wholly fantastical", "g", (f) => f.profile?.scales.realism),
  score("drive", "plot", "0 character-driven, 1 plot-driven", "g", (f) => f.profile?.scales.drive),
  score("audience", "adult", "0 young children, 1 adults only", "g", (f) => f.profile?.scales.audience),
  score("love", "love", "How often pages are about love", "g", (f) => f.themes.love),
  score("death", "death", "How often pages are about death", "g", (f) => f.themes.death),
  score("power", "power", "How often pages are about power", "g", (f) => f.themes.power),
  score("money", "money", "How often pages are about money", "g", (f) => f.themes.money),
  score("faith", "faith", "How often pages are about faith", "g", (f) => f.themes.faith),
];

const BY_ID = new Map(COLUMNS.map((c) => [c.id, c]));
export const column = (id: string) => BY_ID.get(id);

const LEAD = ["rank", "title", "author"];
export const VIEWS = {
  overview: { label: "overview", columns: [...LEAD, "pages", "jev", "genre", "era", "arc", "light", "tension", "humor", "worldview"] },
  feel: { label: "feel", columns: [...LEAD, "emotion", "mood", "light", "tension", "pace", "humor", "joy", "fear", "sadness", "anger"] },
  arc: { label: "arc", columns: [...LEAD, "arc", "opening", "ending", "turn", "volatility", "tension", "worldview"] },
  craft: { label: "craft", columns: [...LEAD, "pages", "dialogue", "introspection", "description", "digression", "interiority", "imagery", "ideas", "complexity"] },
  world: { label: "world", columns: [...LEAD, "genre", "era", "themes", "worldview", "scope", "realism", "drive", "audience"] },
  themes: { label: "themes", columns: [...LEAD, "themes", "love", "death", "power", "money", "faith"] },
} as const;
export type ViewId = keyof typeof VIEWS;

/** Facets filter on a tag column; each value lists how many books have it. */
export const FACETS = ["genre", "era", "arc", "mood", "emotion"] as const;
export type FacetId = (typeof FACETS)[number];

export type Lens = { id: string; label: string; hint: string; test: (r: CanonRow) => boolean };
const num = (id: string, r: CanonRow) => column(id)!.value(r) as number | null;
const at = (id: string, cmp: (v: number) => boolean) => (r: CanonRow) => {
  const v = num(id, r);
  return v != null && cmp(v);
};
export const LENSES: Lens[] = [
  { id: "short", label: "short", hint: "under 150 pages", test: (r) => r.pages < 150 },
  { id: "doorstop", label: "doorstops", hint: "over 800 pages", test: (r) => r.pages > 800 },
  { id: "funny", label: "funny", hint: "humor ≥ 0.5", test: at("humor", (v) => v >= 0.5) },
  { id: "bleak", label: "bleak", hint: "light ≤ 0.3", test: at("light", (v) => v <= 0.3) },
  { id: "gripping", label: "page-turners", hint: "tension ≥ 0.5 and pace ≥ 0.4", test: (r) => (num("tension", r) ?? 0) >= 0.5 && (num("pace", r) ?? 0) >= 0.4 },
  { id: "darker", label: "ends darker", hint: "ending at least 0.15 darker than the opening", test: at("turn", (v) => v <= -0.15) },
  { id: "brighter", label: "ends brighter", hint: "ending at least 0.15 lighter than the opening", test: at("turn", (v) => v >= 0.15) },
  { id: "talky", label: "talky", hint: "over half the pages led by dialogue", test: at("dialogue", (v) => v > 0.5) },
  { id: "inward", label: "inward", hint: "interiority ≥ 0.5", test: at("interiority", (v) => v >= 0.5) },
];

export type ShelfState = { view: ViewId; sort: string; dir: 1 | -1; q: string; lens: string | null; facets: Partial<Record<FacetId, string>> };

export function readState(params: Record<string, string>): ShelfState {
  const view = (params.view in VIEWS ? params.view : "overview") as ViewId;
  const sort = column(params.sort) ? params.sort : "rank";
  return {
    view,
    sort,
    dir: params.dir === "-1" ? -1 : 1,
    q: params.q ?? "",
    lens: LENSES.some((l) => l.id === params.lens) ? params.lens : null,
    facets: Object.fromEntries(FACETS.filter((f) => params[f]).map((f) => [f, params[f]])),
  };
}

export function writeState(s: ShelfState): string {
  const p = new URLSearchParams();
  if (s.view !== "overview") p.set("view", s.view);
  if (s.sort !== "rank") p.set("sort", s.sort);
  if (s.dir === -1) p.set("dir", "-1");
  if (s.q) p.set("q", s.q);
  if (s.lens) p.set("lens", s.lens);
  for (const f of FACETS) if (s.facets[f]) p.set(f, s.facets[f]!);
  return p.toString();
}

function compare(a: CanonRow, b: CanonRow, col: Column) {
  const x = col.value(a),
    y = col.value(b);
  if (x == null || y == null) return x == null ? (y == null ? 0 : 1) : -1;
  return typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
}

/** Filters and sorts; books without a value for the sorted column always go last. */
export function applyShelf(rows: CanonRow[], s: ShelfState) {
  const q = s.q.toLowerCase();
  const lens = LENSES.find((l) => l.id === s.lens);
  const col = column(s.sort)!;
  return rows
    .filter((r) => !q || `${r.title} ${r.author}`.toLowerCase().includes(q))
    .filter((r) => !lens || lens.test(r))
    .filter((r) => FACETS.every((f) => !s.facets[f] || column(f)!.value(r) === s.facets[f]))
    .sort((a, b) => {
      const x = col.value(a),
        y = col.value(b);
      if (x == null || y == null) return compare(a, b, col);
      return compare(a, b, col) * s.dir;
    });
}

/** Values of a facet across `rows` with counts, most common first. */
export function facetCounts(rows: CanonRow[], f: FacetId) {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const v = column(f)!.value(r);
    if (typeof v === "string") counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]);
}

/** Min and max of each numeric column, for heat cells that stay comparable while filtering. */
export function ranges(rows: CanonRow[]) {
  const out = new Map<string, [number, number]>();
  for (const c of COLUMNS) {
    const vs = rows.map((r) => c.value(r)).filter((v): v is number => typeof v === "number");
    if (vs.length) out.set(c.id, [Math.min(...vs), Math.max(...vs)]);
  }
  return out;
}
