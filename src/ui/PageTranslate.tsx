// The reader's "Translate page" (English UI, corpus pages only): the page's English from POST /api/corpus/translate
// with a `p:<book>:<page>` reference, sentence by sentence along the page's spans, so the reader shows it through the
// same SentenceText (highlights, lens, pointed sentence) with English in place of each sentence. The server allows each reader PAGE_LIMIT different pages a day; the button
// mirrors what is left (GET /api/corpus/translate/quota) and turns quiet at 0.
import { useEffect, useState, useSyncExternalStore } from "react";
import { useT } from "../i18n/index.ts";
import "./translatable.css";

const T = {
  en: {
    translate: "Translate page",
    left: (n: number) => `${n} left`,
    original: "Original",
    translation: "Translation",
    working: "Translating…",
    toEn: "Show this page in English (machine translation)",
    toRu: "Show the Russian original",
    note: "Machine translation, sentence by sentence; the highlights are those of the Russian original.",
    limit: "You have translated 10 pages today, the daily limit. The originals stay readable; translation comes back within 24 hours.",
    failed: (e: string) => `Could not translate this page: ${e}`,
  },
  ru: {
    translate: "Перевести страницу",
    left: (n: number) => `осталось ${n}`,
    original: "Оригинал",
    translation: "Перевод",
    working: "Переводим…",
    toEn: "Показать страницу по-английски (машинный перевод)",
    toRu: "Показать русский оригинал",
    note: "Машинный перевод по предложениям; подсветка — по русскому оригиналу.",
    limit: "Вы перевели 10 страниц за сутки — это предел. Оригиналы по-прежнему доступны; перевод вернётся в течение 24 часов.",
    failed: (e: string) => `Не удалось перевести страницу: ${e}`,
  },
};

// What this browser knows: pages translated in this session and the server's count of pages left today.
const pages = new Map<string, { status: "pending" } | { status: "done"; en: string[] } | { status: "error"; error: string }>();
let remaining: number | null = null;
let quotaAsked = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const useRemaining = () => useSyncExternalStore(subscribe, () => remaining, () => null);

function askQuota() {
  if (quotaAsked) return;
  quotaAsked = true;
  fetch("/api/corpus/translate/quota")
    .then((r) => (r.ok ? r.json() : null))
    .then((q: { remaining?: number } | null) => {
      if (typeof q?.remaining === "number") (remaining = q.remaining), emit();
    })
    .catch(() => (quotaAsked = false));
}

async function translatePage(ref: string) {
  pages.set(ref, { status: "pending" });
  emit();
  try {
    const r = await fetch("/api/corpus/translate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refs: [ref] }) });
    const body = (await r.json().catch(() => ({}))) as { pages?: Record<string, string[]>; remaining?: number; error?: string };
    if (typeof body.remaining === "number") remaining = body.remaining;
    const en = body.pages?.[ref];
    pages.set(ref, en ? { status: "done", en } : { status: "error", error: body.error ?? (r.ok ? "no translation came back" : `HTTP ${r.status}`) });
  } catch {
    pages.set(ref, { status: "error", error: "offline" });
  }
  emit();
}

export type PageTranslation = ReturnType<typeof usePageTranslation>;

/** State for one reader page; `enabled` only in the English UI with the page's text and sentence spans on screen. */
export function usePageTranslation(bookId: string, page: number, enabled: boolean) {
  const ref = `p:${bookId}:${page}`;
  const entry = useSyncExternalStore(subscribe, () => pages.get(ref), () => undefined);
  const left = useRemaining();
  const [showing, setShowing] = useState(false);
  useEffect(() => setShowing(false), [ref]);
  useEffect(() => {
    if (enabled) askQuota();
  }, [enabled]);
  const done = entry?.status === "done";
  return {
    enabled,
    ref,
    entry,
    left,
    /** The English is on screen. */
    showing: enabled && showing && done,
    /** English per sentence index, while it is on screen. */
    display: enabled && showing && entry?.status === "done" ? entry.en : undefined,
    toggle() {
      if (done) return setShowing(!showing);
      if (entry?.status === "pending" || left === 0) return;
      setShowing(true);
      void translatePage(ref);
    },
  };
}

/** The reader-header button: "Translate page · N left", then Original / Translation. */
export function TranslatePageButton({ tr }: { tr: PageTranslation }) {
  const t = useT(T);
  if (!tr.enabled) return null;
  const done = tr.entry?.status === "done";
  const pending = tr.entry?.status === "pending";
  const out = !done && tr.left === 0;
  return (
    <button
      className="btn small ghost tr-page-btn"
      disabled={pending || out}
      aria-pressed={done ? tr.showing : undefined}
      title={tr.showing ? t.toRu : t.toEn}
      onClick={tr.toggle}
    >
      {pending ? t.working : done ? (tr.showing ? t.original : t.translation) : tr.left == null ? t.translate : `${t.translate} · ${t.left(tr.left)}`}
    </button>
  );
}

/** A calm line above the text: what the English is, the daily limit, or an error. Nothing otherwise. */
export function PageTranslationNote({ tr }: { tr: PageTranslation }) {
  const t = useT(T);
  if (!tr.enabled) return null;
  const text = tr.showing
    ? t.note
    : tr.entry?.status === "error"
      ? tr.left === 0
        ? t.limit
        : t.failed(tr.entry.error)
      : tr.entry?.status !== "done" && tr.left === 0
        ? t.limit
        : null;
  return text ? (
    <span className="tr-page-note" role="status">
      {text}
    </span>
  ) : null;
}
