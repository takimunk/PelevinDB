// Fig: NMF topics as term lists with a per-work share strip; pick a topic to rank the works that carry it.
import { useState } from "react";
import { useLang } from "../../../../i18n/index.ts";
import type { Book, Eda } from "../data.ts";
import { Figure, fmtN, KIND_META, KindKey, scale, Tip, title, usePlot, useTip, yearMarks } from "./kit.tsx";

const T = {
  en: {
    title: "Topics",
    caption:
      "Non-negative matrix factorisation splits the word counts of ~2,000-word chunks into topics — bundles of words that tend to occur together — and gives every work a share of each. The model finds the word lists; the short names are ours. The strips show each topic’s share across the works in order of publication. Choose a topic to see where it lives.",
    topic: "Topic",
    carriers: "Works where this topic is strongest",
    share: "share",
  },
  ru: {
    title: "Темы",
    caption:
      "Неотрицательное матричное разложение делит частоты слов в кусках по ~2000 слов на темы — связки слов, которые встречаются вместе, — и приписывает каждому тексту долю каждой темы. Списки слов нашла модель, короткие названия дали мы. Полоски показывают долю темы по текстам в порядке публикации. Выберите тему, чтобы увидеть, где она живёт.",
    topic: "Тема",
    carriers: "Где эта тема сильнее всего",
    share: "доля",
  },
};

export function Topics({ books, topics, n }: { books: Book[]; topics: Eda["topics"]; n: number }) {
  const lang = useLang();
  const t = T[lang];
  const [sel, setSel] = useState(0);
  const topic = topics[sel];
  const top = topic
    ? books
        .map((b, i) => ({ b, v: topic.perBook[i] }))
        .sort((a, b) => b.v - a.v)
        .slice(0, 6)
    : [];

  return (
    <Figure
      n={n}
      id="fig-topics"
      title={t.title}
      caption={t.caption}
      table={
        <table>
          <thead>
            <tr>
              <th>{t.topic}</th>
              <th>{lang === "ru" ? "Слова" : "Terms"}</th>
            </tr>
          </thead>
          <tbody>
            {topics.map((tp, k) => (
              <tr key={String(tp.id)}>
                <td>{k + 1}</td>
                <td lang="ru">{tp.terms.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <div className="eda-topics" role="group" aria-label={t.topic}>
        {topics.map((tp, k) => (
          <button key={String(tp.id)} type="button" aria-pressed={k === sel} className={`eda-topic${k === sel ? " on" : ""}`} onClick={() => setSel(k)}>
            <span className="eda-topic-n">{String(k + 1).padStart(2, "0")}</span>
            <span className="eda-topic-body">
              {tp[lang] && <span className="eda-topic-name">{tp[lang]}</span>}
              <span className="eda-topic-terms" lang="ru">
                {tp.terms.slice(0, 6).join(" · ")}
              </span>
            </span>
            <Strip values={tp.perBook} on={k === sel} />
          </button>
        ))}
      </div>
      {topic && <TopicDetail books={books} values={topic.perBook} terms={topic.terms} name={topic[lang]} k={sel} top={top} />}
    </Figure>
  );
}

function Strip({ values, on }: { values: number[]; on: boolean }) {
  const max = Math.max(1e-9, ...values);
  return (
    <svg className="eda-strip" viewBox={`0 0 ${values.length} 10`} preserveAspectRatio="none" aria-hidden="true">
      {values.map((v, i) => (
        <rect key={i} x={i + 0.1} y={10 - (v / max) * 10} width={0.8} height={(v / max) * 10} style={{ fill: on ? "var(--d1)" : "var(--ink)", opacity: on ? 0.9 : 0.45 }} />
      ))}
    </svg>
  );
}

function TopicDetail({ books, values, terms, name, k, top }: { books: Book[]; values: number[]; terms: string[]; name?: string; k: number; top: { b: Book; v: number }[] }) {
  const lang = useLang();
  const t = T[lang];
  const [ref, width] = usePlot(160);
  const [tip, setTip] = useTip();
  const height = 150;
  const m = { l: 8, r: 8, t: 10, b: 24 };
  const max = Math.max(1e-9, ...values);
  const X = scale(0, books.length, m.l, width - m.r);
  const Y = scale(0, max, height - m.b, m.t);
  const bw = (width - m.l - m.r) / books.length;
  const decade = yearMarks(books, X, 36);

  return (
    <div className="eda-topic-detail">
      <p className="eda-panel-k">
        {t.topic} {k + 1}
        {name ? ` · ${name}` : ""}
      </p>
      <p className="eda-lemmas" lang="ru">
        {terms.join(" · ")}
      </p>
      <div ref={ref} className="eda-box" onPointerLeave={() => setTip(null)}>
        <svg width={width} height={height} role="img" aria-label={`${t.topic} ${k + 1}`}>
          <line x1={m.l} x2={width - m.r} y1={height - m.b} y2={height - m.b} className="eda-lane" />
          {values.map((v, i) => {
            const b = books[i];
            const show = () =>
              setTip({
                x: X(i) + bw / 2,
                y: Y(v),
                content: (
                  <>
                    <b className="eda-tip-title">{title(b, lang)}</b>
                    <span className="eda-tip-meta">
                      <KindKey kind={b.kind} /> {KIND_META[b.kind][lang]} · {b.year}
                    </span>
                    <span className="eda-tip-rows">
                      <span>
                        {t.share}: <b>{fmtN(lang, v * 100, 1)}%</b>
                      </span>
                    </span>
                  </>
                ),
              });
            return (
              <g key={b.id} onPointerEnter={show} onPointerDown={show}>
                <rect x={X(i)} y={m.t} width={bw} height={height - m.t - m.b} fill="transparent" />
                <rect x={X(i) + bw * 0.15} y={Y(v)} width={Math.max(1, bw * 0.7)} height={Math.max(0, height - m.b - Y(v))} rx={Math.min(2, bw * 0.3)} style={{ fill: "var(--d1)", opacity: 0.85 }} />
              </g>
            );
          })}
          {decade.map(({ b, i }) => (
            <text key={b.id} x={X(i)} y={height - m.b + 15} className="eda-tick">
              {b.year}
            </text>
          ))}
        </svg>
        <Tip tip={tip} width={width} />
      </div>
      <p className="eda-panel-k">{t.carriers}</p>
      <ol className="eda-toplist">
        {top.map((x) => (
          <li key={x.b.id}>
            <span>
              <KindKey kind={x.b.kind} /> {title(x.b, lang)} <span className="eda-dim">{x.b.year}</span>
            </span>
            <span className="eda-num">{fmtN(lang, x.v * 100, 0)}%</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
