import { lazy, Suspense, useMemo, type ReactNode } from "react";
import { EMOTIONS, GENRES, MODES, MOODS, PROFILE_SCALES, SEGMENT_QUESTION_COUNT, TEXTURES, THEMES } from "../../../shared/catalog.ts";
import type { CorpusStats, PageRef } from "../../../shared/types.ts";
import { openFilePicker } from "../../app/importer.ts";
import { href, navigate } from "../../app/router.ts";
import { canonFindings, type CanonBook, type Findings, type Pair } from "../../domain/canon.ts";
import { JEV_USD_PER_MTOK, tokens, usd } from "../../domain/cost.ts";
import { ACTS, ALL_FEATURES } from "../../domain/fingerprint.ts";
import { useCanonShelf, useCorpusStats } from "../../storage/corpus.ts";
import { BLOCKS } from "../../ui/ascii.ts";
import { fmt } from "../../ui/format.ts";
import { Search } from "../search/Search.tsx";
import "./home.css";

const FractalField = lazy(() => import("../../ui/FractalField.tsx").then((m) => ({ default: m.FractalField })));

const LOGO = String.raw`██╗  ██╗██████╗  ██████╗  ██████╗ ██╗  ██╗
╚██╗██╔╝██╔══██╗██╔═══██╗██╔═══██╗██║ ██╔╝
 ╚███╔╝ ██████╔╝██║   ██║██║   ██║█████╔╝
 ██╔██╗ ██╔══██╗██║   ██║██║   ██║██╔═██╗
██╔╝ ██╗██████╔╝╚██████╔╝╚██████╔╝██║  ██╗
╚═╝  ╚═╝╚═════╝  ╚═════╝  ╚═════╝ ╚═╝  ╚═╝`;

const PAGE_VALUES = EMOTIONS.length + TEXTURES.length + MOODS.length + MODES.length + THEMES.length;
const PROFILE_QUESTIONS = 2 + PROFILE_SCALES.length;

const DIMENSIONS = [
  { name: "emotions", n: EMOTIONS.length, how: "score", items: EMOTIONS.map((e) => e.label) },
  { name: "texture", n: TEXTURES.length, how: "score", items: TEXTURES.map((t) => t.label) },
  { name: "mood", n: MOODS.length, how: "choice", items: MOODS.map((m) => m.label) },
  { name: "narration", n: MODES.length, how: "choice", items: MODES.map((m) => m.label) },
  { name: "themes", n: THEMES.length, how: "yes / no", items: THEMES.map((t) => t.label) },
  { name: "whole book", n: PROFILE_QUESTIONS, how: "once", items: ["Genre", "Era", ...PROFILE_SCALES.map((s) => s.label)] },
];

const pct = (v: number) => `${Math.round(v * 100)}%`;
const r2 = (v: number) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(2);
const spark = (values: number[]) => {
  const lo = Math.min(...values),
    hi = Math.max(...values);
  return values.map((v) => BLOCKS[1 + Math.round(((v - lo) / (hi - lo || 1)) * (BLOCKS.length - 2))]).join("");
};
const minutes = (s: number) => (s >= 3600 ? `${(s / 3600).toFixed(1)} h` : `${Math.max(1, Math.round(s / 60))} min`);

const Book = ({ b }: { b: Pick<CanonBook, "id" | "title"> }) => <a href={href(`/book/${b.id}`)}>{b.title}</a>;
const PageLink = ({ p }: { p: PageRef }) => (
  <a href={href(`/book/${p.id}?page=${p.page}`)}>
    {p.title}, p.&nbsp;{p.page}
  </a>
);
const PairLine = ({ p }: { p: Pair }) => (
  <li>
    <em>{pct(Math.max(0, p.similarity))}</em> <Book b={p.a} /> <span className="dim">·</span> <Book b={p.b} />
  </li>
);

function Card({ figure, title, children, wide }: { figure: ReactNode; title: string; children: ReactNode; wide?: boolean }) {
  return (
    <article className={`finding ${wide ? "wide" : ""}`}>
      <div className="finding-figure">{figure}</div>
      <h3>{title}</h3>
      <div className="finding-body">{children}</div>
    </article>
  );
}

function Totals({ stats }: { stats: CorpusStats }) {
  const jevUsd = (stats.jev.tokens / 1e6) * JEV_USD_PER_MTOK;
  const answers = stats.analysed * SEGMENT_QUESTION_COUNT + stats.profiled * PROFILE_QUESTIONS;
  const cells = [
    ["books", fmt(stats.books), `${stats.complete} read cover to cover`],
    ["pages", fmt(stats.pages), `${fmt(stats.narrative)} of them story, the rest contents and licences`],
    ["characters", `${(stats.chars / 1e6).toFixed(1)}M`, `${fmt(stats.chars / Math.max(1, stats.books))} per book on average`],
    ["Jev requests", fmt(stats.jev.requests), `one per page plus one per book · ${stats.jev.model ?? "jev"}`],
    ["answers", `${(answers / 1e6).toFixed(2)}M`, `${SEGMENT_QUESTION_COUNT} questions per page, ${PROFILE_QUESTIONS} per book`],
    ["page vectors", fmt(stats.analysed), `${PAGE_VALUES} values each`],
    ["book embeddings", fmt(stats.profiled), `${ALL_FEATURES.length} named dimensions each`],
    ["tokens", tokens(stats.jev.tokens + stats.briefs.tokens), `${tokens(stats.jev.tokens)} Jev · ${tokens(stats.briefs.tokens)} briefs`],
    ["cost", usd(jevUsd + stats.briefs.usd), `${usd(jevUsd)} Jev at $${JEV_USD_PER_MTOK}/M · ${usd(stats.briefs.usd)} for ${stats.briefs.count} briefs`],
    ["wall time", minutes(stats.seconds), stats.seconds ? `${fmt(stats.analysed / (stats.seconds / 60))} pages a minute` : "no finished runs recorded"],
  ];
  return (
    <dl className="totals">
      {cells.map(([k, v, note]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
          <small>{note}</small>
        </div>
      ))}
    </dl>
  );
}

function PageFindings({ stats }: { stats: CorpusStats }) {
  const lead = EMOTIONS.map((e) => ({ ...e, n: stats.leading[e.id] })).sort((a, b) => b.n - a.n);
  const top = lead[0];
  const joy = stats.leading.joy;
  const light = stats.lightByTenth;
  const tension = stats.tensionByTenth;
  const darkest = light.indexOf(Math.min(...light));
  const tensest = tension.indexOf(Math.max(...tension));
  const lastTenth = stats.climaxByTenth.at(-1)!;
  const climaxes = stats.climaxByTenth.reduce((s, v) => s + v, 0);
  const r = stats.records;
  return (
    <>
      <Card figure={pct(top.n / stats.narrative)} title={`The canon runs on ${top.label.toLowerCase()}, not joy`}>
        <p>
          {top.label} is the strongest emotion on {fmt(top.n)} of {fmt(stats.narrative)} story pages. Joy leads on {fmt(joy)} ({pct(joy / stats.narrative)}).
        </p>
        <ul className="bars">
          {lead.map((e) => (
            <li key={e.id}>
              <span>{e.label.toLowerCase()}</span>
              <i style={{ width: `${(e.n / top.n) * 100}%`, background: e.color }} />
              <em>{pct(e.n / stats.narrative)}</em>
            </li>
          ))}
        </ul>
      </Card>
      <Card figure={`${stats.saturated.joy} : ${stats.saturated.sadness}`} title="Grief goes all the way, joy almost never does">
        <p>
          Pages with a perfect score of 0.99 or more: {stats.saturated.joy} for joy, {stats.saturated.sadness} for sadness, {stats.saturated.fear} for fear. And{" "}
          {pct(stats.fearOverJoy)} of all story pages carry more fear than joy.
        </p>
      </Card>
      <Card figure={<span className="spark">{spark(light)}</span>} title="Books get darker until the last tenth">
        <p>
          Averaged over every book, light falls from {light[0].toFixed(2)} in the first tenth to {light[darkest].toFixed(2)} in tenth {darkest + 1}, then lifts to{" "}
          {light.at(-1)!.toFixed(2)} at the end. Tension does the mirror image: {tension[0].toFixed(2)} → {tension[tensest].toFixed(2)} in tenth {tensest + 1}.
        </p>
        <p className="mono-chart">
          <span className="dim">light</span> {spark(light)}
          <br />
          <span className="dim">tension</span> {spark(tension)}
        </p>
      </Card>
      <Card figure={pct(lastTenth / climaxes)} title="The climax sits on the last pages">
        <p>
          {lastTenth} of {climaxes} books reach their tensest, fastest page in the final tenth. The second most common spot is tenth{" "}
          {stats.climaxByTenth.indexOf(Math.max(...stats.climaxByTenth.slice(0, -1))) + 1}.
        </p>
        <p className="mono-chart">
          {spark(stats.climaxByTenth)} <span className="dim">books by tenth of the climax</span>
        </p>
      </Card>
      <Card figure={`1 in ${fmt(stats.narrative)}`} title="The most extreme single pages" wide>
        <ul className="records">
          <li>
            <span>tensest</span> <PageLink p={r.tension} />
          </li>
          <li>
            <span>darkest</span> <PageLink p={r.dark} />
          </li>
          <li>
            <span>saddest</span> <PageLink p={r.sadness} />
          </li>
          <li>
            <span>brightest</span> <PageLink p={r.light} />
          </li>
          <li>
            <span>funniest</span> <PageLink p={r.humor} />
          </li>
          <li>
            <span>most abstract</span> <PageLink p={r.ideas} />
          </li>
        </ul>
      </Card>
    </>
  );
}

function BookFindings({ f }: { f: Findings }) {
  const top = f.twins[0];
  const arc = f.arcs[0];
  return (
    <>
      {f.worldview && (
        <Card figure={`r ${f.worldview.at(-1)!.toFixed(2)}`} title="A book's worldview is decided by its ending">
          <p>
            How hopeful Jev judges a whole book correlates with the light of its last fifth at r = {f.worldview.at(-1)!.toFixed(2)}, and with its first fifth at only r ={" "}
            {f.worldview[0].toFixed(2)}.
          </p>
          <ul className="bars">
            {f.worldview.map((r, i) => (
              <li key={i}>
                <span>{ACTS[i]}</span>
                <i style={{ width: `${Math.max(0, r) * 100}%` }} />
                <em>{r.toFixed(2)}</em>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card figure={`${f.endsDarker}/${f.count}`} title="Most books end darker than they begin">
        <p>
          {f.endsDarker} of {f.count} books close on less light than they open with. The commonest story shape is {arc.label.toLowerCase()} ({arc.count} books), then{" "}
          {f.arcs
            .slice(1, 3)
            .map((a) => `${a.label.toLowerCase()} (${a.count})`)
            .join(" and ")}
          .
        </p>
      </Card>
      {top && (
        <Card figure={pct(top.similarity)} title="Twins by different authors" wide>
          <p>
            The closest pair by different authors is <Book b={top.a} /> ({top.a.author}) and <Book b={top.b} /> ({top.b.author}): {pct(top.similarity)} alike across all{" "}
            {ALL_FEATURES.length} dimensions.
          </p>
          <ul className="pairs">
            {f.twins.slice(1).map((p) => (
              <PairLine key={p.a.id + p.b.id} p={p} />
            ))}
          </ul>
        </Card>
      )}
      <Card figure={pct(f.loneliest.similarity)} title={`${f.loneliest.a.title} has no neighbours`}>
        <p>
          The loneliest book on the shelf: even its nearest neighbour, <Book b={f.loneliest.b} />, is only {pct(f.loneliest.similarity)} alike. The most typical is{" "}
          <Book b={f.typical.book} />, closest on average to everything else.
        </p>
      </Card>
      <Card figure={r2(f.opposites.similarity)} title="The furthest apart">
        <p>
          <Book b={f.opposites.a} /> and <Book b={f.opposites.b} /> are opposites: their fingerprints point in nearly reverse directions ({f.opposites.similarity.toFixed(2)}).
        </p>
      </Card>
      {f.axis && (
        <Card figure={pct(f.axis.explained)} title="The biggest difference between canon books">
          <p>
            The first principal component, {pct(f.axis.explained)} of all variation, runs from {f.axis.negative.map((x) => x.label.toLowerCase()).join(", ")} to{" "}
            {f.axis.positive.map((x) => x.label.toLowerCase()).join(", ")}. Put it on an axis on the{" "}
            <a href={href("/map")}>map</a>.
          </p>
        </Card>
      )}
      {f.rank.length > 0 && (
        <Card figure={`r ${r2(f.rank[0].r)}`} title="What the canon lists reward">
          <p>Correlation of each dimension with a book's place on the combined canon lists (positive: more of it ranks higher).</p>
          <ul className="records">
            {f.rank.map(({ feature, r }) => (
              <li key={feature.group + feature.key}>
                <span>{r2(r)}</span> {feature.label.toLowerCase()}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

export function HomePage() {
  const stats = useCorpusStats();
  const { rows } = useCanonShelf();
  const findings = useMemo(
    () => canonFindings((rows ?? []).flatMap((r) => (r.fingerprint ? [{ id: r.id, title: r.title, author: r.author, rank: r.rank, fingerprint: r.fingerprint }] : []))),
    [rows],
  );
  return (
    <div className="home">
      <section className="hero">
        <Suspense fallback={null}>
          <FractalField className="hero-field" />
        </Suspense>
        <div className="hero-copy">
          <h1 className="logo" aria-label="xbook">
            {LOGO}
          </h1>
          <p className="hero-lede">
            Jev reads a book page by page, answers {SEGMENT_QUESTION_COUNT} questions about each one and places the book among all the others.
            {stats ? ` So far: the ${stats.books} most canonical books, every page.` : ""}
          </p>
          <Search autoFocus />
          <div className="hero-actions">
            <button className="btn primary" onClick={openFilePicker}>
              upload epub · fb2 · txt
            </button>
            <button className="btn" onClick={() => navigate("/library")}>
              browse the canon
            </button>
            <button className="btn" onClick={() => navigate("/map")}>
              open the map
            </button>
          </div>
        </div>
      </section>

      <div className="home-body">
        {stats && (
          <section className="home-section">
            <header className="section-head">
              <h2>The reading</h2>
              <p>What it took to read the canon, page by page.</p>
            </header>
            <Totals stats={stats} />
          </section>
        )}

        <section className="home-section">
          <header className="section-head">
            <h2>Measured on every page</h2>
            <p>Anything that can be counted is computed in code from these answers: arcs, climaxes, neighbours. {GENRES.length} genres, Vonnegut's six story shapes.</p>
          </header>
          <div className="dims">
            {DIMENSIONS.map((d) => (
              <div key={d.name} className="dims-row">
                <b>{d.name}</b>
                <span className="dims-n">
                  {d.n} <small>{d.how}</small>
                </span>
                <span className="dims-items">{d.items.map((i) => i.toLowerCase()).join(" · ")}</span>
              </div>
            ))}
          </div>
        </section>

        {(stats || findings) && (
          <section className="home-section">
            <header className="section-head">
              <h2>Findings</h2>
              <p>Recomputed from the stored answers every time the canon changes. Click any title to open it.</p>
            </header>
            <div className="findings">
              {stats && <PageFindings stats={stats} />}
              {findings && <BookFindings f={findings} />}
            </div>
          </section>
        )}

        {stats === null && (
          <p className="dim">
            No canon on this server yet. Run <code>npm run corpus</code> to read the ranked list, then this page fills with findings.
          </p>
        )}
      </div>
    </div>
  );
}
