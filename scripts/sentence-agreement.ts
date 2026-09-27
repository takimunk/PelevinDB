// Checks the focus request against the sentence request on pages where every sentence was read alone: does the
// sentence focus picks as the peak also score highest when read on its own? Prints one row per dimension.
import { FOCUS, FOCUS_RUBRIC, RUBRIC_VERSION, SENTENCE_RUBRIC, type FocusId } from "../shared/catalog.ts";
import type { SentenceAnalysis } from "../shared/types.ts";
import type { Store } from "../server/store.ts";
import { peakSentence } from "../src/domain/sentences.ts";

/** The sentence-request measure each focus dimension is compared with. */
const measure: Record<FocusId, (a: SentenceAnalysis) => number> = {
  joy: (a) => a.emotion.joy,
  trust: (a) => a.emotion.trust,
  fear: (a) => a.emotion.fear,
  surprise: (a) => a.emotion.surprise,
  sadness: (a) => a.emotion.sadness,
  disgust: (a) => a.emotion.disgust,
  anger: (a) => a.emotion.anger,
  tension: (a) => a.scales.arousal,
  humor: (a) => Math.max(a.scales.irony, a.flags.punchline),
  ideas: (a) => a.scales.abstraction,
  imagery: (a) => a.scales.imagery,
  interiority: (a) => a.act.thought,
  light: (a) => a.scales.valence,
  dark: (a) => 1 - a.scales.valence,
  quotable: (a) => a.flags.aphorism,
};

/** Spearman rank correlation (average ranks for ties). */
function spearman(x: number[], y: number[]) {
  const rank = (v: number[]) => {
    const order = v.map((value, i) => ({ value, i })).sort((a, b) => a.value - b.value);
    const r = new Array<number>(v.length);
    for (let i = 0; i < order.length; ) {
      let j = i;
      while (j + 1 < order.length && order[j + 1].value === order[i].value) j++;
      for (let k = i; k <= j; k++) r[order[k].i] = (i + j) / 2;
      i = j + 1;
    }
    return r;
  };
  const rx = rank(x),
    ry = rank(y);
  const mean = (v: number[]) => v.reduce((s, a) => s + a, 0) / v.length;
  const mx = mean(rx),
    my = mean(ry);
  let num = 0,
    dx = 0,
    dy = 0;
  for (let i = 0; i < x.length; i++) {
    num += (rx[i] - mx) * (ry[i] - my);
    dx += (rx[i] - mx) ** 2;
    dy += (ry[i] - my) ** 2;
  }
  return dx && dy ? num / Math.sqrt(dx * dy) : NaN;
}

export function agreement(store: Store, ids: string[]) {
  type Row = { pages: number; hit: number; chance: number; percentile: number; rho: number; rhoN: number };
  const rows = new Map<FocusId, Row>(FOCUS.map((f) => [f.id, { pages: 0, hit: 0, chance: 0, percentile: 0, rho: 0, rhoN: 0 }]));
  let pagesCompared = 0;
  for (const id of ids) {
    const focus = store.focus(id, FOCUS_RUBRIC);
    const read = store.sentenceAnalyses(id, SENTENCE_RUBRIC);
    const pages = store.analyses(id, RUBRIC_VERSION);
    for (const [page, f] of focus) {
      const alone = Array.from({ length: f.sentences }, (_, i) => read.get(`${page}:${i}`));
      if (alone.some((a) => !a) || f.sentences < 3 || !pages.has(page)) continue;
      pagesCompared++;
      for (const d of FOCUS) {
        const peak = peakSentence(f, d.id);
        if (peak == null) continue;
        const values = alone.map((a) => measure[d.id](a!));
        if (Math.max(...values) - Math.min(...values) < 1e-9) continue;
        const r = rows.get(d.id)!;
        r.pages++;
        const top = Math.max(...values);
        const ties = values.filter((v) => v === top).length;
        r.hit += values[peak] === top ? 1 : 0;
        r.chance += ties / values.length;
        r.percentile += values.filter((v) => v < values[peak]).length / (values.length - 1);
        const rho = spearman(f.focus[d.id], values);
        if (Number.isFinite(rho)) {
          r.rho += rho;
          r.rhoN++;
        }
      }
    }
  }
  console.log(`\nAgreement on ${pagesCompared} pages read sentence by sentence (random: percentile 0.50, rho 0.00)`);
  console.log("dimension      pages  top-1  chance  percentile  rho");
  for (const d of FOCUS) {
    const r = rows.get(d.id)!;
    if (!r.pages) {
      console.log(`${d.id.padEnd(14)} ${"0".padStart(5)}`);
      continue;
    }
    const f = (v: number) => v.toFixed(2).padStart(6);
    console.log(`${d.id.padEnd(14)} ${String(r.pages).padStart(5)} ${f(r.hit / r.pages)} ${f(r.chance / r.pages)} ${f(r.percentile / r.pages).padStart(11)} ${f(r.rhoN ? r.rho / r.rhoN : NaN)}`);
  }
}
