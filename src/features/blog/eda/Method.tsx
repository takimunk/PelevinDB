// "How this was counted" box at the end of the post, straight from eda.json's method block.
import { useLang } from "../../../i18n/index.ts";
import { fmtN } from "./charts/kit.tsx";
import type { Eda } from "./data.ts";

export function Method({ eda }: { eda: Eda }) {
  const lang = useLang();
  const m = eda.method;
  const t =
    lang === "ru"
      ? { h: "Как считали", tok: "Токенизация", lem: "Лемматизация", stop: "Стоп-слова", vocab: "Словарь", notes: "Оговорки", gen: "Данные собраны", stopN: "лемм исключено", vocabN: "самых частотных лемм" }
      : { h: "How this was counted", tok: "Tokeniser", lem: "Lemmatiser", stop: "Stopwords", vocab: "Vocabulary", notes: "Caveats", gen: "Data generated", stopN: "lemmas removed", vocabN: "most frequent lemmas" };
  return (
    <aside className="aside method" aria-label={t.h}>
      <p>
        <b>{t.h}</b>
      </p>
      <dl>
        <dt>{t.tok}</dt>
        <dd>{m.tokenizer}</dd>
        <dt>{t.lem}</dt>
        <dd>{m.lemmatizer}</dd>
        <dt>{t.stop}</dt>
        <dd>
          {fmtN(lang, m.stopwords)} {t.stopN}
        </dd>
        <dt>{t.vocab}</dt>
        <dd>
          {fmtN(lang, m.vocabSize)} {t.vocabN}
        </dd>
        {m.notes.length > 0 && (
          <>
            <dt>{t.notes}</dt>
            <dd>
              <ul>
                {m.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </dd>
          </>
        )}
        <dt>{t.gen}</dt>
        <dd>{eda.generated.slice(0, 10)}</dd>
      </dl>
    </aside>
  );
}
