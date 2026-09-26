export const emotions = [
  {
    id: "joy",
    label: "Радость",
    color: "#dfb65e",
    description: "joy and delight",
  },
  {
    id: "trust",
    label: "Доверие",
    color: "#85a588",
    description: "trust, connection and safety",
  },
  {
    id: "fear",
    label: "Страх",
    color: "#9985b1",
    description: "fear and apprehension",
  },
  {
    id: "surprise",
    label: "Удивление",
    color: "#77b7b0",
    description: "surprise and wonder",
  },
  {
    id: "sadness",
    label: "Грусть",
    color: "#829bb9",
    description: "sadness, grief and longing",
  },
  {
    id: "disgust",
    label: "Отвращение",
    color: "#aaa879",
    description: "disgust and revulsion",
  },
  {
    id: "anger",
    label: "Гнев",
    color: "#cb7e70",
    description: "anger and hostility",
  },
  {
    id: "anticipation",
    label: "Ожидание",
    color: "#d5a47e",
    description: "anticipation and suspense",
  },
] as const;
export type Emotion = (typeof emotions)[number]["id"];
export type Scores = Record<Emotion, number>;
export type Segment = {
  id: number;
  start: number;
  end: number;
  text: string;
  scores?: Scores;
  confidence?: Scores;
  raw?: unknown;
  model?: string;
};
export type Book = {
  title: string;
  author: string;
  text: string;
  format: string;
  demo?: boolean;
};
export type Mode = "pages" | "paragraphs";
export const PAGE_CHARS = 1800;
export function normalize(text: string) {
  return text
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
export function segmentText(
  text: string,
  mode: Mode,
  size = PAGE_CHARS,
): Segment[] {
  if (!Number.isInteger(size) || size < 100)
    throw new Error("Invalid page size");
  const result: Segment[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + size, text.length);
    if (mode === "paragraphs") {
      const boundary = text.indexOf("\n\n", start);
      if (boundary !== -1 && boundary + 2 <= end) end = boundary + 2;
    }
    if (
      end < text.length &&
      !/\s/.test(text[end]) &&
      !/\s/.test(text[end - 1])
    ) {
      const window = text.slice(start, end);
      const match = [...window.matchAll(/\s/g)].at(-1);
      if (match && match.index! > size / 2) end = start + match.index! + 1;
      // Do not split UTF-16 surrogate pairs.
      if (/[\uD800-\uDBFF]/.test(text[end - 1])) end--;
    }
    result.push({
      id: result.length + 1,
      start,
      end,
      text: text.slice(start, end),
    });
    start = end;
  }
  return result;
}
export function dominant(segment: Segment): Emotion | "neutral" {
  if (!segment.scores) return "neutral";
  const ranked = [...emotions].sort(
    (a, b) => segment.scores![b.id] - segment.scores![a.id],
  );
  return segment.scores[ranked[0].id] < 0.2 ? "neutral" : ranked[0].id;
}
export function colorFor(segment: Segment) {
  return emotions.find((e) => e.id === dominant(segment))?.color ?? "#bcc2b9";
}
export function intensity(segment: Segment) {
  return segment.scores ? Math.max(...Object.values(segment.scores)) : 0;
}
// Synthetic values for the explicitly labeled sample, never applied to uploaded books.
export function demoScores(segments: Segment[]): Segment[] {
  return segments.map((s, i) => {
    const x = i / Math.max(1, segments.length - 1);
    const scores = Object.fromEntries(
      emotions.map((e, j) => {
        const wave =
          Math.sin(x * 15 + j * 1.7) * 0.15 +
          Math.sin(i * 2.39 + j * 4.1) * 0.09;
        const arc =
          j === 4
            ? 0.28 + Math.sin(x * Math.PI) * 0.3
            : j === 1
              ? 0.25 + x * 0.18
              : j === 0
                ? 0.22 + Math.cos(x * Math.PI * 2) * 0.18
                : 0.17;
        return [e.id, Math.max(0.02, Math.min(0.95, arc + wave))];
      }),
    ) as Scores;
    return { ...s, scores, model: "synthetic-demo-v1" };
  });
}
const passages = [
  "Утром море казалось продолжением неба. Лида открыла окно, и солёный воздух наполнил комнату. Впервые за много месяцев ей никуда не нужно было спешить. На подоконнике стояла чашка, которую отец когда-то привёз из путешествия. Она провела пальцем по тонкой трещине и улыбнулась.",
  "Дом встретил её тишиной. Всё было на своих местах: связка ключей у двери, старое пальто, письмо на столе. Только человека, которому принадлежали эти вещи, больше не было. Лида присела на край стула и стала слушать, как за стеной медленно движется день.",
  "К вечеру поднялся ветер. Дверь на чердак хлопнула так резко, что она вздрогнула. Внизу, у причала, кто-то зажёг фонарь. Лида знала, что лодки не возвращаются в такую погоду, и всё же смотрела на воду, ожидая увидеть знакомый силуэт.",
  "Сосед принёс хлеб и остановился в дверях. Они долго говорили о простых вещах: о дожде, о саде, о том, когда снова откроется почта. От этих слов становилось спокойнее. Иногда достаточно знать, что кто-то живёт по другую сторону забора.",
  "В ящике под картами нашлась тетрадь. На первой странице был нарисован остров, которого она не помнила ни на одной карте. Дальше шли даты и короткие записи. Лида перевернула лист, затем ещё один. Оказалось, у этой истории было совсем другое начало.",
  "На рассвете они вышли к воде. Лида сняла ботинки и ступила на холодный песок. Ничего не закончилось и ничего ещё не было решено, но горизонт снова казался открытым. Она подумала, что можно остаться. Хотя бы до следующей весны.",
];
export const sampleBook: Book = {
  title: "Там, где начинается море",
  author: "Демонстрационная история",
  format: "SAMPLE",
  demo: true,
  text: normalize(
    Array.from(
      { length: 1800 },
      (_, i) => passages[Math.floor(i / 300) % passages.length],
    ).join("\n\n"),
  ),
};
export function buildExport(book: Book, mode: Mode, segments: Segment[]) {
  return {
    schema: "xbook.emotions.v1",
    book: {
      title: book.title,
      author: book.author,
      format: book.format,
      demo: !!book.demo,
    },
    segmentation: {
      version: 1,
      mode,
      maxCharacters: PAGE_CHARS,
      offsets: "UTF-16, normalized NFC text, end exclusive",
    },
    normalization:
      "NFC, LF, collapsed horizontal whitespace, at most two newlines, trim",
    rubricVersion: "emotions-v1",
    status: segments.every((s) => s.scores)
      ? "complete"
      : segments.some((s) => s.scores)
        ? "partial"
        : "not-analyzed",
    scoreMeaning: "Independent intensity 0–1, not probabilities or shares",
    segments,
  };
}

export type WeightedRect = {
  id: string;
  value: number;
  x: number;
  y: number;
  width: number;
  height: number;
};
// Binary treemap: rectangle area is exactly proportional to the supplied weight.
export function treemap(
  items: { id: string; value: number }[],
  x = 0,
  y = 0,
  width = 100,
  height = 100,
): WeightedRect[] {
  const positive = items
    .filter((i) => i.value > 0)
    .sort((a, b) => b.value - a.value);
  if (!positive.length) return [];
  if (positive.length === 1) return [{ ...positive[0], x, y, width, height }];
  const total = positive.reduce((sum, i) => sum + i.value, 0);
  let split = 1,
    subtotal = positive[0].value;
  while (
    split < positive.length - 1 &&
    Math.abs(subtotal + positive[split].value - total / 2) <
      Math.abs(subtotal - total / 2)
  )
    subtotal += positive[split++].value;
  const fraction = subtotal / total;
  return width >= height
    ? [
        ...treemap(positive.slice(0, split), x, y, width * fraction, height),
        ...treemap(
          positive.slice(split),
          x + width * fraction,
          y,
          width * (1 - fraction),
          height,
        ),
      ]
    : [
        ...treemap(positive.slice(0, split), x, y, width, height * fraction),
        ...treemap(
          positive.slice(split),
          x,
          y + height * fraction,
          width,
          height * (1 - fraction),
        ),
      ];
}
