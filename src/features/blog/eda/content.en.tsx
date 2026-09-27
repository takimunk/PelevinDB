// The English essay. Corpus counts come from eda.json through `facts`; every other number is quoted
// from the data agent's findings on the same eda.json / eda-freq.json (scripts/eda-pelevin.py).
import { href } from "../../../app/router.ts";
import { Distinctive } from "./charts/Distinctive.tsx";
import { Fields } from "./charts/Fields.tsx";
import { fmtN } from "./charts/kit.tsx";
import { SemanticMap } from "./charts/SemanticMap.tsx";
import { Shelf } from "./charts/Shelf.tsx";
import { Similarity } from "./charts/Similarity.tsx";
import { StyleExplorer } from "./charts/StyleExplorer.tsx";
import { Topics } from "./charts/Topics.tsx";
import { WordTrajectories } from "./charts/WordTrajectories.tsx";
import type { Eda } from "./data.ts";
import type { Facts } from "./facts.ts";
import { Method } from "./Method.tsx";

const n = (v: number, d = 0) => fmtN("en", v, d);
const R = ({ children }: { children: string }) => <span lang="ru">{children}</span>;

export function ContentEn({ eda, f }: { eda: Eda; f: Facts }) {
  const chapaev = f.byId("pv-chapaev-i-pustota");
  return (
    <div className="blog-prose">
      <p className="lead">
        Viktor Pelevin has been publishing for {n(f.lastYear - f.firstYear)} years. Over those years his work moved from short stories to long novels, and since 2020 a new novel has appeared every year. PelevinDB is an
        attempt to read all of it with a machine. Before the machine reads, though, we count.
      </p>
      <p>
        What follows is the crudest possible reading of {n(f.n)} texts: words, sentences, frequencies. It is a bag of words. It does not see intonation or irony, and it does not know who is speaking. But it is the first
        pass you make over any corpus, the one that shows what is there and where to look next. Every chart can be played with, and every number in the text was computed from the same data the charts draw.
      </p>

      <h2>What is on the shelf</h2>
      <p>
        We started from a folder of EPUB editions and deduplicated it by content. That matters more than it sounds. Pelevin’s stories are reprinted in collection after collection, novellas turn up inside later books,
        magazine anthologies bring other authors along, and one file turned out to be his translation of someone else’s story. We removed 399 such duplicates and foreign texts. A work that appears in five volumes counts
        once, under the year it first came out; for about fifteen stories and essays that year is approximate.
      </p>
      <p>
        What remains is {n(f.n)} works and {n(f.words)} words: {n(f.novels)} novels, {n(f.novellas)} novellas, {n(f.stories)} stories, {n(f.essays)} essays and a single volume of interviews. The novels, from{" "}
        <em>Omon Ra</em> (1992) to <em>The Return of Bluebeard</em> (2026), hold 1.83 million of those words, 79% of everything. Stories make up half the titles and a thin slice of the text, and they cluster at the
        start: {f.peakYear} alone gives {n(f.peakCount)} works, {n(f.peakStories)} of them stories. After that the rhythm switches to one long book at a time, and from {f.novelRun.from} to {f.novelRun.to} a new novel has
        come out every single year.
      </p>
      <p>
        The interviews — <em>46 Interviews with Pelevin</em>, 94.6 thousand words — are hidden by default in the charts. They are spoken rather than written prose, and the models further down are fitted without them.
      </p>
      <Shelf books={eda.books} n={1} />
      <p>
        The longest works are <em>Invincible Sun</em> (115,439 words), <em>Batman Apollo</em> (112,104), <em>S.N.U.F.F.</em> (107,241) and <em>Transhumanism Inc.</em> (99,459). The shortest novel is{" "}
        <em>The Helmet of Horror</em> (24,434), with <em>Omon Ra</em> just behind it (30,971); the shortest pieces overall are <em>The Bridge I Wanted to Cross</em> (395 words) and <em>One Vogue</em> (397). Since 2004
        every novel has run to at least 49 thousand words, and usually to 75–115 thousand. Short forms dominate the early years; long novels dominate the later ones.
      </p>

      <h2>Style: shorter sentences, a richer vocabulary</h2>
      <p>
        Style is where counting starts to say something. Take the novels by decade. The mean sentence falls from 10.9 words in the 1990s to 9.1 in the 2020s (Spearman’s ρ with the year is −0.27: a drift, not a law).{" "}
        <em>Omon Ra</em> has the longest sentences of any novel, 12.6 words on average, with one in ten longer than 29; <em>The Helmet of Horror</em> (7.6) and <em>Krut</em> (7.7) have the shortest. The stories need care
        here: <em>The Water Tower</em> is a single sentence of about 2,800 words (add the stories to the chart below and it is pinned to the top edge), so for stories the median sentence, 14 words, is more honest than
        the mean.
      </p>
      <p>
        At the same time the vocabulary grows. We measure richness with MATTR — the share of distinct words in a sliding window of 500, averaged over the text — because the plain type–token ratio punishes long books for
        being long. The novels average 0.668 in the 1990s, 0.661 in the 2000s, 0.682 in the 2010s and 0.685 in the 2020s (ρ = +0.48). The richest are <em>iPhuck 10</em> and <em>Love for Three Zuckerbrins</em> (0.697
        each), then <em>The Return of Bluebeard</em> (0.695). The lowest by far is <em>The Helmet of Horror</em> (0.597), which is a chat transcript that keeps repeating the same nicknames. Words themselves get slightly
        longer, from 5.25 to 5.34 letters on average (ρ = +0.35): a more abstract, more Latinate vocabulary.
      </p>
      <p>
        Punctuation becomes more restrained. The share of sentences ending in an exclamation mark drops from 2.9% in the 1990s novels to 1.0% in the 2020s; <em>Omon Ra</em> peaks at 4.3%,{" "}
        <em>The Order of the Yellow Flag</em> is lowest at 0.5%. Questions decline less clearly, from 12.4% to 10.6%. The most interrogative novel is <em>The Helmet of Horror</em> (19.7%), the least{" "}
        <em>Love for Three Zuckerbrins</em> (4.6%).
      </p>
      <p>
        Some things do not move. Dialogue holds at roughly 40–58% of paragraphs in almost every novel; the exceptions are <em>Love for Three Zuckerbrins</em> (12%), <em>KGBT+</em> (25%), <em>S.N.U.F.F.</em> (33%) and{" "}
        <em>A Sinistra</em> (35%). <em>Numbers</em> and <em>The Helmet of Horror</em> score zero, but only because their speech is not set off with dashes: the measure counts typography, not talk. First person comes and
        goes with no trend at all (ρ = +0.06). The word <R>я</R> is densest in <em>A Sinistra</em> (41.6 per thousand words), <em>The Iron Abyss</em> (39.9), <em>Empire V</em> (39.3), <em>Invincible Sun</em> (36.4) and{" "}
        <em>Omon Ra</em> (35.8), and rarest in the third-person books: <em>Numbers</em> (6.2), <em>Generation P</em> (6.5), <em>Transhumanism Inc.</em> (7.4). In his interviews Pelevin says <R>я</R> 24 times per thousand
        words — about as often as one of his narrators.
      </p>
      <p>The explorer below starts with the novels, sentence length against year. Put any two measures against each other, add the stories and essays, and pin the books you want to follow.</p>
      <StyleExplorer books={eda.books} n={2} kinds={["novel"]} />

      <h2>Words that come and go</h2>
      <p>
        For vocabulary, every word was reduced to its dictionary form with pymorphy3, so that one lemma stands for all its cases and tenses. The {n(f.stopwords)} commonest function words were dropped; what is left is{" "}
        {n(f.vocab)} distinct content lemmas. The chart below knows the four thousand most frequent. Type a word, or start from the examples.
      </p>
      <p>
        Some words belong to one book and vanish. <R>вампир</R> is almost entirely two novels: 39 times per ten thousand words in <em>Empire V</em>, 43 in <em>Batman Apollo</em>, and barely above zero anywhere else.
        Others arrive with the times. <R>нейросеть</R>, the neural network, first appears in <em>iPhuck 10</em> (2017), and in the 2020s settles in at 3.5–5.6 per ten thousand words: <em>KGBT+</em>,{" "}
        <em>Journey to Eleusis</em>, <em>Krut</em>, <em>A Sinistra</em>. The lemmatiser files money under <R>деньга</R>; it peaks in <em>The Macedonian Critique of French Thought</em> (23 per ten thousand) and{" "}
        <em>Generation P</em> (12). And the most famous word of all, <R>пустота</R>, is surprisingly rare: 6 per ten thousand in <em>Chapaev and Void</em>, 7 in <em>The Hermit and Six-Toes</em>, less everywhere else.
        Emptiness is present in his books far more as a theme than as a frequent word.
      </p>
      <p>Lemmatisation is not perfect with his coinages — a neologism the dictionary has never seen can land on a strange lemma — so treat single spikes with suspicion and look for runs.</p>
      <WordTrajectories books={eda.books} n={3} />
      <p>Single words are noisy, so we also grouped them into {n(f.fields)} hand-made semantic fields of 29–56 lemmas each. Read by decade across the novels, they tell the clearest story in this whole exercise.</p>
      <p>
        Technology is the steepest rise: 10 occurrences per ten thousand words in the 1990s, then 13, 22 and 35 in the 2020s (ρ = +0.54 across all the fiction). <em>iPhuck 10</em> and <em>Transhumanism Inc.</em> both
        reach 68; <em>Chapaev and Void</em> is almost at zero. The Soviet past drops sharply: 22.6 in the 1990s novels and 3–4 ever since, with <em>Omon Ra</em> alone at 58.8. Religion climbs from 19 to 52 (
        <em>A Sinistra</em> 79, <em>Invincible Sun</em> 67), and the field of consciousness, mind and dream from 34 to 53 (<em>Love for Three Zuckerbrins</em> 74, <em>KGBT+</em> 71). Buddhist and “emptiness” vocabulary
        rises more gently, from 12 to 16, and peaks late, in <em>KGBT+</em> and <em>Secret Views of Mount Fuji</em>.
      </p>
      <p>
        Other fields are episodes. Money and marketing belong to <em>Generation P</em> (82) and <em>Numbers</em> (46). Drugs are a 1990s motif (8.1, down to 3.6), led by <em>Chapaev and Void</em> and{" "}
        <em>Generation P</em>. Vampires and werewolves hardly exist before <em>Empire V</em> (57) and <em>Batman Apollo</em> (79). Power and the secret services dip in the 2000s and peak in the 2020s, with{" "}
        <em>Methuselah’s Lamp</em> (62) on top. Insects and animals fade, from 27 in the 2000s to 14. Death rises steadily, from 10 to 18.
      </p>
      <Fields books={eda.books} fields={eda.fields} n={4} />

      <h2>A map by vocabulary</h2>
      <p>
        If each work becomes a vector of word weights — TF-IDF, which rewards words that are frequent in one text and rare in the rest — works can be compared and laid out on a plane. To keep book length from dominating,
        the vectors were built from equal chunks of about two thousand words and averaged per book, with personal names and words used in a single work left out. The two strongest directions turn out to be easy to read.
      </p>
      <p>
        The first axis (15% of the variance) runs from scene to discourse. One end is physical narration — <R>дверь</R>, <R>голос</R>, <R>окно</R>, <R>коридор</R>, <R>медленно</R>, <R>бутылка</R> — where the early
        stories sit, with <em>The Life of Insects</em> and <em>The Prince of Gosplan</em>. The other is essayistic abstraction — <R>являться</R>, <R>информация</R>, <R>современный</R>, <R>термин</R>, <R>система</R> —
        home of the essays. Over the novels this axis correlates with the year at ρ = −0.72: the novels drift from scene toward discourse.
      </p>
      <p>
        The second axis (7%) is effectively a timeline (ρ = +0.79 with the year). At one end, late metaphysical dialogue: <R>твой</R>, <R>бог</R>, <R>ум</R>, <R>засмеяться</R>, <R>монах</R>, <R>сердце</R> —{" "}
        <em>A Sinistra</em>, <em>Secret Views of Mount Fuji</em>, <em>Invincible Sun</em>. At the other, the late-Soviet street: <R>советский</R>, <R>газета</R>, <R>шоссе</R>, <R>радио</R>, <R>асфальт</R>, <R>забор</R>,{" "}
        <R>товарищ</R> — early stories like <em>The Weapon of Retribution</em> and <em>Music from a Pole</em>.
      </p>
      <SemanticMap eda={eda} n={5} />
      <p>
        The same vectors give a similarity for every pair of works. The closest novels are exactly the known cycles and sequels: <em>Empire V</em> and <em>Batman Apollo</em> (cosine 0.76), <em>Transhumanism Inc.</em> and{" "}
        <em>KGBT+</em> (0.72), the two <em>Watcher</em> books (0.715). The less obvious neighbours are more interesting: <em>Chapaev and Void</em> and <em>t</em> (0.67), <em>KGBT+</em> and <em>Krut</em> (0.66), and{" "}
        <em>Love for Three Zuckerbrins</em>, which sits near both <em>Batman Apollo</em> and <em>S.N.U.F.F.</em> The least alike pair <em>Omon Ra</em> with the late books: 0.34 with <em>The Helmet of Horror</em>, 0.37
        with <em>iPhuck 10</em> and with <em>The Return of Bluebeard</em>. The interviews are closest to <em>iPhuck 10</em> (0.55).
      </p>
      <Similarity books={eda.books} similarity={eda.similarity} n={6} initial="pv-empire-v" />
      <p>
        For each work there is also the list of words that set it apart from all the others, measured by weighted log-odds with names removed. Mostly these are the objects that furnish each novel’s world.{" "}
        <em>Omon Ra</em>: <R>луноход</R>, <R>полет</R>, <R>противогаз</R>, <R>космонавт</R>. <em>Chapaev and Void</em>: <R>броневик</R>, <R>маузер</R>, <R>шашка</R>, <R>самогон</R>, <R>кайф</R>. <em>Generation P</em>:{" "}
        <R>слоган</R>, <R>телевизор</R>, <R>реклама</R>, <R>копирайтер</R>, <R>мухомор</R>. <em>Transhumanism Inc.</em>: <R>баночный</R>, <R>мозг</R>, <R>чип</R>, <R>холоп</R>. <em>A Sinistra</em>: <R>гримуар</R>,{" "}
        <R>гомункул</R>, <R>реторта</R>, <R>алхимия</R>. Such lists work as reminders for a reader who knows the book; on their own they say little.
      </p>
      <Distinctive books={eda.books} distinctive={eda.distinctive} common={eda.distinctiveCommon} n={7} initial={chapaev ? chapaev.id : undefined} />

      <h2>Topics</h2>
      <p>
        Finally, non-negative matrix factorisation splits 1,174 chunks of about two thousand words into {n(f.topics)} topics: groups of words that travel together, each with a share in every work. They come in two kinds.
        Some are shared moods that run through many texts. “Rooms, bottles and corridors” makes up about 70% of the early stories and <em>The Yellow Arrow</em>; “Mind and emptiness” belongs to <em>Ivan Kublakhanov</em>{" "}
        and <em>A Record of the Search for the Wind</em>; “Men, women and desire” to <em>Akiko</em>, <em>Mount Fuji</em> and <em>Iakinf</em>. Others are the stage sets of whole cycles: vampire economics for{" "}
        <em>Empire V</em> and <em>Batman Apollo</em> (about half of each), brains in jars for <em>KGBT+</em> (55%) and <em>Transhumanism Inc.</em> (46%), Rome and its gods for <em>Journey to Eleusis</em> and{" "}
        <em>Invincible Sun</em>, angels and mediums for the <em>Watcher</em> books. The essay voice — Russia, media, authorship — covers the essays and 54% of the interviews.
      </p>
      <Topics books={eda.books} topics={eda.topics} n={8} />

      <h2>What this cannot see</h2>
      <p>
        Everything above is a bag of words: it knows which words occur and how often, not in what order, in whose mouth or with what intonation. Lemmatisation flattens his wordplay, the stopword list throws away the
        small words that carry tone, and a two-page story can swing any rate on a handful of occurrences. These are measurements of surface, not of meaning — a first step.
      </p>
      <p>
        The next step reads rather than counts. The Jev model has read all 8,612 pages of the corpus and answered the same 36 questions about each one — emotions, tension, pace, mood, narration, themes — so that books
        can be compared by what their pages do rather than by which words they use. Those readings live on <a href={href("/map")}>the map</a>, where books are placed by meaning, and in{" "}
        <a href={href("/library")}>the library</a>, where every book has its own page-by-page dashboard. A later note will put the two readings side by side.
      </p>
      <Method eda={eda} />
    </div>
  );
}
