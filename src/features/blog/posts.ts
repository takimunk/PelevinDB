// Blog registry. Each post is a lazily loaded component, so the index costs nothing but this list.
import { lazy, type ComponentType, type LazyExoticComponent } from "react";

export interface Post {
  slug: string;
  date: string; // ISO yyyy-mm-dd
  title: { en: string; ru: string };
  dek: { en: string; ru: string };
  minutes: { en: number; ru: number };
  tags: { en: string[]; ru: string[] };
  Component: LazyExoticComponent<ComponentType>;
}

export const POSTS: Post[] = [
  {
    slug: "image-to-idea",
    date: "2026-09-28",
    title: {
      en: "From image to idea: what 8,186 pages say about how Pelevin changed",
      ru: "От образа к идее: что 8186 страниц говорят о том, как менялся Пелевин",
    },
    dek: {
      en: "A model answered 36 questions about every page of Pelevin’s fiction and then reread it sentence by sentence. Across thirty-seven years the pictures thin out, the ideas take over and the narrator steps forward — while the jokes stay exactly where they were. Tested, with figures you can play with.",
      ru: "Модель ответила на 36 вопросов о каждой странице прозы Пелевина, а потом перечитала её по фразам. За тридцать семь лет картинки редеют, идеи берут верх, рассказчик выходит вперёд — а шутки остаются ровно на месте. С проверкой статистикой и живыми графиками.",
    },
    minutes: { en: 16, ru: 16 },
    tags: { en: ["Jev", "style over time", "statistics"], ru: ["Jev", "стиль во времени", "статистика"] },
    Component: lazy(() => import("./jev/JevPost.tsx")),
  },
  {
    slug: "eda",
    date: "2026-09-27",
    title: {
      en: "Reading Pelevin by numbers: a first look at 30 years of prose",
      ru: "Пелевин в цифрах: первый взгляд на тридцать лет прозы",
    },
    dek: {
      en: "Before a model reads every page, we count. Sentence lengths, lexical richness, the rise and fall of words, semantic fields and a map of the books by vocabulary — with charts you can play with.",
      ru: "Прежде чем модель прочтёт каждую страницу, мы считаем. Длина фраз, богатство словаря, взлёты и падения слов, семантические поля и карта книг по лексике — с графиками, которые можно крутить.",
    },
    minutes: { en: 14, ru: 14 },
    tags: { en: ["exploratory analysis", "corpus", "style"], ru: ["разведочный анализ", "корпус", "стиль"] },
    Component: lazy(() => import("./eda/EdaPost.tsx")),
  },
];

export const findPost = (slug: string) => POSTS.find((p) => p.slug === slug);
