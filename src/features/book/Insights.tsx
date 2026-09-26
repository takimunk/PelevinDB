import type { ReactNode } from "react";
import { EMOTIONS, THEMES } from "../../../shared/catalog.ts";
import type { BookInsights } from "../../domain/insights.ts";

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Short computed findings, one per line; each page reference opens the reader. */
export function InsightList({ insights, pages, onPick }: { insights: BookInsights; pages: number; onPick: (index: number) => void }) {
  const { turn, volatile, range, dialogue, themeShift, tension } = insights;
  const at = (index: number, to?: number) => (
    <button className="link" onClick={() => onPick(index)}>
      p.{index + 1}
      {to != null && to !== index ? `–${to + 1}` : ""}
    </button>
  );
  const where = (index: number) => <span className="dim">({pct(index / Math.max(1, pages - 1))})</span>;
  const items: [string, ReactNode][] = [];
  if (turn)
    items.push([
      "turn",
      <>
        {at(turn.index)} {where(turn.index)} the book {turn.after < turn.before ? "darkens" : "brightens"}: light {turn.before.toFixed(2)} → {turn.after.toFixed(2)}
      </>,
    ]);
  if (volatile && volatile.ratio >= 1.2)
    items.push([
      "volatile",
      <>
        {at(volatile.from, volatile.to)} {where(volatile.from)} emotions shift {volatile.ratio.toFixed(1)}× faster than the book's average
      </>,
    ]);
  if (range)
    items.push([
      "range",
      <>
        light {range.low.toFixed(2)}–{range.high.toFixed(2)} <span className="dim">(10th–90th percentile)</span> · {range.emotions} of {EMOTIONS.length} emotions lead at least one page
      </>,
    ]);
  if (dialogue != null) items.push(["dialogue", <>dialogue leads on {pct(dialogue)} of pages</>]);
  if (themeShift)
    items.push([
      "theme shift",
      <>
        {THEMES.find((t) => t.id === themeShift.id)!.label.toLowerCase()} {pct(themeShift.from)} → {pct(themeShift.to)} <span className="dim">from the first to the last third</span>
      </>,
    ]);
  if (tension != null)
    items.push([
      "tension",
      <>
        {tension > 0 ? "builds" : "eases"} through the book <span className="dim">· r = {tension.toFixed(2)} with page position</span>
      </>,
    ]);
  if (!items.length) return <p className="placeholder">not enough pages for insights yet.</p>;
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
