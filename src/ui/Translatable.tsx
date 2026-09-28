// A Russian quote with an English translation on demand (English UI only). The browser never sends the text: it names
// the quote by reference (see server/translate.ts), and every quote asked for within ~30 ms goes in one request.
import { useEffect, useState, useSyncExternalStore, type KeyboardEvent, type MouseEvent } from "react";
import { useLang, useT } from "../i18n/index.ts";
import "./translatable.css";

const T = {
  en: { en: "EN", ru: "RU", wait: "EN…", toEn: "Show an English translation", toRu: "Show the Russian original", failed: "Translation unavailable. Click to try again." },
  ru: { en: "EN", ru: "RU", wait: "EN…", toEn: "Показать перевод на английский", toRu: "Показать оригинал", failed: "Перевод недоступен. Нажмите, чтобы повторить." },
};

type Entry = { status: "pending" } | { status: "done"; en: string } | { status: "error"; error: string };

const MAX_REFS = 25;
const DEBOUNCE_MS = 30;
const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
const queue = new Set<string>();
let timer: ReturnType<typeof setTimeout> | undefined;

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const set = (ref: string, e: Entry) => entries.set(ref, e);
const emit = () => listeners.forEach((l) => l());

async function send(refs: string[]) {
  let body: { translations?: Record<string, string>; missing?: string[]; error?: string } = {};
  try {
    const r = await fetch("/api/corpus/translate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refs }) });
    body = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
    if (!r.ok && !body.error) body.error = `HTTP ${r.status}`;
  } catch {
    body = { error: "offline" };
  }
  for (const ref of refs) {
    const en = body.translations?.[ref];
    set(ref, en ? { status: "done", en } : { status: "error", error: body.missing?.includes(ref) ? "missing" : (body.error ?? "missing") });
  }
  emit();
}

function flush() {
  timer = undefined;
  const refs = [...queue];
  queue.clear();
  for (let i = 0; i < refs.length; i += MAX_REFS) void send(refs.slice(i, i + MAX_REFS));
}

/** Asks for a translation unless it is known or on its way; failed ones are asked again. */
function request(ref: string) {
  const e = entries.get(ref);
  if (e && e.status !== "error") return;
  set(ref, { status: "pending" });
  queue.add(ref);
  timer ??= setTimeout(flush, DEBOUNCE_MS);
  emit();
}

// "Every quote in English": one remembered switch for lists, e.g. the Quotes tab. A quote's own toggle still overrides it.
const ALL = "pelevindb.translate.all";
let all = (() => {
  try {
    return localStorage.getItem(ALL) === "1";
  } catch {
    return false;
  }
})();
export function setTranslateAll(next: boolean) {
  all = next;
  try {
    localStorage.setItem(ALL, next ? "1" : "0");
  } catch {
    /* storage is a convenience only */
  }
  emit();
}
export const useTranslateAll = () => useSyncExternalStore(subscribe, () => all, () => false);

type Props = {
  /** The Russian quote exactly as the server sent it. */
  text: string;
  /** The server's reference for it: `t:<book>:<page>` (showcase) or `l:<book>:<page>:<n>` (Lines). */
  refKey: string;
  className?: string;
  /** English UI: translate at once and show English first (landing quotes are pre-translated on the server). */
  auto?: boolean;
};

/** Renders `<q>`: the original in Russian mode; in English mode, the original or its translation with a quiet toggle. */
export function Translatable({ text, refKey, className, auto = false }: Props) {
  const lang = useLang();
  const t = useT(T);
  const entry = useSyncExternalStore(subscribe, () => entries.get(refKey), () => undefined);
  const everything = useTranslateAll();
  const [own, setWant] = useState<boolean | null>(null);
  const want = own ?? (auto || everything);
  useEffect(() => {
    if (lang === "en" && want) request(refKey);
  }, [lang, want, refKey]);

  if (lang !== "en")
    return (
      <q className={className} lang="ru">
        {text}
      </q>
    );

  const showEn = want && entry?.status === "done";
  const pending = want && entry?.status === "pending";
  const failed = want && entry?.status === "error";
  const toggle = (e: MouseEvent | KeyboardEvent) => {
    // The quote sits inside a link: the toggle must not follow it.
    e.preventDefault();
    e.stopPropagation();
    if (failed) request(refKey);
    else setWant(!want);
  };
  return (
    <span className="tr">
      <q className={`${className ?? ""} tr-q`} lang={showEn ? "en" : "ru"}>
        {showEn ? entry.en : text}
      </q>{" "}
      <span
        role="button"
        tabIndex={0}
        className="tr-toggle"
        data-state={failed ? "error" : pending ? "pending" : undefined}
        aria-pressed={showEn}
        title={failed ? t.failed : showEn ? t.toRu : t.toEn}
        aria-label={failed ? t.failed : showEn ? t.toRu : t.toEn}
        onClick={toggle}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && toggle(e)}
      >
        {pending ? t.wait : showEn ? t.ru : t.en}
      </span>
    </span>
  );
}
