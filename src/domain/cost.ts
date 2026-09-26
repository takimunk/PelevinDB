import type { BookBrief, BookProfile } from "../../shared/types.ts";
import type { Analyses } from "./analysis.ts";

/** Jev 1.13 price per million input tokens; output tokens are free (docs.typesafe.ai/models). */
export const JEV_USD_PER_MTOK = 0.042;

export type Spend = {
  jevRequests: number;
  jevTokens: number;
  jevUsd: number;
  briefTokens: number;
  briefUsd: number;
  totalTokens: number;
  totalUsd: number;
};

/** What a book has cost so far, from the usage every response reported. */
export function spend(analyses: Analyses, profile?: BookProfile, brief?: BookBrief): Spend {
  const jev = [...analyses, profile].filter((a) => a?.usage?.input_tokens);
  const jevTokens = jev.reduce((s, a) => s + a!.usage!.input_tokens!, 0);
  const briefTokens = brief ? brief.usage.prompt_tokens + brief.usage.completion_tokens : 0;
  const jevUsd = (jevTokens / 1e6) * JEV_USD_PER_MTOK;
  const briefUsd = brief?.usage.cost ?? 0;
  return {
    jevRequests: jev.length,
    jevTokens,
    jevUsd,
    briefTokens,
    briefUsd,
    totalTokens: jevTokens + briefTokens,
    totalUsd: jevUsd + briefUsd,
  };
}

export const usd = (v: number) => (v === 0 ? "$0" : v < 0.01 ? `$${v.toFixed(4)}` : `$${v.toFixed(2)}`);
export const tokens = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n));
