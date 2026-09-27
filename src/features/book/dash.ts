// Dashboard filter and sort state, kept in the URL query next to `page` so a view can be shared:
// #/book/pv-omon-ra?range=0-33&emo=fear,anger&hl=mood:grim&smooth=0&rel=1&qs=page&ns=year&ts=appearance&xs=diff
import { useCallback, useSyncExternalStore } from "react";
import { EMOTIONS, MODES, MOODS, type EmotionId } from "../../../shared/catalog.ts";
import { navigate } from "../../app/router.ts";

export type DashState = {
  /** Part of the book the dashboard looks at, in percent of pages. */
  range: [number, number];
  /** Emotions shown in the ridgelines; empty means all. */
  emo: EmotionId[];
  /** Pages to highlight across cells: "mood:<id>" or "mode:<id>". */
  hl: string | null;
  smooth: boolean;
  /** Texture and whole-book scales relative to the corpus mean instead of absolute. */
  rel: boolean;
  qs: "score" | "page";
  ns: "similarity" | "year";
  ts: "strength" | "appearance";
  xs: "value" | "diff";
};

export const DEFAULT_DASH: DashState = { range: [0, 100], emo: [], hl: null, smooth: true, rel: false, qs: "score", ns: "similarity", ts: "strength", xs: "value" };

const pick = <T extends string>(v: string | null, allowed: readonly T[], fallback: T): T => (v && (allowed as readonly string[]).includes(v) ? (v as T) : fallback);
const HIGHLIGHTS = new Set([...MOODS.map((m) => `mood:${m.id}`), ...MODES.map((m) => `mode:${m.id}`)]);

export function parseDash(query: string): DashState {
  const p = new URLSearchParams(query);
  const r = /^(\d{1,3})-(\d{1,3})$/.exec(p.get("range") ?? "");
  let range: [number, number] = r ? [Math.min(100, Number(r[1])), Math.min(100, Number(r[2]))] : [0, 100];
  if (range[1] - range[0] < 1) range = [0, 100];
  const ids = EMOTIONS.map((e) => e.id);
  return {
    range,
    emo: (p.get("emo") ?? "").split(",").filter((e): e is EmotionId => (ids as string[]).includes(e)),
    hl: HIGHLIGHTS.has(p.get("hl") ?? "") ? p.get("hl") : null,
    smooth: p.get("smooth") !== "0",
    rel: p.get("rel") === "1",
    qs: pick(p.get("qs"), ["score", "page"] as const, "score"),
    ns: pick(p.get("ns"), ["similarity", "year"] as const, "similarity"),
    ts: pick(p.get("ts"), ["strength", "appearance"] as const, "strength"),
    xs: pick(p.get("xs"), ["value", "diff"] as const, "value"),
  };
}

/** Only non-default values go into the query. */
export function dashQuery(s: DashState): URLSearchParams {
  const p = new URLSearchParams();
  if (s.range[0] !== 0 || s.range[1] !== 100) p.set("range", `${s.range[0]}-${s.range[1]}`);
  if (s.emo.length) p.set("emo", s.emo.join(","));
  if (s.hl) p.set("hl", s.hl);
  if (!s.smooth) p.set("smooth", "0");
  if (s.rel) p.set("rel", "1");
  for (const k of ["qs", "ns", "ts", "xs"] as const) if (s[k] !== DEFAULT_DASH[k]) p.set(k, s[k]);
  return p;
}

const subscribe = (l: () => void) => {
  window.addEventListener("hashchange", l);
  return () => window.removeEventListener("hashchange", l);
};
const query = () => location.hash.split("?")[1] ?? "";

/** Dashboard state from the URL, a setter that keeps the open page, and a path builder that keeps the filters. */
export function useDash(id: string) {
  const q = useSyncExternalStore(subscribe, query, () => "");
  const state = parseDash(q);
  const path = useCallback(
    (page: number | null, next: DashState = parseDash(query())) => {
      const p = dashQuery(next);
      if (page != null) p.set("page", String(page));
      const qs = p.toString();
      return `/book/${id}${qs ? `?${qs}` : ""}`;
    },
    [id],
  );
  const set = useCallback(
    (patch: Partial<DashState>) => {
      const page = Number(new URLSearchParams(query()).get("page")) || null;
      navigate(path(page, { ...parseDash(query()), ...patch }), { replace: true });
    },
    [path],
  );
  return { state, key: q, set, path };
}
