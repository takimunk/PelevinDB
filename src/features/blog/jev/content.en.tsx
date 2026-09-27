// "From image to idea", English. Every number comes from `facts` (jev.json); quotes open the reader on the sentence.
import type { ReactNode } from "react";
import { href } from "../../../app/router.ts";
import { Arc } from "./charts/Arc.tsx";
import { Coupling } from "./charts/Coupling.tsx";
import { Joke } from "./charts/Joke.tsx";
import { Shift } from "./charts/Shift.tsx";
import { Timeline } from "./charts/Timeline.tsx";
import { Voices } from "./charts/Voices.tsx";
import type { Jev, Ref } from "./data.ts";
import type { Facts } from "./facts.ts";
import { fmt, Line, pct, pval, signed } from "./kit.tsx";

const L = "en";
const r = (v: number) => signed(L, v);
const f2 = (v: number) => fmt(L, v, 2);
const ci = (c: [number, number] | number[]) => `[${r(c[0])}, ${r(c[1])}]`;
const Src = ({ f, x }: { f: Facts; x: Ref }) => {
  const w = f.title(x.id);
  return (
    <>
      <em>{w.titleEn}</em>, {w.year} · p. {x.page}
    </>
  );
};

export type Shared = {
  a: string;
  b: string | null;
  setA: (k: string) => void;
  setB: (k: string | null) => void;
  pick: (k: string) => void;
};

export function ContentEn({ jev, f, s }: { jev: Jev; f: Facts; s: Shared }) {
  const v = f.voice;
  const B = ({ children }: { children: ReactNode }) => (
    <b className="jv-num">{children}</b>
  );
  return (
    <div className="jv-prose">
      <p className="jv-lead">
        A machine read every page of Pelevin’s fiction —{" "}
        {f.c.pages.toLocaleString("en")} pages of {f.works} novels, novellas and
        stories from {f.firstYear} to {f.lastYear} — and answered the same{" "}
        {f.questions} questions about each one. How much fear is here? How fast
        does it move? Is this page about faith, about money, about death? Is it
        told, shown, argued? Then it went back and read the pages sentence by
        sentence. This post asks what those answers say about how Pelevin has
        changed, and holds every claim to a statistical test.
      </p>
      <p>
        The short version: across thirty-seven years one change stands above
        everything else.{" "}
        <strong>The pictures thin out and the ideas take over.</strong>{" "}
        Description, action and sensory imagery recede; argument, faith and the
        narrator’s own voice advance. The jokes, meanwhile, stay exactly where
        they were.
      </p>

      <aside className="jv-aside">
        <p>
          <b>How to read the numbers.</b> Jev (a TypeSafe model) scores every
          page on a fixed rubric: eight emotions, seven textures, nineteen
          themes, a mood and a narration mode. The unit of analysis is the{" "}
          <em>work</em>, not the page: a novel of 400 pages is one observation
          about its author, not 400. Trends are Spearman’s ρ between a work’s
          average and its year, tested by permutation, with 95% bootstrap
          intervals and a Benjamini–Hochberg correction across all {f.dims}{" "}
          dimensions, because testing {f.dims} things at once guarantees a few
          false alarms. Every figure is live: hover, switch, click through to
          the book.
        </p>
      </aside>

      <h2>What changed</h2>
      <p>
        Start with everything at once. Figure 1 lines up all {f.dims}{" "}
        measurements behind Jev’s answers by how strongly they drift with the
        year. In the {f.novelCount} novels, {f.sigNovels} survive the
        correction; across all {f.works} works of fiction, {f.sigFiction} do.
        The two strongest are mirror images: <B>imagery</B> falls (ρ ={" "}
        {r(f.imagery.rho)}, 95% CI {ci(f.imagery.ci)}) and <B>ideas</B> rise (ρ
        = {r(f.ideas.rho)}, {ci(f.ideas.ci)}). Right behind them come the
        narrative modes that carry each: description (ρ = {r(f.description.rho)}
        ) and action (ρ = {r(f.action.rho)}) give way.
      </p>
      <Shift
        jev={jev}
        n={1}
        picked={[s.a, s.b].filter(Boolean) as string[]}
        onPick={s.pick}
      />
      <p>
        Two things are worth noticing in what does <em>not</em> move. Humour has
        no trend at all (ρ = {r(f.humor.rho)} in the novels,{" "}
        {r(f.humorFiction.rho)} across all fiction). And tension, the engine of
        plot, is flat too. Pelevin did not become less funny or less gripping.
        He became something else on top.
      </p>

      <h2>The crossing</h2>
      <p>
        In the 1990s novels the average page scores {f2(f.d.imagery[0])} on
        imagery and {f2(f.d.ideas[0])} on ideas. In the 2020s it is{" "}
        {f2(f.d.imagery[1])} and {f2(f.d.ideas[1])}. In the late 2010s the
        smoothed lines cross (Figure 2). Put two sentences side by side, each
        the peak of its kind: the most vivid page of the early novels, and the
        most idea-laden page of the recent ones.
      </p>
      <div className="jv-pair">
        <div>
          <span className="jv-pair-k">imagery · 1990s</span>
          <Line r={jev.pair.image} source={<Src f={f} x={jev.pair.image} />} />
        </div>
        <div>
          <span className="jv-pair-k">ideas · 2020s</span>
          <Line r={jev.pair.idea} source={<Src f={f} x={jev.pair.idea} />} />
        </div>
      </div>
      <Timeline jev={jev} n={2} a={s.a} b={s.b} onA={s.setA} onB={s.setB} />
      <p>
        Is this real, or an artefact? Three checks. First, no single book
        carries it: dropping any one novel and refitting leaves ρ for imagery
        between {r(f.imagery.loo[0])} and {r(f.imagery.loo[1])}, and for ideas
        between {r(f.ideas.loo[0])} and {r(f.ideas.loo[1])}. Second, it is not
        just that later novels talk more: restricted to narration pages
        (dialogue probability below 0.3) the trends are{" "}
        {r(f.robust["texture:imagery"].narrationOnly)} and{" "}
        {r(f.robust["texture:ideas"].narrationOnly)}. Third, it shows up again
        at a completely different scale, in single sentences read one by one,
        further down.
      </p>

      <h2>Less loneliness, more faith</h2>
      <p>
        The themes move with it. Faith — God, religion, spirituality as the
        subject of a page — rises from {pct(L, f.d.faith[0], 0)} of a 1990s
        novel’s pages to {pct(L, f.d.faith[1], 0)} in the 2020s (ρ ={" "}
        {r(f.faith.rho)}), and loneliness falls from{" "}
        {pct(L, f.d.loneliness[0], 0)} to {pct(L, f.d.loneliness[1], 0)} (ρ ={" "}
        {r(f.loneliness.rho)}). The early heroes are isolated: a cadet sealed in
        a lunar rover, an insect, a patient in a psychiatric ward. The later
        ones are connected to everything — to networks, to corporations, to gods
        and to the reader, whom the narrator increasingly addresses. Across all
        fiction, fear (ρ = {r(f.fearFiction.rho)}) and sadness (ρ ={" "}
        {r(f.sadnessFiction.rho)}) also recede, while love (ρ ={" "}
        {r(f.loveFiction.rho)}) and science (ρ = {r(f.scienceFiction.rho)})
        grow. Try them in Figure 2.
      </p>

      <h2>The joke is its own channel</h2>
      <p>
        If the ideas grew and the humour did not shrink, how do they live
        together? Figure 3 looks inside the books: it correlates the scores page
        by page after removing each work’s average, so it says which pages go
        with which, not which books. Most pairs are what you would expect — joy
        goes with light (r = {r(f.coupling.joyLight)}), fear with tension (r ={" "}
        {r(f.coupling.fearTension)}). Ideas stop the action: pages that think
        are pages that stand still (pace × ideas, r = {r(f.coupling.paceIdeas)}
        ).
      </p>
      <p>
        Humour is the odd one out. It is almost perfectly independent of both
        ideas (r = {r(f.coupling.humorIdeas)}) and of light (r ={" "}
        {r(f.coupling.humorLight)}). A Pelevin page is not funnier when it is
        sunnier or when it is shallower. Where humour does lean, it leans
        towards disgust (r = {r(f.coupling.humorDisgust)}) and away from fear (r
        = {r(f.coupling.humorFear)}): the laughter of satire, not of relief.
      </p>
      <Coupling jev={jev} n={3} />
      <p>
        Because humour and ideas are independent channels, a page can max out
        both — and those pages have become more common. Pages scoring at least
        0.75 on both humour and ideas make up {pct(L, f.comic.decades["1990"])}{" "}
        of a work in the 1990s and about {pct(L, f.comic.decades["2020"], 0)}{" "}
        since (ρ = {r(f.comic.rho)} across works, {pval(L, f.comic.p)}). Here is
        the most quotable sentence of a few of them:
      </p>
      <div className="jv-lines">
        {jev.comic.examples.slice(0, 5).map((x) => (
          <Line key={x.id} r={x} source={<Src f={f} x={x} />} />
        ))}
      </div>
      <p>
        And there is a rhythm to where the joke lands. On{" "}
        {f.s.punchline.n.toLocaleString("en")} pages where Jev names a funniest
        sentence, that sentence closes its paragraph{" "}
        {pct(L, f.s.punchline.observed, 0)} of the time, against{" "}
        {pct(L, f.s.punchline.expected, 0)} if it fell anywhere (Figure 4).
        Pelevin builds a paragraph and then pulls the rug.
      </p>
      <Joke jev={jev} n={4} />

      <h2>How a Pelevin novel moves</h2>
      <p>
        Cut each novel into twenty equal stretches and average them (Figure 5).
        Tension climbs towards the end: the last tenth is {r(f.arc.tension[0])}{" "}
        above the rest (95% CI {ci(f.arc.tension.slice(1))}), higher in{" "}
        {f.arc.tensionUp} of {f.novelCount} novels, and the combined peak of
        tension and pace falls in the final tenth in {f.arc.climaxLast} of them.
        Light does <em>not</em> rise at the end ({r(f.arc.light[0])},{" "}
        {ci(f.arc.light.slice(1))}; brighter in only {f.arc.lightUp} of{" "}
        {f.novelCount}). The escape that closes so many of these books — into
        Inner Mongolia, out of the chrysalis, beyond the simulation — is not
        scored as happiness. And the novels open inward: interiority averages{" "}
        {f2(f.arc.interiority[0])} over the first tenth and{" "}
        {f2(f.arc.interiority[1])} afterwards.
      </p>
      <Arc jev={jev} n={5} />

      <h2>The narrator steps forward</h2>
      <p>
        So far everything was measured page by page. The last test goes down to
        single sentences. From every story page{" "}
        {f.s.sample.toLocaleString("en")} sentences were drawn at random and
        read by Jev one at a time, with their neighbours for context: who is
        speaking, how abstract it is, whether it would stand alone as an
        aphorism. This is an independent measurement — different questions, a
        different unit — and it tells the same story.
      </p>
      <p>
        In the 1990s works, {pct(L, f.s.comment.first, 0)} of sentences are the
        narrator commenting in his own voice; in the 2020s,{" "}
        {pct(L, f.s.comment.last, 0)} (ρ = {r(f.s.comment.rho)},{" "}
        {pval(L, f.s.comment.p)}). Abstraction rises from{" "}
        {f2(f.s.abstraction.first)} to {f2(f.s.abstraction.last)} (ρ ={" "}
        {r(f.s.abstraction.rho)}), and the share of free-standing aphorisms from{" "}
        {pct(L, f.s.aphorism.first)} to {pct(L, f.s.aphorism.last)} (ρ ={" "}
        {r(f.s.aphorism.rho)}). The aphorisms come from that voice:{" "}
        {pct(L, v("comment").aphorism[0], 0)} of the narrator’s comments are
        aphorisms, against {pct(L, v("speech").aphorism[0])} of what characters
        say and {pct(L, v("narration").aphorism[0])} of plain narration.
      </p>
      <Voices jev={jev} n={6} />
      <p>A few of them, in order of publication:</p>
      <div className="jv-lines">
        {f.s.maxims.map((x) => (
          <Line key={x.id} r={x} source={<Src f={f} x={x} />} />
        ))}
      </div>

      <h2>Can we trust the instrument?</h2>
      <p>
        Every number here is a model’s judgement, not a human reader’s, and the
        post should be read that way. What we can say about the instrument: it
        is consistent with itself across scales. On a pilot of 30 pages read
        both as a whole and sentence by sentence, the sentence Jev picked as a
        page’s peak ranked in the top 30% of the sentences scored alone for
        every dimension, and in the top 7% for ideas, imagery and quotability.
        The whole-book questions, asked separately over six sampled pages, agree
        too: complexity (ρ = {r(f.profile.complexity.rho)}) and scope (ρ ={" "}
        {r(f.profile.scope.rho)}) rise over the years.
      </p>
      <p>
        What we cannot say: why. A rising ideas score is compatible with a
        writer who has more to say, with a changing market for novels, and with
        a rater that finds essayistic prose easier to label. Nor do we have a
        human gold standard for these pages. The claims above are about what one
        consistent reader found, tested so that chance and single books cannot
        explain them.
      </p>

      <h2>What it adds up to</h2>
      <p>
        Read at scale, Pelevin’s thirty-seven years have a direction. The early
        books show: a cadet in a tin can, insects on a beach, a steppe of pure
        images. The late books argue: the narrator steps out from behind the
        story and tells you how the world is made, in sentences built to be
        quoted. Throughout, the humour runs on its own track, untouched by
        either — which may be the most Pelevin thing of all.
      </p>
      <p>
        Every page and sentence quoted here opens in the reader, highlighted.
        The <a href={href("/library?tab=lines")}>Lines</a> tab ranks the
        corpus’s most quotable, funniest and darkest sentences, and each book’s
        page has its own charts.
      </p>

      <aside className="jv-aside jv-method">
        <p>
          <b>Method</b>
        </p>
        <dl>
          <dt>Corpus</dt>
          <dd>
            {f.works} works of fiction ({f.novelCount} novels),{" "}
            {f.c.pages.toLocaleString("en")} story pages of 1,800 characters;
            essays and interviews excluded; title pages, contents and notes
            excluded by Jev’s own paratext label.
          </dd>
          <dt>Page answers</dt>
          <dd>
            {f.dims} per page: 8 emotions and 7 textures (0–1 scores), 19 themes
            (probabilities), 11 moods and 8 narration modes (probabilities).
          </dd>
          <dt>Sentences</dt>
          <dd>
            {f.c.sentences.toLocaleString("en")} sentences; the peak sentence
            per page and dimension for all {f.c.focusPages.toLocaleString("en")}{" "}
            pages; {f.s.sample.toLocaleString("en")} randomly sampled sentences
            read one by one (other sentence reads, chosen for being extreme, are
            excluded from every rate).
          </dd>
          <dt>Statistics</dt>
          <dd>
            Work-level Spearman ρ with the year; permutation p (5,000 shuffles);
            bootstrap 95% CIs over works; Benjamini–Hochberg q across {f.dims}{" "}
            dimensions; leave-one-work-out ranges. Page couplings are Pearson
            correlations of within-work deviations.
          </dd>
          <dt>Reproduce</dt>
          <dd>
            <code>python3 scripts/jev-blog.py</code> rebuilds every number from
            the corpus store.
          </dd>
        </dl>
      </aside>
    </div>
  );
}
