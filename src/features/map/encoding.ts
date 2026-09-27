// Data colours for map nodes when they encode publication decade or kind of work. Mid-tone values that
// read on both the paper and the dark theme.
import type { BookKind } from "../../../shared/types.ts";

export const KIND_COLORS: Record<BookKind, string> = {
  novel: "#2f8fd8",
  novella: "#17998a",
  story: "#c99400",
  essay: "#d6589a",
  interview: "#8e5cd0",
};

/** Decades from the 1980s to the 2020s, cool to warm. */
export const DECADES = [1980, 1990, 2000, 2010, 2020] as const;
const DECADE_COLORS = ["#4a5fd0", "#17998a", "#74ad3c", "#c99400", "#d93b30"];

export const decadeOf = (year: number) => Math.max(DECADES[0], Math.min(DECADES[DECADES.length - 1], Math.floor(year / 10) * 10));
export const decadeColor = (year: number) => DECADE_COLORS[DECADES.indexOf(decadeOf(year) as (typeof DECADES)[number])];

export const KIND_LABELS: Record<BookKind, { en: string; ru: string }> = {
  novel: { en: "Novel", ru: "Роман" },
  novella: { en: "Novella", ru: "Повесть" },
  story: { en: "Story", ru: "Рассказ" },
  essay: { en: "Essay", ru: "Эссе" },
  interview: { en: "Interview", ru: "Интервью" },
};
