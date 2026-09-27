import { locale } from "../i18n/index.ts";

/** A whole number in the current language: 12,345 in English, 12 345 in Russian. */
export const fmt = (n: number) => new Intl.NumberFormat(locale()).format(Math.round(n));
/** A share as a whole percentage in the current language: 42% / 42 %. */
export const pct = (v: number) => new Intl.NumberFormat(locale(), { style: "percent", maximumFractionDigits: 0 }).format(Number.isFinite(v) ? v : 0);
/** A decimal with fixed digits in the current language: 0.42 / 0,42. */
export const dec = (v: number, digits = 2) => new Intl.NumberFormat(locale(), { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
/** @deprecated English-only; use `plural` from src/i18n for translated counts. */
export const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);
