// Fig. 6: two facts about the jokes. Left: the funniest sentence of a page closes its paragraph more often than
// chance. Right: pages that are at once very funny and very philosophical, by decade.
import { useState } from "react";
import { useLang } from "../../../../i18n/index.ts";
import type { Jev } from "../data.ts";
import {
  Figure,
  pct,
  pval,
  signed,
  useGrow,
  usePlot,
  useTween,
} from "../kit.tsx";

const T = {
  en: {
    title: "Where the joke lands",
    caption: (n: number, b: number) =>
      `Left: on ${n.toLocaleString("en")} story pages where Jev names a funniest sentence, how often that sentence is the last of its paragraph, against the rate expected if it were any sentence of the page; below, the difference per work with its 95% interval over ${b} works. Right: the share of pages that score at least 0.75 on both humour and ideas, averaged over the works of each decade.`,
    closes: "the funniest sentence closes its paragraph",
    chance: "by chance",
    observed: "observed",
    lift: (v: string, lo: string, hi: string) =>
      `+${v} points per work [${lo}, ${hi}]`,
    comic: "very funny and very philosophical at once",
    decade: (d: string) => `${d}s`,
  },
  ru: {
    title: "Куда приходится шутка",
    caption: (n: number, b: number) =>
      `Слева — на ${n.toLocaleString("ru")} страницах прозы, где Jev называет самую смешную фразу, как часто она оказывается последней в абзаце, против доли, ожидаемой, будь это любая фраза страницы; ниже — разница на произведение с 95%-м интервалом по ${b} произведениям. Справа — доля страниц, где и юмор, и идеи не ниже 0,75, в среднем по произведениям каждого десятилетия.`,
    closes: "самая смешная фраза закрывает абзац",
    chance: "случайно",
    observed: "на деле",
    lift: (v: string, lo: string, hi: string) =>
      `+${v} п. п. на произведение [${lo}, ${hi}]`,
    comic: "очень смешно и очень философски одновременно",
    decade: (d: string) => `${d}-е`,
  },
};

export function Joke({ jev, n }: { jev: Jev; n: number }) {
  const lang = useLang();
  const t = T[lang];
  const p = jev.sentences.punchline;
  const [ref, width] = usePlot();
  const [hot, setHot] = useState<string | null>(null);
  const narrow = width < 640;
  const w = narrow ? width : Math.floor((width - 32) / 2);
  const decades = Object.entries(jev.comic.decades);
  const maxC = Math.max(...decades.map(([, v]) => v)) * 1.15;
  const g = useTween(
    useGrow([p.expected, p.observed, ...decades.map(([, v]) => v)]),
    1100,
  );
  const pts = (v: number) => (v * 100).toFixed(1);

  return (
    <Figure n={n} title={t.title} caption={t.caption(p.n, p.books)}>
      <div ref={ref} className={`jv-joke ${narrow ? "narrow" : ""}`}>
        <div style={{ width: w }}>
          <p className="jv-panel-head">{t.closes}</p>
          {(
            [
              ["chance", g[0], "var(--faint)"],
              ["observed", g[1], "var(--d4)"],
            ] as const
          ).map(([k, v, c]) => (
            <div key={k} className="jv-hbar">
              <span className="jv-hbar-label">{t[k]}</span>
              <span className="jv-hbar-track">
                <i style={{ width: `${v * 100}%`, background: c }} />
              </span>
              <b className="num">{pct(lang, v, 0)}</b>
            </div>
          ))}
          <p className="jv-note num">
            {t.lift(pts(p.bookLift[0]), pts(p.bookLift[1]), pts(p.bookLift[2]))}
          </p>
        </div>
        <div style={{ width: w }}>
          <p className="jv-panel-head">
            {t.comic} · ρ = {signed(lang, jev.comic.rho)} ·{" "}
            {pval(lang, jev.comic.p)}
          </p>
          <div className="jv-cols">
            {decades.map(([d, v], i) => (
              <span
                key={d}
                className={hot && hot !== d ? "faded" : ""}
                onMouseEnter={() => setHot(d)}
                onMouseLeave={() => setHot(null)}
              >
                <b className="num">{pct(lang, v, 1)}</b>
                <i style={{ height: `${(g[2 + i] / maxC) * 100}%` }} />
                <em>{t.decade(d)}</em>
              </span>
            ))}
          </div>
        </div>
      </div>
    </Figure>
  );
}
