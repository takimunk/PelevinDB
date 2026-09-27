// Language (ru/en) and theme (light/dark/system), shared by every view.
// Strings live next to the component that uses them as `{ en: {...}, ru: {...} }` and are read with useT().
import { useSyncExternalStore } from "react";

export type Lang = "en" | "ru";
export type ThemePref = "light" | "dark" | "system";

const LANG_KEY = "pelevindb.lang";
const THEME_KEY = "pelevindb.theme";

const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode: the choice lasts for this page only */
  }
};

const initialLang = (): Lang => {
  const stored = read(LANG_KEY);
  if (stored === "en" || stored === "ru") return stored;
  return typeof navigator !== "undefined" && /^ru\b/i.test(navigator.language) ? "ru" : "en";
};
const initialTheme = (): ThemePref => {
  const stored = read(THEME_KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
};

let lang: Lang = typeof window === "undefined" ? "en" : initialLang();
let theme: ThemePref = typeof window === "undefined" ? "system" : initialTheme();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

const dark = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches;
export const resolvedTheme = (): "light" | "dark" => (theme === "system" ? (dark() ? "dark" : "light") : theme);

function apply() {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.lang = lang;
  root.dataset.theme = resolvedTheme();
  root.style.colorScheme = resolvedTheme();
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", resolvedTheme() === "dark" ? "#0f0f0e" : "#f6f4ef");
}

if (typeof window !== "undefined") {
  apply();
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (theme !== "system") return;
    apply();
    emit();
  });
}

export function setLang(next: Lang) {
  lang = next;
  write(LANG_KEY, next);
  apply();
  emit();
}
export function setTheme(next: ThemePref) {
  theme = next;
  write(THEME_KEY, next);
  apply();
  emit();
}
export const getLang = () => lang;

export const useLang = () => useSyncExternalStore(subscribe, () => lang, () => "en" as Lang);
export const useThemePref = () => useSyncExternalStore(subscribe, () => theme, () => "system" as ThemePref);
/** The theme actually on screen, for canvases that must pick colours in JS. */
export const useTheme = () => useSyncExternalStore(subscribe, resolvedTheme, () => "light" as const);

/** Picks the current language's half of a `{ en, ru }` dictionary. Both halves must have the same keys. */
export function useT<T>(dict: { en: T; ru: T }): T {
  return dict[useLang()];
}

/** For a single inline string: `tr({ en: "Map", ru: "Карта" })`. */
export const tr = (s: { en: string; ru: string }, l: Lang = lang) => s[l];

export const locale = (l: Lang = lang) => (l === "ru" ? "ru-RU" : "en-GB");

/** Russian plural forms: plural(n, ["книга", "книги", "книг"]). English: plural(n, ["book", "books"]). */
export function plural(n: number, forms: [string, string] | [string, string, string]) {
  if (forms.length === 2) return n === 1 ? forms[0] : forms[1];
  const a = Math.abs(n) % 100,
    b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}
