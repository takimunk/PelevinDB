import type { ReactNode } from "react";
import { EMOTIONS, labelOf, THEMES } from "../../../shared/catalog.ts";
import type { BookInsights } from "../../domain/insights.ts";
import { useLang, useT } from "../../i18n/index.ts";
import { num, pageRef, pct } from "./i18n.ts";

const T = {
  en: {
    turn: "turn",
    volatile: "volatile",
    range: "range",
    dialogue: "dialogue",
    themeShift: "theme shift",
    tension: "tension",
    darkens: "the book darkens",
    brightens: "the book brightens",
    light: "light",
    faster: (r: string) => `emotions shift ${r}× faster than the book's average`,
    percentile: "(10th–90th percentile)",
    lead: (k: number, n: number) => `${k} of ${n} emotions lead at least one page`,
    dialogueLeads: (p: string) => `dialogue leads on ${p} of pages`,
    thirds: "from the first to the last third",
    builds: "builds through the book",
    eases: "eases through the book",
    r: "with page position",
    none: "Not enough pages for insights yet.",
  },
  ru: {
    turn: "поворот",
    volatile: "перепады",
    range: "диапазон",
    dialogue: "диалог",
    themeShift: "сдвиг темы",
    tension: "напряжение",
    darkens: "книга темнеет",
    brightens: "книга светлеет",
    light: "свет",
    faster: (r: string) => `эмоции меняются в ${r} раза быстрее, чем в среднем по книге`,
    percentile: "(10–90-й процентиль)",
    lead: (k: number, n: number) => `${k} из ${n} эмоций ведут хотя бы одну страницу`,
    dialogueLeads: (p: string) => `диалог ведёт на ${p} страниц`,
    thirds: "от первой трети к последней",
    builds: "нарастает к концу книги",
    eases: "спадает к концу книги",
    r: "с номером страницы",
    none: "Пока слишком мало страниц для выводов.",
  },
};

/** Short computed findings, one per line; each page reference opens the reader. */
export function InsightList({ insights, pages, onPick }: { insights: BookInsights; pages: number; onPick: (index: number) => void }) {
  const t = useT(T);
  const lang = useLang();
  const { turn, volatile, range, dialogue, themeShift, tension } = insights;
  const at = (index: number, to?: number) => (
    <button className="link-u num" onClick={() => onPick(index)}>
      {pageRef(lang, index + 1, to != null ? to + 1 : undefined)}
    </button>
  );
  const where = (index: number) => <span className="dim">({pct(lang, index / Math.max(1, pages - 1))})</span>;
  const n2 = (v: number) => num(lang, v, 2);
  const items: [string, ReactNode][] = [];
  if (turn)
    items.push([
      t.turn,
      <>
        {at(turn.index)} {where(turn.index)} {turn.after < turn.before ? t.darkens : t.brightens}: {t.light} {n2(turn.before)} → {n2(turn.after)}
      </>,
    ]);
  if (volatile && volatile.ratio >= 1.2)
    items.push([
      t.volatile,
      <>
        {at(volatile.from, volatile.to)} {where(volatile.from)} {t.faster(num(lang, volatile.ratio, 1))}
      </>,
    ]);
  if (range)
    items.push([
      t.range,
      <>
        {t.light} {n2(range.low)}–{n2(range.high)} <span className="dim">{t.percentile}</span> · {t.lead(range.emotions, EMOTIONS.length)}
      </>,
    ]);
  if (dialogue != null) items.push([t.dialogue, <>{t.dialogueLeads(pct(lang, dialogue))}</>]);
  if (themeShift)
    items.push([
      t.themeShift,
      <>
        {labelOf(
          THEMES.find((th) => th.id === themeShift.id)!,
          lang,
        ).toLowerCase()}{" "}
        {pct(lang, themeShift.from)} → {pct(lang, themeShift.to)} <span className="dim">{t.thirds}</span>
      </>,
    ]);
  if (tension != null)
    items.push([
      t.tension,
      <>
        {tension > 0 ? t.builds : t.eases}{" "}
        <span className="dim">
          · r = {n2(tension)} {t.r}
        </span>
      </>,
    ]);
  if (!items.length) return <p className="placeholder">{t.none}</p>;
  return (
    <dl className="insights">
      {items.map(([key, body]) => (
        <div key={key}>
          <dt>{key}</dt>
          <dd>{body}</dd>
        </div>
      ))}
    </dl>
  );
}
