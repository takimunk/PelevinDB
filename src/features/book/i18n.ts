// Formatting shared by the book views: page references, numbers and percentages in the interface language.
import { locale, type Lang } from "../../i18n/index.ts";

/** "p.12" / "с. 12"; a range becomes "p.12–14" / "с. 12–14". */
export const pageRef = (lang: Lang, from: number, to?: number) => {
  const span = to != null && to !== from ? `${from}–${to}` : `${from}`;
  return lang === "ru" ? `с. ${span}` : `p.${span}`;
};

const cache = new Map<string, Intl.NumberFormat>();
const formatter = (lang: Lang, digits: number) => {
  const key = `${lang}:${digits}`;
  let f = cache.get(key);
  if (!f) cache.set(key, (f = new Intl.NumberFormat(locale(lang), { minimumFractionDigits: digits, maximumFractionDigits: digits })));
  return f;
};

/** Localised number with fixed decimals: 0.42 → "0.42" / "0,42"; 12345 → "12,345" / "12 345". */
export const num = (lang: Lang, value: number, digits = 0) => formatter(lang, digits).format(digits ? value : Math.round(value));
/** 0.423 → "42%" / "42 %". */
export const pct = (lang: Lang, value: number) => (lang === "ru" ? `${Math.round(value * 100)} %` : `${Math.round(value * 100)}%`);
