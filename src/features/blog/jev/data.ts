// Schema, loader and labels for "From image to idea" (public/blog/jev.json, built by scripts/jev-blog.py).
import { useEffect, useState } from "react";
import {
  EMOTIONS,
  labelOf,
  MODES,
  MOODS,
  TEXTURES,
  THEMES,
  type CatalogLang,
} from "../../../../shared/catalog.ts";

export type Kind = "novel" | "novella" | "story";
/** A sentence of the corpus: book, 1-based page and sentence on it, and the sentence itself. */
export type Ref = {
  id: string;
  page: number;
  s: number;
  text: string;
  year?: number;
};
export type Trend = {
  key: string;
  rho: number;
  p: number;
  q: number;
  ci: [number, number];
  loo: [number, number];
};
export type RateTrend = {
  rho: number;
  p: number;
  ci: [number, number];
  first: number;
  last: number;
};

export interface Work {
  id: string;
  title: string;
  titleEn: string;
  year: number;
  kind: Kind;
  pages: number;
  /** Mean of every dimension over the work's story pages, in `keys` order. */
  v: number[];
  comic: number;
  sampled?: number;
  comment?: number;
  aphorism?: number;
  abstraction?: number;
  profile?: Record<string, number>;
}

export interface Jev {
  version: number;
  generated: string;
  keys: string[];
  scores: string[];
  works: Work[];
  novels: string[];
  trends: { novels: Trend[]; fiction: Trend[] };
  robust: Record<string, { narrationOnly: number }>;
  coupling: number[][];
  arcs: {
    bins: number;
    dims: Record<
      string,
      {
        mean: number[];
        lo: number[];
        hi: number[];
        perBook: number[][];
        ending: [number, number, number];
        endingUp: number;
      }
    >;
    climax: number[];
  };
  comic: {
    rho: number;
    p: number;
    decades: Record<string, number>;
    examples: Ref[];
  };
  pair: { image: Ref; idea: Ref };
  sentences: {
    sample: number;
    rate: number;
    books: number;
    comment: RateTrend;
    aphorism: RateTrend;
    abstraction: RateTrend;
    voices: {
      act: string;
      n: number;
      aphorism: [number, number, number];
      irony: number;
      illusion: number;
    }[];
    maxims: Ref[];
    punchline: {
      n: number;
      observed: number;
      expected: number;
      bookLift: [number, number, number];
      books: number;
    };
  };
  profile: Record<string, { rho: number; p: number }>;
  corpus: {
    works: number;
    novels: number;
    pages: number;
    allPages: number;
    sentences: number;
    sentenceReads: number;
    focusPages: number;
  };
}

let cache: Promise<Jev> | null = null;
const load = () =>
  (cache ??= fetch("/blog/jev.json", { cache: "no-cache" })
    .then(async (r) => {
      if (!r.ok) throw new Error(String(r.status));
      const data = JSON.parse(await r.text()) as Jev;
      if (!Array.isArray(data.works) || !data.trends)
        throw new Error("unexpected shape");
      return data;
    })
    .catch((e) => {
      cache = null;
      throw e;
    }));

export function useJev() {
  const [state, setState] = useState<{ data?: Jev; error?: boolean }>({});
  useEffect(() => {
    let alive = true;
    load().then(
      (data) => alive && setState({ data }),
      () => alive && setState({ error: true }),
    );
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

// ───────── labels and colours ─────────

export type Group = "emotion" | "texture" | "theme" | "mood" | "mode";
export const GROUPS: Group[] = ["emotion", "texture", "theme", "mood", "mode"];
export const GROUP_LABEL: Record<Group, { en: string; ru: string }> = {
  emotion: { en: "emotions", ru: "эмоции" },
  texture: { en: "texture", ru: "фактура" },
  theme: { en: "themes", ru: "темы" },
  mood: { en: "mood", ru: "настроение" },
  mode: { en: "narration", ru: "повествование" },
};
/** Group colours for marks: emotions keep their own colours. */
export const GROUP_COLOR: Record<Group, string> = {
  emotion: "var(--d2)",
  texture: "var(--d1)",
  theme: "var(--d3)",
  mood: "var(--d5)",
  mode: "var(--d4)",
};

const LISTS: Record<
  Group,
  readonly { id: string; label: string; ru?: string; color?: string }[]
> = {
  emotion: EMOTIONS,
  texture: TEXTURES,
  theme: THEMES,
  mood: MOODS,
  mode: MODES,
};

export const groupOf = (key: string) => key.split(":")[0] as Group;
export function dimLabel(key: string, lang: CatalogLang) {
  const [g, id] = key.split(":") as [Group, string];
  const item = LISTS[g].find((x) => x.id === id);
  return item ? labelOf(item, lang).toLowerCase() : id;
}
export function dimColor(key: string) {
  const [g, id] = key.split(":") as [Group, string];
  if (g === "emotion")
    return EMOTIONS.find((e) => e.id === id)?.color ?? GROUP_COLOR.emotion;
  if (key === "texture:imagery") return "var(--d3)";
  if (key === "texture:ideas") return "var(--d5)";
  return GROUP_COLOR[g];
}

export const KIND_LABEL: Record<Kind, { en: string; ru: string }> = {
  novel: { en: "novel", ru: "роман" },
  novella: { en: "novella", ru: "повесть" },
  story: { en: "story", ru: "рассказ" },
};
export const workTitle = (
  w: Pick<Work, "title" | "titleEn">,
  lang: CatalogLang,
) => (lang === "ru" ? w.title : w.titleEn || w.title);
export const readerHref = (r: Pick<Ref, "id" | "page" | "s">) =>
  `#/book/${r.id}?page=${r.page}&s=${r.s}`;
