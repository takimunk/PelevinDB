import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { EMOTIONS, ERAS, GENRES, MODES, MOODS, PROFILE_SCALES, SEGMENT_QUESTION_COUNT, TEXTURES, THEMES } from "../../../shared/catalog.ts";
import { ARC_SHAPES, argmax, bookStats, moments, series, storyArc, topEntries } from "../../domain/analysis.ts";
import { spend, tokens, usd } from "../../domain/cost.ts";
import { buildCsv, buildExport } from "../../domain/export.ts";
import { DEFAULT_WEIGHTS, fingerprintValues } from "../../domain/fingerprint.ts";
import { bookInsights, dnaInsights } from "../../domain/insights.ts";
import { neighbours } from "../../domain/pca.ts";
import { firstSentence, READING_CHARS_PER_MINUTE } from "../../domain/text.ts";
import { navigate } from "../../app/router.ts";
import { requestBrief, startAnalysis, stopAnalysis, useBriefJob, useJob } from "../../services/analyzer.ts";
import { useServerStatus } from "../../services/api.ts";
import { useBookView } from "../../storage/books.ts";
import { removeBook, touchBook, useLibrary } from "../../storage/library.ts";
import { bar } from "../../ui/ascii.ts";
import { PixelStrip } from "../../ui/PixelStrip.tsx";
import { fmt, plural } from "../../ui/format.ts";
import { starPath, useCorpus, useEmbedding } from "../map/corpus.ts";
import { meanSource, Radar, radarAxes } from "./charts/Radar.tsx";
import { ArcPlot, Bars, Dna, ModeBars, MoodBars, PulsePlot, Sliders, Spectrogram, ThemeLines } from "./charts/Text.tsx";
import { InsightList } from "./Insights.tsx";
import { QuoteExplorer } from "./QuoteExplorer.tsx";
import { Reader } from "./Reader.tsx";
import "./book.css";

function Panel({ title, note, className = "", children }: { title: string; note?: string; className?: string; children: ReactNode }) {
  return (
    <section className={`panel ${className}`}>
      <header className="panel-head">
        <h3>{title}</h3>
        {note && <p>{note}</p>}
      </header>
      {children}
    </section>
  );
}

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${name.replace(/[^\p{L}\p{N} ._-]/gu, "") || "xbook"}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function BookPage({ id, page }: { id: string; page?: number }) {
  const { meta, content, segments, missing, origin, rank } = useBookView(id);
  const canon = origin === "corpus";
  const { books } = useLibrary();
  const localCopy = canon ? books.find((b) => b.source === "gutenberg" && `pg-${b.sourceRef}` === id) : undefined;
  const job = useJob(id);
  const status = useServerStatus();
  const configured = status?.configured ?? null;
  const briefJob = useBriefJob(id);
  const corpus = useCorpus();
  const embedding = useEmbedding(corpus, DEFAULT_WEIGHTS);
  const [exportOpen, setExportOpen] = useState(false);

  useEffect(() => {
    touchBook(id);
    window.scrollTo({ top: 0 });
  }, [id]);

  const analyses = useMemo(() => content?.analyses ?? [], [content]);
  const stats = useMemo(() => bookStats(segments, analyses), [segments, analyses]);
  const arc = useMemo(() => storyArc(series(analyses, (a) => a.texture.valence)), [analyses]);
  const peaks = useMemo(() => moments(analyses), [analyses]);
  const dna = useMemo(() => dnaInsights(analyses), [analyses]);
  const insights = useMemo(() => bookInsights(analyses), [analyses]);
  const [quoteView, setQuoteView] = useState<"extremes" | "explore">("extremes");
  const similar = useMemo(() => {
    const byId = new Map(corpus.map((s) => [s.id, s]));
    return neighbours(embedding.rows, id, 6).flatMap((n) => (byId.has(n.id) ? [{ ...n, star: byId.get(n.id)! }] : []));
  }, [embedding, corpus, id]);

  const selected = page ? Math.min(segments.length, page) - 1 : null;
  const openPage = useCallback((index: number) => navigate(`/book/${id}?page=${index + 1}`, { replace: page != null }), [id, page]);
  const openAt = (position: number) => openPage(Math.round(position * (segments.length - 1)));
  const move = useCallback(
    (delta: number) => {
      if (selected == null) return;
      const next = Math.max(0, Math.min(segments.length - 1, selected + delta));
      navigate(`/book/${id}?page=${next + 1}`, { replace: true });
    },
    [selected, segments.length, id],
  );
  const closeReader = useCallback(() => navigate(`/book/${id}`, { replace: true }), [id]);

  if (missing)
    return (
      <div className="empty-page">
        <h1>404 · book not found</h1>
        <p>{canon ? "This book is not in the canon corpus, or the server has no corpus database." : "It may have been removed from the library."}</p>
        <button className="btn primary" onClick={() => navigate("/")}>
          cd ~
        </button>
      </div>
    );
  if (!meta || !content) return <div className="loading-page">opening book<span className="cursor" /></div>;

  const running = job?.status === "running";
  const done = running ? job.done : meta.analyzed;
  const coverage = segments.length ? done / segments.length : 0;
  const complete = done === segments.length;
  const hasData = stats.narrative > 0;
  const topMood = MOODS.find((m) => m.id === argmax(stats.mood));
  const topMode = MODES.find((m) => m.id === argmax(stats.mode));
  const topThemes = topEntries(stats.themes, 3).map(([tid]) => THEMES.find((t) => t.id === tid)!.label.toLowerCase());
  const lead = EMOTIONS.find((e) => e.id === argmax(stats.emotions))!;
  const arcLabel = ARC_SHAPES.find((s) => s.id === arc.shape)?.label;
  const minutes = meta.chars / READING_CHARS_PER_MINUTE;
  const source = canon ? `canon${rank ? ` #${rank}` : ""} · project gutenberg` : meta.source === "gutenberg" ? "project gutenberg" : `local file · ${meta.format}`;
  const cost = spend(analyses, content.profile, content.brief);
  const others = corpus.filter((s) => s.id !== id).map((s) => s.fingerprint);
  const brief = content.brief;

  const exportData = (type: "json" | "csv") => {
    const book = { title: meta.title, author: meta.author, format: meta.format, source: meta.source };
    if (type === "json") download(`${meta.title}.json`, JSON.stringify(buildExport(book, segments, analyses, content.profile, meta.fingerprint, brief), null, 2), "application/json");
    else download(`${meta.title}.csv`, buildCsv(segments, analyses), "text/csv;charset=utf-8");
    setExportOpen(false);
  };

  return (
    <div className="book-page">
      <section className="book-hero panel">
        <div className="hero-main">
        <div className="eyebrow">
          {source}
          {canon && <span className="corpus-badge">corpus · read by jev</span>}
        </div>
        <h1 className="book-title">{meta.title}</h1>
        <p className="book-author">{meta.author}</p>
        {hasData ? (
          <p className="book-character">
            <span style={{ color: lead.color }}>{lead.label.toLowerCase()}</span> · <span style={{ color: topMood?.color }}>{topMood?.label.toLowerCase()}</span> ·{" "}
            {topMode?.label.toLowerCase()} · {topThemes.join(", ")}
            {arcLabel && <> · arc: {arcLabel.toLowerCase()}</>}
          </p>
        ) : (
          <p className="book-character dim">character appears once Jev has read the book.</p>
        )}
        <dl className="book-facts">
          <div>
            <dt>pages</dt>
            <dd>{fmt(segments.length)}</dd>
          </div>
          <div>
            <dt>chars</dt>
            <dd>{fmt(meta.chars)}</dd>
          </div>
          <div>
            <dt>reading</dt>
            <dd>{minutes < 90 ? `${Math.round(minutes)} min` : `${Math.round(minutes / 60)} h`}</dd>
          </div>
          <div>
            <dt>jev</dt>
            <dd className="data-badge">
              <span className="ok">{bar(coverage, 12)}</span> {complete ? "complete" : `${Math.round(coverage * 100)}%`}
            </dd>
          </div>
          <div title={`Jev: ${fmt(cost.jevTokens)} input tokens over ${cost.jevRequests} requests at $0.042 per million${cost.briefTokens ? ` · brief: ${fmt(cost.briefTokens)} tokens` : ""}`}>
            <dt>tokens</dt>
            <dd>{tokens(cost.totalTokens)}</dd>
          </div>
          <div title={`Jev ${usd(cost.jevUsd)}${brief ? ` · brief ${usd(cost.briefUsd)}` : ""}`}>
            <dt>cost</dt>
            <dd className="cost">{usd(cost.totalUsd)}</dd>
          </div>
        </dl>
        <div className="book-actions">
          {!canon &&
            !complete &&
            (running ? (
              <button className="btn" onClick={() => stopAnalysis(id)}>
                stop · {done}/{segments.length}
              </button>
            ) : (
              <button className="btn primary" disabled={!configured} onClick={() => void startAnalysis(id)}>
                {done ? "resume" : "analyze"}
              </button>
            ))}
          <button className="btn ghost" onClick={() => navigate(`/map?focus=${id}`)} disabled={!meta.fingerprint}>
            map
          </button>
          <div className="menu-wrap">
            <button className="btn ghost" onClick={() => setExportOpen(!exportOpen)} aria-expanded={exportOpen}>
              export
            </button>
            {exportOpen && (
              <div className="menu">
                <button onClick={() => exportData("json")}>JSON · full dataset</button>
                <button onClick={() => exportData("csv")}>CSV · pages</button>
              </div>
            )}
          </div>
          {canon ? (
            localCopy && (
              <button className="btn ghost" onClick={() => navigate(`/book/${localCopy.id}`)}>
                your copy
              </button>
            )
          ) : (
            <button
              className="btn ghost danger"
              aria-label="Delete book"
              title="Remove from library"
              onClick={() => {
                if (confirm(`Delete “${meta.title}” and all its scores?`)) {
                  stopAnalysis(id);
                  void removeBook(id).then(() => navigate("/library?tab=mine"));
                }
              }}
            >
              rm
            </button>
          )}
        </div>
        {running && (
          <pre className="progress-line" aria-live="polite">
            [{bar(coverage, 40, "#", ".")}] {done}/{segments.length} pages · {SEGMENT_QUESTION_COUNT} questions each
          </pre>
        )}
        {!complete && !running && (
          <p className="analysis-note" role={job?.status === "error" ? "alert" : undefined}>
            {canon
              ? `Read-only canon book: Jev has read ${fmt(done)} of ${fmt(segments.length)} pages so far; npm run corpus continues it.`
              : job?.status === "error"
              ? `[ERR] ${job.error}`
              : configured === false
                ? "Add TYPESAFE_API_KEY to .env and restart the server so Jev can read the book."
                : `Each page is one Jev request with ${SEGMENT_QUESTION_COUNT} independent questions, then one request about the whole book. Text is sent to TypeSafe only after you press analyze.`}
          </p>
        )}
        {meta.fingerprint && (
          <div className="hero-strip">
            <PixelStrip values={fingerprintValues(meta.fingerprint)} size={8} label="fingerprint coordinates" />
          </div>
        )}
        </div>
        {meta.fingerprint && (
          <div className="hero-radar">
            <Radar axes={radarAxes(meta.fingerprint, meanSource(others))} color={lead.color} refLabel={`mean of ${others.length} other ${plural(others.length, "book")}`} />
          </div>
        )}
      </section>

      <Panel title="BRIEF" note={brief ? `written by ${brief.model} from the data below` : "a reader's brief written from everything measured here"} className="span-all brief-panel">
        {brief ? (
          <div className="brief">
            <p className="brief-logline">{brief.logline}</p>
            <p className="brief-what">{brief.what}</p>
            <div className="brief-cols">
              <div>
                <h4>why read it</h4>
                <ul>
                  {brief.why.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h4>who it suits</h4>
                <ul>
                  {brief.who.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            </div>
            <p className="brief-skip">
              <span>skip if</span> {brief.skip}
            </p>
            <p className="brief-foot">
              {fmt(brief.usage.prompt_tokens)} in · {fmt(brief.usage.completion_tokens)} out · {usd(brief.usage.cost)}
              {!canon && status?.brief && (
                <button className="link" onClick={() => void requestBrief(id)} disabled={briefJob?.status === "running"}>
                  {briefJob?.status === "running" ? "rewriting…" : "rewrite"}
                </button>
              )}
            </p>
          </div>
        ) : !hasData || !complete ? (
          <p className="placeholder">[wait] the brief is written once Jev has read the whole book.</p>
        ) : canon ? (
          <p className="placeholder">no brief stored for this canon book yet · npm run corpus writes it.</p>
        ) : status?.brief ? (
          <div className="brief-empty">
            <button className="btn primary" onClick={() => void requestBrief(id)} disabled={briefJob?.status === "running"}>
              {briefJob?.status === "running" ? "writing brief…" : "write brief"}
            </button>
            <span className="dim">sends the measured data and six short quotes to OpenRouter · about $0.01</span>
          </div>
        ) : (
          <p className="placeholder">Add OPENROUTER_API_KEY to .env and restart the server to get a reader's brief.</p>
        )}
        {briefJob?.status === "error" && <p className="analysis-note" role="alert">[ERR] {briefJob.error}</p>}
      </Panel>

      {hasData && peaks.length > 0 && (
        <Panel
          title="QUOTES"
          note={quoteView === "extremes" ? "the most extreme pages, found in code from jev answers · click to read" : "filter every page by a jev answer and rank by any score · click to read"}
          className="span-all"
        >
          <div className="presets quote-views" role="group" aria-label="Quotes view">
            {(["extremes", "explore"] as const).map((v) => (
              <button key={v} className={quoteView === v ? "on" : ""} aria-pressed={quoteView === v} onClick={() => setQuoteView(v)}>
                {v}
              </button>
            ))}
          </div>
          {quoteView === "extremes" ? (
            <ol className="quotes">
              {peaks.map((m) => (
                <li key={m.id}>
                  <button onClick={() => openPage(m.index)} style={{ borderColor: m.color }}>
                    <span className="quote-label" style={{ color: m.color }}>
                      {m.label.toLowerCase()}
                    </span>
                    <q>{firstSentence(segments[m.index].text, 220)}</q>
                    <span className="quote-page">
                      p.{m.index + 1} · {Math.round((m.index / Math.max(1, segments.length - 1)) * 100)}%
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <QuoteExplorer segments={segments} analyses={analyses} onPick={openPage} />
          )}
        </Panel>
      )}

      {hasData && (
        <Panel title="INSIGHTS" note="computed from jev answers · click a page to read" className="span-all">
          <InsightList insights={insights} pages={segments.length} onPick={openPage} />
        </Panel>
      )}

      <Panel title="DNA" note="one column per page range · height = emotional intensity · colour = leading emotion · click to read" className="span-all">
        <Dna analyses={analyses} insights={dna} onPick={openPage} />
      </Panel>

      {hasData ? (
        <>
          <Panel title="SPECTROGRAM" note="plutchik emotions over time · click to read" className="span-all">
            <Spectrogram analyses={analyses} emotions={stats.emotions} onPick={openAt} />
          </Panel>
          <Panel title="PULSE" note="tension, pace, light and interiority · ▲ extreme pages · click to read" className="span-all">
            <PulsePlot analyses={analyses} moments={peaks} onPick={openPage} />
          </Panel>

          <div className="grid three">
            <Panel title="MOOD" note="choice of 11 per page">
              <MoodBars mood={stats.mood} />
            </Panel>
            <Panel title="NARRATION" note="choice of 9 per page">
              <ModeBars mode={stats.mode} />
            </Panel>
            <Panel title="SHAPE" note="light curve vs vonnegut's six arcs">
              <ArcPlot curve={arc.curve} shape={arc.shape} fits={arc.fits} />
            </Panel>
          </div>

          <div className="grid two pair">
            <Panel title="TEXTURE" note="7 bipolar scores · book mean">
              <Sliders items={TEXTURES.map((t) => ({ id: t.id, low: t.low, high: t.high, value: stats.texture[t.id], label: t.label }))} />
            </Panel>
            <Panel title="WHOLE BOOK" note="one extra jev request over six sampled pages">
              {content.profile ? (
                <>
                  <Bars
                    items={topEntries(content.profile.genre, 3).map(([gid, p]) => ({ id: gid, label: GENRES.find((g) => g.id === gid)!.label, value: p, color: "#7dff9a" }))}
                    sort={false}
                  />
                  <p className="profile-era">
                    era: <b>{ERAS.find((e) => e.id === argmax(content.profile!.era))!.label.toLowerCase()}</b>
                  </p>
                  <Sliders items={PROFILE_SCALES.map((s) => ({ id: s.id, low: s.low, high: s.high, value: content.profile!.scales[s.id], label: `confidence ${Math.round(content.profile!.scaleConfidence[s.id] * 100)}%` }))} />
                </>
              ) : (
                <p className="placeholder">[wait] profile appears once Jev finishes every page.</p>
              )}
            </Panel>
          </div>

          <Panel title="THEMES" note="top 10 of 19 · how likely each page is about the theme · click to read" className="span-all">
            <ThemeLines analyses={analyses} themes={stats.themes} onPick={openAt} />
          </Panel>

          <Panel title="NEIGHBOURS" note="nearest fingerprints · cosine similarity" className="span-all">
              {similar.length ? (
                <ul className="neighbours">
                  {similar.map(({ id: nid, similarity, star }) => (
                    <li key={nid}>
                      <button onClick={() => navigate(starPath(star))}>
                        <span className="nb-sim">{String(Math.round(Math.max(0, similarity) * 100)).padStart(3)}</span>
                        <span className="nb-name">
                          <b>{star.title}</b> <small>{star.author}{star.kind === "library" ? "" : star.canon ? " · canon" : " · atlas"}</small>
                        </span>
                        <PixelStrip values={fingerprintValues(star.fingerprint)} size={3} label="coordinates" idle=" " />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="placeholder">{meta.fingerprint ? "no other books with jev data yet · analyse more or run npm run atlas" : "[wait] neighbours appear once the book has a fingerprint."}</p>
              )}
          </Panel>
          {!complete && (
            <p className="coverage-note">
              showing {fmt(done)} {plural(done, "page")} of {fmt(segments.length)} · charts fill in as Jev reads
            </p>
          )}
        </>
      ) : (
        <section className="preview panel">
          <p className="dim">What Jev measures on each page</p>
          <pre>{`emotions   8   Plutchik's wheel, scored
texture    7   pace · tension · interiority · imagery · ideas · humour · light
mood      11   one choice
narration  9   one choice
themes    19   yes or no each
book       1   genre · era · 6 scales, once per book`}</pre>
          <p className="dim">{canon ? "npm run corpus reads this canon book." : "Press analyze to build the dashboard."}</p>
        </section>
      )}

      {selected != null && segments[selected] && (
        <Reader segment={segments[selected]} analysis={analyses[selected] ?? null} total={segments.length} onMove={move} onClose={closeReader} />
      )}
    </div>
  );
}
