// Schema and loaders for the EDA post's data (public/blog/eda.json, public/blog/eda-freq.json).
// Production only ever shows real data. In dev, when the files are missing, a generated mock stands in
// so the charts can be worked on; `import.meta.env.DEV` is false in builds, so the mock is never bundled.
import { useEffect, useState } from "react";

export type Kind = "novel" | "novella" | "story" | "essay" | "interview";
export const KINDS: Kind[] = ["novel", "novella", "story", "essay", "interview"];

export interface Book {
  id: string;
  title: string;
  titleEn: string;
  year: number;
  kind: Kind;
  words: number;
  sentences: number;
  lemmas: number;
  mattr: number;
  sentenceLen: number;
  sentenceLenP90: number;
  wordLen: number;
  dialogueShare: number;
  questionShare: number;
  exclaimShare: number;
  hapaxShare: number;
  pronounI: number;
  pronounWe: number;
}

export interface Field {
  key: string;
  en: string;
  ru: string;
  lemmas: string[];
  /** lemmas of the list that occur at least once */
  used?: number;
  perBook: number[];
}

export interface Eda {
  version: number;
  generated: string;
  method: { tokenizer: string; lemmatizer: string; stopwords: number; vocabSize: number; notes: string[] };
  books: Book[];
  distinctive: Record<string, [string, number][]>;
  /** the same without personal names */
  distinctiveCommon?: Record<string, [string, number][]>;
  fields: Field[];
  map: { lsa: [number, number][]; tsne?: [number, number][]; components: { positive: string[]; negative: string[]; explained?: number }[] };
  similarity: number[][];
  topics: { id: string | number; en?: string; ru?: string; terms: string[]; perBook: number[] }[];
}

export interface EdaFreq {
  vocab: string[];
  perBook: number[][];
  totals: number[];
}

export type Load<T> = { state: "loading" } | { state: "ready"; data: T; mock: boolean } | { state: "error" };

async function fetchJson<T>(url: string, valid: (x: unknown) => boolean): Promise<T> {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  // The dev server answers unknown paths with index.html, so a 200 is not proof of JSON.
  const text = await res.text();
  const json = JSON.parse(text) as unknown;
  if (!valid(json)) throw new Error(`${url}: unexpected shape`);
  return json as T;
}

const isEda = (x: unknown) => !!x && typeof x === "object" && Array.isArray((x as Eda).books) && Array.isArray((x as Eda).fields);
const isFreq = (x: unknown) => !!x && typeof x === "object" && Array.isArray((x as EdaFreq).vocab) && Array.isArray((x as EdaFreq).perBook);

const cache = new Map<string, Promise<{ data: unknown; mock: boolean }>>();

function load<T>(url: string, valid: (x: unknown) => boolean, mock?: () => Promise<T>) {
  let p = cache.get(url);
  if (!p) {
    p = fetchJson<T>(url, valid)
      .then((data) => ({ data: data as unknown, mock: false }))
      .catch(async (error) => {
        if (import.meta.env.DEV && mock) {
          console.warn(`[blog] ${url} unavailable, using the dev mock`, error);
          return { data: (await mock()) as unknown, mock: true };
        }
        cache.delete(url);
        throw error;
      });
    cache.set(url, p);
  }
  return p as Promise<{ data: T; mock: boolean }>;
}

export const loadEda = () => load<Eda>("/blog/eda.json", isEda, import.meta.env.DEV ? async () => (await import("./mock.ts")).mockEda() : undefined);
export const loadFreq = () => load<EdaFreq>("/blog/eda-freq.json", isFreq, import.meta.env.DEV ? async () => (await import("./mock.ts")).mockFreq() : undefined);

export function useLoad<T>(loader: () => Promise<{ data: T; mock: boolean }>, enabled = true): Load<T> {
  const [state, setState] = useState<Load<T>>({ state: "loading" });
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    loader().then(
      (r) => alive && setState({ state: "ready", data: r.data, mock: r.mock }),
      () => alive && setState({ state: "error" }),
    );
    return () => {
      alive = false;
    };
  }, [enabled]);
  return state;
}
