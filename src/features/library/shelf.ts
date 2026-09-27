import { EMOTIONS, ERAS, GENRES, MOODS, THEMES } from "../../../shared/catalog.ts";
import { argmax, ARC_SHAPES, topEntries } from "../../domain/analysis.ts";
import type { Fingerprint } from "../../domain/fingerprint.ts";
import type { Lang } from "../../i18n/index.ts";
import type { CanonRow } from "../../storage/corpus.ts";
import { dimLabel, kindLabel, type DimGroup } from "./labels.ts";

/** A string in both languages. */
export type L = { en: string; ru: string };
const l = (en: string, ru: string): L => ({ en, ru });

/** Colour family per column group: feel is red, craft is blue, world is green. */
export type Tint = "r" | "g" | "b" | null;
export type Column = {
  id: string;
  label: L;
  hint: L;
  width: string;
  tint: Tint;
  /** Numbers sort and get a heat cell; strings sort alphabetically. Tag strings are catalog ids, shown through `display`. */
  value: (r: CanonRow) => number | string | null;
  /** How a tag value reads in a language. */
  display?: (v: string, lang: Lang) => string;
  /** 0–1 averages of Jev answers print as two decimals; others as they are. */
  score?: boolean;
};

const fp = (read: (f: Fingerprint) => number | undefined) => (r: CanonRow) => {
  const v = r.fingerprint ? read(r.fingerprint) : undefined;
  return v == null || !Number.isFinite(v) ? null : v;
};
/** Tag cells keep the catalog id as their value (stable in URLs and facets) and translate on display. */
const tagOf = <T extends { id: string; label: string; ru?: string }>(group: DimGroup, list: readonly T[]) => (v: string, lang: Lang) =>
  v
    .split(",")
    .map((id) => {
      const item = list.find((x) => x.id === id);
      return item ? dimLabel(group, item, lang).toLowerCase() : id;
    })
    .join(", ");
const known = <T extends { id: string }>(list: readonly T[], id: string | undefined) => (id && list.some((x) => x.id === id) ? id : null);
const score = (id: string, name: L, hint: L, tint: Tint, read: (f: Fingerprint) => number | undefined): Column => ({
  id,
  label: name,
  hint,
  width: "8ch",
  tint,
  value: fp(read),
  score: true,
});
const tag = (id: string, name: L, hint: L, width: string, value: (f: Fingerprint) => string | null, display: Column["display"]): Column => ({
  id,
  label: name,
  hint,
  width,
  tint: null,
  value: (r) => (r.fingerprint ? value(r.fingerprint) : null),
  display,
});

const era = (f: Fingerprint) => {
  if (!f.profile) return null;
  const { unclear: _, ...rest } = f.profile.era;
  return argmax(rest) ?? null;
};
const ARC_LIST = [...ARC_SHAPES, { id: "flat", label: "Flat line" }] as const;

export const COLUMNS: Column[] = [
  { id: "rank", label: l("order", "порядок"), hint: l("Order in the corpus: by year when known", "Порядок в корпусе: по году, если он известен"), width: "4ch", tint: null, value: (r) => r.rank ?? r.year ?? null },
  { id: "title", label: l("title", "название"), hint: l("", ""), width: "minmax(34ch, 1fr)", tint: null, value: (r) => r.title },
  { id: "year", label: l("year", "год"), hint: l("Year of first publication", "Год первой публикации"), width: "6ch", tint: null, value: (r) => r.year ?? null },
  {
    id: "kind",
    label: l("form", "форма"),
    hint: l("Novel, novella, story or essay", "Роман, повесть, рассказ или эссе"),
    width: "10ch",
    tint: null,
    value: (r) => r.kind ?? null,
    display: (v, lang) => kindLabel(v as never, lang) ?? v,
  },
  { id: "pages", label: l("pages", "стр."), hint: l("Pages of up to 1,800 characters", "Страницы до 1800 знаков"), width: "6ch", tint: null, value: (r) => r.pages },
  tag("genre", l("genre", "жанр"), l("Most likely genre from the whole-book profile", "Наиболее вероятный жанр по профилю всей книги"), "18ch", (f) => (f.profile ? known(GENRES, argmax(f.profile.genre)) : null), tagOf("genre", GENRES)),
  tag("era", l("era", "эпоха"), l("When the story is set", "Когда происходит действие"), "14ch", era, tagOf("era", ERAS)),
  tag("arc", l("arc", "дуга"), l("Closest of Vonnegut’s six story shapes, from the light curve", "Ближайшая из шести сюжетных форм Воннегута по кривой света"), "16ch", (f) => known(ARC_LIST, f.arcShape) ?? "flat", tagOf("arc", ARC_LIST)),
  tag("mood", l("mood", "настроение"), l("Most frequent page mood", "Самое частое настроение страниц"), "14ch", (f) => known(MOODS, argmax(f.mood)), tagOf("mood", MOODS)),
  tag("emotion", l("emotion", "эмоция"), l("Strongest emotion on average", "Самая сильная эмоция в среднем"), "13ch", (f) => known(EMOTIONS, argmax(f.emotions)), tagOf("emotion", EMOTIONS)),
  tag(
    "themes",
    l("themes", "темы"),
    l("Three strongest themes", "Три самые сильные темы"),
    "30ch",
    (f) =>
      topEntries(f.themes, 3)
        .map(([id]) => id)
        .join(",") || null,
    tagOf("theme", THEMES),
  ),

  score("light", l("light", "свет"), l("Mean light of every page: 0 bleak, 1 radiant", "Средний свет страниц: 0 беспросветно, 1 сияюще"), "r", (f) => f.texture.valence),
  score("tension", l("tension", "напряж."), l("Mean tension, conflict and suspense", "Среднее напряжение, конфликт и саспенс"), "r", (f) => f.texture.tension),
  score("pace", l("pace", "темп"), l("How much happens per page", "Сколько происходит на странице"), "r", (f) => f.texture.pace),
  score("humor", l("humour", "юмор"), l("Humour, irony and playfulness", "Юмор, ирония и игра"), "r", (f) => f.texture.humor),
  score("joy", l("joy", "радость"), l("Mean joy score", "Средняя оценка радости"), "r", (f) => f.emotions.joy),
  score("fear", l("fear", "страх"), l("Mean fear score", "Средняя оценка страха"), "r", (f) => f.emotions.fear),
  score("sadness", l("sad", "грусть"), l("Mean sadness score", "Средняя оценка грусти"), "r", (f) => f.emotions.sadness),
  score("anger", l("anger", "гнев"), l("Mean anger score", "Средняя оценка гнева"), "r", (f) => f.emotions.anger),
  score("opening", l("start", "начало"), l("Light in the first fifth of the book", "Свет в первой пятой части книги"), "r", (f) => f.arc[0]),
  score("ending", l("end", "финал"), l("Light in the last fifth of the book", "Свет в последней пятой части книги"), "r", (f) => f.arc.at(-1)),
  {
    id: "turn",
    label: l("Δ light", "Δ свет"),
    hint: l("Ending light minus opening light: negative ends darker", "Свет финала минус свет начала: меньше нуля — финал темнее"),
    width: "8ch",
    tint: "r",
    value: fp((f) => (f.arc.length >= 2 ? f.arc.at(-1)! - f.arc[0] : undefined)),
    score: true,
  },
  score("volatility", l("swing", "качели"), l("Mean page-to-page change in light", "Среднее изменение света от страницы к странице"), "r", (f) => f.volatility),

  score("dialogue", l("dialog", "диалог"), l("Share of pages led by dialogue", "Доля страниц, где ведёт диалог"), "b", (f) => f.mode.dialogue),
  score("introspection", l("inner", "мысли"), l("Share of pages led by a character’s thoughts", "Доля страниц, где ведут мысли героя"), "b", (f) => f.mode.introspection),
  score("description", l("descr", "описание"), l("Share of pages led by description", "Доля страниц, где ведёт описание"), "b", (f) => f.mode.description),
  score("digression", l("essay", "отступл."), l("Share of pages where the narrator argues directly", "Доля страниц, где рассказчик рассуждает напрямую"), "b", (f) => f.mode.essay),
  score("interiority", l("mind", "внутр."), l("How much happens inside a character’s head", "Сколько происходит в голове героя"), "b", (f) => f.texture.interiority),
  score("imagery", l("image", "образы"), l("Sensory and figurative richness", "Чувственная и образная насыщенность"), "b", (f) => f.texture.imagery),
  score("ideas", l("ideas", "идеи"), l("Abstract reflection: philosophy, morality, society", "Отвлечённые рассуждения: философия, мораль, общество"), "b", (f) => f.texture.ideas),
  score("complexity", l("dense", "сложн."), l("How demanding the prose is", "Насколько требовательна проза"), "b", (f) => f.profile?.scales.complexity),

  score("worldview", l("hope", "надежда"), l("Whole-book worldview: 0 despairing, 1 hopeful", "Мироощущение книги: 0 отчаяние, 1 надежда"), "g", (f) => f.profile?.scales.worldview),
  score("scope", l("epic", "эпичн."), l("0 intimate, 1 epic", "0 камерно, 1 эпично"), "g", (f) => f.profile?.scales.scope),
  score("realism", l("fantasy", "фантаст."), l("0 strict realism, 1 wholly fantastical", "0 строгий реализм, 1 чистая фантастика"), "g", (f) => f.profile?.scales.realism),
  score("drive", l("plot", "сюжет"), l("0 character-driven, 1 plot-driven", "0 держится на героях, 1 на сюжете"), "g", (f) => f.profile?.scales.drive),
  score("audience", l("adult", "взросл."), l("0 young children, 1 adults only", "0 для малышей, 1 только для взрослых"), "g", (f) => f.profile?.scales.audience),
  score("love", l("love", "любовь"), l("How often pages are about love", "Как часто страницы о любви"), "g", (f) => f.themes.love),
  score("death", l("death", "смерть"), l("How often pages are about death", "Как часто страницы о смерти"), "g", (f) => f.themes.death),
  score("power", l("power", "власть"), l("How often pages are about power", "Как часто страницы о власти"), "g", (f) => f.themes.power),
  score("money", l("money", "деньги"), l("How often pages are about money", "Как часто страницы о деньгах"), "g", (f) => f.themes.money),
  score("faith", l("faith", "вера"), l("How often pages are about faith", "Как часто страницы о вере"), "g", (f) => f.themes.faith),
];

const BY_ID = new Map(COLUMNS.map((c) => [c.id, c]));
export const column = (id: string) => BY_ID.get(id);

const LEAD = ["title", "year"];
export const VIEWS = {
  overview: { label: l("overview", "обзор"), columns: [...LEAD, "kind", "pages", "genre", "arc", "light", "tension", "humor", "worldview"] },
  feel: { label: l("feel", "чувства"), columns: [...LEAD, "emotion", "mood", "light", "tension", "pace", "humor", "joy", "fear", "sadness", "anger"] },
  arc: { label: l("arc", "дуга"), columns: [...LEAD, "arc", "opening", "ending", "turn", "volatility", "tension", "worldview"] },
  craft: { label: l("craft", "письмо"), columns: [...LEAD, "pages", "dialogue", "introspection", "description", "digression", "interiority", "imagery", "ideas", "complexity"] },
  world: { label: l("world", "мир"), columns: [...LEAD, "genre", "era", "themes", "worldview", "scope", "realism", "drive", "audience"] },
  themes: { label: l("themes", "темы"), columns: [...LEAD, "themes", "love", "death", "power", "money", "faith"] },
} as const;
export type ViewId = keyof typeof VIEWS;

/** Facets filter on a tag column; each value lists how many books have it. */
export const FACETS = ["kind", "genre", "era", "arc", "mood", "emotion"] as const;
export type FacetId = (typeof FACETS)[number];

export type Lens = { id: string; label: L; hint: L; test: (r: CanonRow) => boolean };
const num = (id: string, r: CanonRow) => column(id)!.value(r) as number | null;
const at = (id: string, cmp: (v: number) => boolean) => (r: CanonRow) => {
  const v = num(id, r);
  return v != null && cmp(v);
};
export const LENSES: Lens[] = [
  { id: "short", label: l("short", "короткие"), hint: l("under 150 pages", "меньше 150 страниц"), test: (r) => r.pages < 150 },
  { id: "doorstop", label: l("doorstops", "толстые"), hint: l("over 800 pages", "больше 800 страниц"), test: (r) => r.pages > 800 },
  { id: "funny", label: l("funny", "смешные"), hint: l("humour ≥ 0.5", "юмор ≥ 0,5"), test: at("humor", (v) => v >= 0.5) },
  { id: "bleak", label: l("bleak", "мрачные"), hint: l("light ≤ 0.3", "свет ≤ 0,3"), test: at("light", (v) => v <= 0.3) },
  {
    id: "gripping",
    label: l("page-turners", "не оторваться"),
    hint: l("tension ≥ 0.5 and pace ≥ 0.4", "напряжение ≥ 0,5 и темп ≥ 0,4"),
    test: (r) => (num("tension", r) ?? 0) >= 0.5 && (num("pace", r) ?? 0) >= 0.4,
  },
  { id: "darker", label: l("ends darker", "темнеют к финалу"), hint: l("ending at least 0.15 darker than the opening", "финал темнее начала хотя бы на 0,15"), test: at("turn", (v) => v <= -0.15) },
  { id: "brighter", label: l("ends brighter", "светлеют к финалу"), hint: l("ending at least 0.15 lighter than the opening", "финал светлее начала хотя бы на 0,15"), test: at("turn", (v) => v >= 0.15) },
  { id: "talky", label: l("talky", "разговорные"), hint: l("over half the pages led by dialogue", "больше половины страниц — диалог"), test: at("dialogue", (v) => v > 0.5) },
  { id: "inward", label: l("inward", "внутрь себя"), hint: l("interiority ≥ 0.5", "внутренний мир ≥ 0,5"), test: at("interiority", (v) => v >= 0.5) },
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
  const q = s.q.toLowerCase().replace(/ё/g, "е");
  const lens = LENSES.find((l) => l.id === s.lens);
  const col = column(s.sort)!;
  return rows
    .filter((r) => !q || `${r.title} ${r.titleEn ?? ""} ${r.author} ${r.year ?? ""}`.toLowerCase().replace(/ё/g, "е").includes(q))
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
