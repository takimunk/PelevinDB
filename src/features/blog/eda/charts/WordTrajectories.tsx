// Fig: "Pelevin Ngram" — per-10k frequency of up to five lemmas across the works, by year.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useLang } from "../../../../i18n/index.ts";
import type { Book, EdaFreq, Kind } from "../data.ts";
import { loadFreq, useLoad } from "../data.ts";
import { Chips, Figure, fmtN, KIND_META, KindKey, scale, Seg, smoothByYear, Tip, ticks, title, usePlot, useTip } from "./kit.tsx";
import { KINDS } from "../data.ts";

const COLORS = ["var(--d1)", "var(--d2)", "var(--d3)", "var(--d4)", "var(--d5)"];
const MAX = 5;
const EXAMPLES = ["пустота", "деньга", "вампир", "нейросеть", "мозг", "чекист", "реклама", "гламур", "дискурс", "алгоритм", "будда", "бог", "ум", "сознание"];
const norm = (s: string) => s.trim().toLowerCase().replace(/ё/g, "е");

const T = {
  en: {
    title: "Word trajectories",
    caption:
      "How often a lemma occurs per 10,000 words in each work, plotted by year. Dots are single works; the line is a kernel-smoothed average over neighbouring years. Words are lemmatised Russian, so one lemma covers every form; note that the lemmatiser files деньги under деньга. Short stories are off by default: in a text of a few thousand words one extra mention moves the rate a lot.",
    placeholder: "Type a Russian word…",
    add: "Add word",
    examples: "Examples",
    smooth: "Line",
    smoothOn: "smoothed",
    smoothOff: "work by work",
    kinds: "Forms",
    loading: "Loading word frequencies…",
    error: "Word frequencies are not available right now.",
    none: (n: string) => `No such lemma among the ${n} most frequent.`,
    remove: (w: string) => `Remove ${w}`,
    full: "Five words at most — remove one first.",
    per10k: "per 10k words",
  },
  ru: {
    title: "Траектории слов",
    caption:
      "Сколько раз лемма встречается на 10 000 слов в каждом тексте, по годам. Точки — отдельные произведения, линия — сглаженное среднее по соседним годам. Слова лемматизированы, одна лемма покрывает все формы; «деньги» лемматизатор записывает как «деньга». Рассказы по умолчанию выключены: в тексте на несколько тысяч слов одно лишнее упоминание сильно двигает частоту.",
    placeholder: "Введите слово…",
    add: "Добавить слово",
    examples: "Например",
    smooth: "Линия",
    smoothOn: "сглаженная",
    smoothOff: "по текстам",
    kinds: "Формы",
    loading: "Загружаем частоты слов…",
    error: "Частоты слов сейчас недоступны.",
    none: (n: string) => `Такой леммы нет среди ${n} самых частых.`,
    remove: (w: string) => `Убрать «${w}»`,
    full: "Не больше пяти слов — сначала уберите одно.",
    per10k: "на 10 тыс. слов",
  },
};

type Slot = { word: string; color: number };

export function WordTrajectories({ books, n, initial = ["деньга", "вампир", "нейросеть"] }: { books: Book[]; n: number; initial?: string[] }) {
  const lang = useLang();
  const t = T[lang];
  const holder = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = holder.current;
    if (!el || typeof IntersectionObserver === "undefined") return setNear(true);
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setNear(true), { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const freq = useLoad(loadFreq, near);

  return (
    <div ref={holder} className="eda-fig-holder">
      {freq.state === "ready" ? (
        <Trajectories books={books} n={n} freq={freq.data} initial={initial} />
      ) : (
        <Figure n={n} id="fig-words" title={t.title} caption={t.caption}>
          <div className="eda-placeholder" role="status">
            {freq.state === "error" ? t.error : t.loading}
          </div>
        </Figure>
      )}
    </div>
  );
}

function Trajectories({ books, n, freq, initial }: { books: Book[]; n: number; freq: EdaFreq; initial: string[] }) {
  const lang = useLang();
  const t = T[lang];
  const index = useMemo(() => new Map(freq.vocab.map((w, i) => [norm(w), i])), [freq]);
  const [slots, setSlots] = useState<Slot[]>(() =>
    initial
      .filter((w) => index.has(norm(w)))
      .slice(0, MAX)
      .map((word, i) => ({ word, color: i })),
  );
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const [smooth, setSmooth] = useState<"on" | "off">("on");
  const present = KINDS.filter((k) => books.some((b) => b.kind === k));
  const [kinds, setKinds] = useState<Set<Kind>>(() => new Set(present.filter((k) => k === "novel" || k === "novella")));
  const [note, setNote] = useState("");
  const [ref, width] = usePlot();
  const [tip, setTip] = useTip();
  const [cursor, setCursor] = useState<number | null>(null);
  const listId = useId();

  const suggestions = useMemo(() => {
    const q = norm(query);
    if (!q) return [];
    const starts: string[] = [],
      contains: string[] = [];
    for (const w of freq.vocab) {
      const nw = norm(w);
      if (nw.startsWith(q)) starts.push(w);
      else if (q.length > 2 && nw.includes(q)) contains.push(w);
    }
    const byTotal = (a: string, b: string) => (freq.totals[index.get(norm(b))!] ?? 0) - (freq.totals[index.get(norm(a))!] ?? 0);
    return [...starts.sort(byTotal), ...contains.sort(byTotal)].slice(0, 8);
  }, [query, freq]);

  const add = (raw: string) => {
    const i = index.get(norm(raw));
    if (i === undefined) return setNote(t.none(fmtN(lang, freq.vocab.length)));
    const word = freq.vocab[i];
    if (slots.some((s) => s.word === word)) return (setQuery(""), setOpen(false));
    if (slots.length >= MAX) return setNote(t.full);
    const used = new Set(slots.map((s) => s.color));
    const color = [0, 1, 2, 3, 4].find((c) => !used.has(c))!;
    setSlots([...slots, { word, color }]);
    setQuery("");
    setOpen(false);
    setNote("");
  };
  const remove = (word: string) => (setSlots(slots.filter((s) => s.word !== word)), setNote(""));

  // Works in view, in chronological order (books are pre-sorted by year).
  const rows = books.map((b, i) => ({ b, i })).filter(({ b }) => kinds.has(b.kind));
  const narrow = width < 560;
  const height = Math.round(Math.min(420, Math.max(280, width * 0.55)));
  const m = { l: narrow ? 34 : 46, r: 14, t: 26, b: 30 };
  const years = rows.map((r) => r.b.year);
  const y0 = Math.min(...years) - 0.5,
    y1 = Math.max(...years) + 0.5;
  const X = scale(y0, y1, m.l, width - m.r);
  const series = slots.map((s) => {
    const k = index.get(norm(s.word))!;
    return { ...s, values: rows.map((r) => freq.perBook[r.i][k] ?? 0) };
  });
  const vmax = Math.max(1, ...series.flatMap((s) => s.values));
  const Y = scale(0, vmax * 1.05, height - m.b, m.t);
  const grid = Array.from({ length: 80 }, (_, i) => y0 + 0.5 + ((y1 - y0 - 1) * i) / 79);

  const lines = series.map((s) => {
    if (smooth === "on") {
      const sm = smoothByYear(years, s.values, grid, 2);
      return grid.map((g, i) => `${i ? "L" : "M"}${X(g).toFixed(1)},${Y(sm[i]).toFixed(1)}`).join("");
    }
    return rows.map((r, i) => `${i ? "L" : "M"}${X(r.b.year).toFixed(1)},${Y(s.values[i]).toFixed(1)}`).join("");
  });

  const pick = (px: number) => {
    let best = 0,
      bd = Infinity;
    rows.forEach((r, i) => {
      const d = Math.abs(X(r.b.year) - px);
      if (d < bd) ((bd = d), (best = i));
    });
    return best;
  };
  const show = (i: number) => {
    if (!rows[i]) return;
    setCursor(i);
    const r = rows[i];
    setTip({
      x: X(r.b.year),
      y: m.t + 10,
      content: (
        <>
          <b className="eda-tip-title">{title(r.b, lang)}</b>
          <span className="eda-tip-meta">
            <KindKey kind={r.b.kind} /> {KIND_META[r.b.kind][lang]} · {r.b.year}
          </span>
          <span className="eda-tip-rows">
            {series.map((s) => (
              <span key={s.word}>
                <i className="eda-swatch" style={{ background: COLORS[s.color] }} /> {s.word}: <b>{fmtN(lang, s.values[i], 1)}</b>
              </span>
            ))}
          </span>
        </>
      ),
    });
  };

  return (
    <Figure
      n={n}
      id="fig-words"
      title={t.title}
      caption={t.caption}
      controls={
        <>
          <div className="eda-control eda-combo">
            <label className="eda-control-label" htmlFor={`${listId}-input`}>
              {t.add}
            </label>
            <div className="eda-combo-box">
              <input
                id={`${listId}-input`}
                className="eda-input"
                role="combobox"
                aria-expanded={open && suggestions.length > 0}
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={open && suggestions[active] ? `${listId}-${active}` : undefined}
                placeholder={t.placeholder}
                value={query}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                lang="ru"
                onChange={(e) => (setQuery(e.target.value), setOpen(true), setActive(0), setNote(""))}
                onFocus={() => setOpen(true)}
                onBlur={() => setTimeout(() => setOpen(false), 120)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") (e.preventDefault(), setActive((a) => Math.min(a + 1, suggestions.length - 1)));
                  else if (e.key === "ArrowUp") (e.preventDefault(), setActive((a) => Math.max(a - 1, 0)));
                  else if (e.key === "Enter") (e.preventDefault(), add(suggestions[active] ?? query));
                  else if (e.key === "Escape") setOpen(false);
                }}
              />
              {open && suggestions.length > 0 && (
                <ul className="eda-suggest" role="listbox" id={listId}>
                  {suggestions.map((w, i) => (
                    <li key={w} id={`${listId}-${i}`} role="option" aria-selected={i === active} onPointerDown={(e) => (e.preventDefault(), add(w))}>
                      <span>{w}</span>
                      <span className="eda-suggest-n">{fmtN(lang, freq.totals[index.get(norm(w))!] ?? 0)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div className="eda-control" role="group" aria-label={lang === "ru" ? "Слова на графике" : "Words on the chart"}>
            <span className="eda-control-label">{lang === "ru" ? "На графике" : "Plotted"}</span>
            <div className="eda-chips">
              {slots.map((s) => (
                <button key={s.word} type="button" className="eda-chip word" aria-label={t.remove(s.word)} onClick={() => remove(s.word)}>
                  <i className="eda-swatch" style={{ background: COLORS[s.color] }} /> {s.word} <span aria-hidden="true">×</span>
                </button>
              ))}
            </div>
          </div>
          <div className="eda-control" role="group" aria-label={t.examples}>
            <span className="eda-control-label">{t.examples}</span>
            <div className="eda-chips">
              {EXAMPLES.filter((w) => index.has(norm(w)) && !slots.some((s) => norm(s.word) === norm(w))).map((w) => (
                <button key={w} type="button" className="eda-chip ghost" onClick={() => add(w)}>
                  + {w}
                </button>
              ))}
            </div>
          </div>
          <Seg
            label={t.smooth}
            value={smooth}
            onChange={setSmooth}
            options={[
              { value: "on", label: t.smoothOn },
              { value: "off", label: t.smoothOff },
            ]}
          />
          <Chips
            label={t.kinds}
            options={present}
            value={kinds}
            onChange={setKinds}
            render={(k) => (
              <>
                <KindKey kind={k} /> {KIND_META[k][lang === "ru" ? "ruP" : "enP"]}
              </>
            )}
          />
          {note && (
            <span className="eda-note" role="alert">
              {note}
            </span>
          )}
        </>
      }
      table={
        <table>
          <thead>
            <tr>
              <th>{lang === "ru" ? "Год" : "Year"}</th>
              <th>{lang === "ru" ? "Название" : "Title"}</th>
              {series.map((s) => (
                <th key={s.word} className="num">
                  {s.word}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.b.id}>
                <td>{r.b.year}</td>
                <td>{title(r.b, lang)}</td>
                {series.map((s) => (
                  <td key={s.word} className="num">
                    {fmtN(lang, s.values[i], 1)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <div ref={ref} className="eda-box" onPointerLeave={() => (setTip(null), setCursor(null))}>
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`${t.title}: ${slots.map((s) => s.word).join(", ")}`}
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            show(pick(e.clientX - r.left));
          }}
          onPointerDown={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            show(pick(e.clientX - r.left));
          }}
        >
          {ticks(0, vmax * 1.05, 4).map((v) => (
            <g key={v}>
              <line x1={m.l} x2={width - m.r} y1={Y(v)} y2={Y(v)} className="eda-grid" />
              <text x={m.l - 6} y={Y(v) + 3.5} textAnchor="end" className="eda-tick">
                {fmtN(lang, v, v < 10 && v % 1 ? 1 : 0)}
              </text>
            </g>
          ))}
          {ticks(y0, y1, narrow ? 4 : 8)
            .filter((v) => Number.isInteger(v))
            .map((v) => (
              <text key={v} x={X(v)} y={height - m.b + 16} textAnchor="middle" className="eda-tick">
                {v}
              </text>
            ))}
          <text x={m.l - (narrow ? 28 : 40)} y={12} className="eda-axis-title">
            ↑ {t.per10k}
          </text>
          {cursor !== null && rows[cursor] && <line x1={X(rows[cursor].b.year)} x2={X(rows[cursor].b.year)} y1={m.t} y2={height - m.b} className="eda-cursor" />}
          {series.map((s, k) => (
            <g key={s.word} style={{ color: COLORS[s.color] }}>
              <path d={lines[k]} className="eda-series" />
              {s.values.map((v, i) => (
                <circle key={i} cx={X(rows[i].b.year)} cy={Y(v)} r={cursor === i ? 4.5 : 2.6} className="eda-dot" opacity={smooth === "on" ? 0.55 : 0.9} />
              ))}
            </g>
          ))}
          {/* direct labels at the right end of each line */}
          {!narrow &&
            series
              .map((s) => ({ s, y: Y(smooth === "on" ? smoothByYear(years, s.values, [grid[grid.length - 1]], 2)[0] : s.values[s.values.length - 1]) - 7 }))
              .sort((a, b) => b.y - a.y)
              .map((l, k, all) => {
                l.y = Math.min(l.y, height - m.b - 6);
                if (k) l.y = Math.min(l.y, all[k - 1].y - 13);
                return (
                  <text key={l.s.word} x={width - m.r - 2} y={Math.max(m.t + 10, l.y)} textAnchor="end" className="eda-label halo">
                    {l.s.word}
                  </text>
                );
              })}
        </svg>
        <Tip tip={tip} width={width} />
      </div>
    </Figure>
  );
}
