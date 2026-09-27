// Every number the prose quotes, derived from jev.json, so the text can never drift from the charts.
import { SEGMENT_QUESTION_COUNT } from "../../../../shared/catalog.ts";
import type { Jev, Trend } from "./data.ts";

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);

export function facts(jev: Jev) {
  const k = (key: string) => jev.keys.indexOf(key);
  const nov = (key: string) => jev.trends.novels.find((r) => r.key === key)!;
  const fic = (key: string) => jev.trends.fiction.find((r) => r.key === key)!;
  const novels = jev.works.filter((w) => w.kind === "novel");
  const decade = (key: string, from: number, to: number, list = novels) =>
    mean(
      list.filter((w) => w.year >= from && w.year < to).map((w) => w.v[k(key)]),
    );
  const fiction = jev.works;
  const sig = (list: Trend[]) => list.filter((r) => r.q < 0.05).length;
  const arcs = jev.arcs.dims;
  const early = (d: string) => mean(arcs[d].mean.slice(0, 2));
  const rest = (d: string) => mean(arcs[d].mean.slice(2));
  const coupling = (a: string, b: string) =>
    jev.coupling[jev.scores.indexOf(a)][jev.scores.indexOf(b)];

  return {
    c: jev.corpus,
    works: fiction.length,
    novelCount: novels.length,
    firstYear: Math.min(...fiction.map((w) => w.year)),
    lastYear: Math.max(...fiction.map((w) => w.year)),
    dims: jev.keys.length,
    /** Questions per page: the two Choices (mood, narration) spread over their options, hence more dimensions. */
    questions: SEGMENT_QUESTION_COUNT,
    sigNovels: sig(jev.trends.novels),
    sigFiction: sig(jev.trends.fiction),
    imagery: nov("texture:imagery"),
    ideas: nov("texture:ideas"),
    faith: nov("theme:faith"),
    loneliness: nov("theme:loneliness"),
    description: nov("mode:description"),
    action: nov("mode:action"),
    pace: nov("texture:pace"),
    humor: nov("texture:humor"),
    humorFiction: fic("texture:humor"),
    fearFiction: fic("emotion:fear"),
    sadnessFiction: fic("emotion:sadness"),
    loveFiction: fic("theme:love"),
    scienceFiction: fic("theme:science"),
    robust: jev.robust,
    d: {
      imagery: [
        decade("texture:imagery", 1990, 2000),
        decade("texture:imagery", 2020, 2030),
      ],
      ideas: [
        decade("texture:ideas", 1990, 2000),
        decade("texture:ideas", 2020, 2030),
      ],
      faith: [
        decade("theme:faith", 1990, 2000),
        decade("theme:faith", 2020, 2030),
      ],
      loneliness: [
        decade("theme:loneliness", 1990, 2000),
        decade("theme:loneliness", 2020, 2030),
      ],
      humor: [
        decade("texture:humor", 1990, 2000),
        decade("texture:humor", 2000, 2010),
        decade("texture:humor", 2010, 2020),
        decade("texture:humor", 2020, 2030),
      ],
      fear: [
        decade("emotion:fear", 1989, 2000, fiction),
        decade("emotion:fear", 2020, 2030, fiction),
      ],
      sadness: [
        decade("emotion:sadness", 1989, 2000, fiction),
        decade("emotion:sadness", 2020, 2030, fiction),
      ],
    },
    coupling: {
      humorIdeas: coupling("humor", "ideas"),
      humorLight: coupling("humor", "valence"),
      humorDisgust: coupling("humor", "disgust"),
      humorFear: coupling("humor", "fear"),
      paceIdeas: coupling("pace", "ideas"),
      joyLight: coupling("joy", "valence"),
      fearTension: coupling("fear", "tension"),
    },
    arc: {
      tension: arcs.tension.ending,
      tensionUp: arcs.tension.endingUp,
      light: arcs.valence.ending,
      lightUp: arcs.valence.endingUp,
      climaxLast: jev.arcs.climax[9],
      interiority: [early("interiority"), rest("interiority")],
    },
    comic: jev.comic,
    s: jev.sentences,
    voice: (act: string) => jev.sentences.voices.find((v) => v.act === act)!,
    profile: jev.profile,
    title: (id: string) => jev.works.find((w) => w.id === id)!,
  };
}

export type Facts = ReturnType<typeof facts>;
