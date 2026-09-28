import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { BookPage } from "../features/book/BookPage.tsx";
import { HomePage } from "../features/home/HomePage.tsx";
import { LibraryPage } from "../features/library/LibraryPage.tsx";
import { Search } from "../features/search/Search.tsx";
import { plural, setLang, setTheme, useLang, useT, useThemePref, type ThemePref } from "../i18n/index.ts";
import { initLibrary, useLibrary } from "../storage/library.ts";
import { clearImportError, importFile, openFilePicker, registerPicker, useImportState } from "./importer.ts";
import { useLocalMode } from "../services/mode.ts";
import { href, navigate, useRoute } from "./router.ts";
import { AUTHOR_URL, GitHubMark, REPO_URL, XMark } from "../ui/Social.tsx";
import { ContactButton } from "../ui/Contact.tsx";
import { Wordmark } from "../ui/Wordmark.tsx";

const MapPage = lazy(() => import("../features/map/MapPage.tsx").then((m) => ({ default: m.MapPage })));
const BlogPage = lazy(() => import("../features/blog/BlogPage.tsx").then((m) => ({ default: m.BlogPage })));
const AboutPage = lazy(() => import("../features/blog/AboutPage.tsx").then((m) => ({ default: m.AboutPage })));

const T = {
  en: {
    skip: "Skip to content",
    home: "PelevinDB, home",
    navLabel: "Main navigation",
    nav: { home: "Overview", library: "Library", map: "Map", blog: "Blog", about: "About" },
    search: "Search",
    searchHint: "Search the books",
    closeSearch: "Close search",
    close: "Close",
    upload: "Upload a book",
    uploadTitle: "Upload your own book (u)",
    language: "Language",
    langNames: { en: "English", ru: "Russian" },
    theme: { light: "light", dark: "dark", system: "system" } as Record<ThemePref, string>,
    themeLabel: (now: string, next: string) => `Theme: ${now}. Switch to ${next}`,
    loading: { map: "Loading the map", blog: "Loading the essays", about: "Loading" },
    github: "Source code on GitHub (opens in a new tab)",
    x: "The author on X (opens in a new tab)",
    dropTitle: "Drop the file to open it",
    dropNote: "EPUB, FB2, TXT or Markdown. The text stays in your browser until you start the analysis.",
    working: "Working",
    error: "Error",
    dismiss: "Dismiss",
  },
  ru: {
    skip: "Перейти к содержанию",
    home: "PelevinDB, на главную",
    navLabel: "Основная навигация",
    nav: { home: "Обзор", library: "Библиотека", map: "Карта", blog: "Блог", about: "О проекте" },
    search: "Поиск",
    searchHint: "Искать книги",
    closeSearch: "Закрыть поиск",
    close: "Закрыть",
    upload: "Загрузить книгу",
    uploadTitle: "Загрузить свою книгу (u)",
    language: "Язык",
    langNames: { en: "английский", ru: "русский" },
    theme: { light: "светлая", dark: "тёмная", system: "как в системе" } as Record<ThemePref, string>,
    themeLabel: (now: string, next: string) => `Тема: ${now}. Переключить: ${next}`,
    loading: { map: "Загружаем карту", blog: "Загружаем эссе", about: "Загружаем" },
    github: "Исходный код на GitHub (откроется в новой вкладке)",
    x: "Автор в X (откроется в новой вкладке)",
    dropTitle: "Отпустите файл, чтобы открыть его",
    dropNote: "EPUB, FB2, TXT или Markdown. Текст остаётся в браузере, пока вы не запустите анализ.",
    working: "Работаем",
    error: "Ошибка",
    dismiss: "Закрыть",
  },
};

const NAV = [
  { name: "home", path: "/" },
  { name: "library", path: "/library" },
  { name: "map", path: "/map" },
  { name: "blog", path: "/blog" },
  { name: "about", path: "/about" },
] as const;

const NEXT_THEME: Record<ThemePref, ThemePref> = { system: "light", light: "dark", dark: "system" };

function ThemeIcon({ pref }: { pref: ThemePref }) {
  if (pref === "light")
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
      </svg>
    );
  if (pref === "dark")
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
        <path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10Z" />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
    <circle cx="10.5" cy="10.5" r="6" />
    <path d="m15 15 5.5 5.5" />
  </svg>
);

function Palette({ onClose }: { onClose: () => void }) {
  const t = useT(T);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = overflow;
      previous?.focus({ preventScroll: true });
    };
  }, [onClose]);
  return (
    <div className="palette-backdrop" onMouseDown={onClose}>
      <div className="palette" role="dialog" aria-modal="true" aria-label={t.search} onMouseDown={(e) => e.stopPropagation()}>
        <div className="palette-head">
          <span className="eyebrow">{t.search}</span>
          <button className="btn ghost" aria-label={t.closeSearch} onClick={onClose}>
            {t.close} <kbd>esc</kbd>
          </button>
        </div>
        <Search autoFocus onDone={onClose} />
      </div>
    </div>
  );
}

const typing = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement;
  return t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName);
};

function Loading({ label }: { label: string }) {
  return (
    <div className="loading-page" role="status">
      {label}
    </div>
  );
}

export default function App() {
  const route = useRoute();
  const local = useLocalMode();
  const importing = useImportState();
  const { books } = useLibrary();
  const t = useT(T);
  const lang = useLang();
  const theme = useThemePref();
  const [palette, setPalette] = useState(false);
  const [pastHero, setPastHero] = useState(false);
  useEffect(() => {
    if (route.name !== "home") return;
    const check = () => setPastHero(window.scrollY > window.innerHeight * 0.75);
    check();
    window.addEventListener("scroll", check, { passive: true });
    return () => window.removeEventListener("scroll", check);
  }, [route.name]);
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);

  useEffect(() => {
    if (local) void initLibrary();
  }, [local]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
        return;
      }
      if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      const n = Number(e.key);
      if (e.key === "/") {
        e.preventDefault();
        setPalette(true);
      } else if (Number.isInteger(n) && n >= 1 && n <= NAV.length) navigate(NAV[n - 1].path);
      else if (e.key === "u" && local) openFilePicker();
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [local]);
  const place = route.name === "book" ? route.id : route.name === "blog" ? (route.slug ?? "") : "";
  useEffect(() => {
    setPalette(false);
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [route.name, place]);

  const nextTheme = NEXT_THEME[theme];
  const brandHidden = route.name === "home" && !pastHero;

  return (
    <div
      className={`app route-${route.name}`}
      onDragEnter={(e) => {
        if (!local || !e.dataTransfer.types.includes("Files")) return;
        depth.current++;
        setDragging(true);
      }}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (!depth.current) setDragging(false);
      }}
      onDragOver={(e) => local && e.preventDefault()}
      onDrop={(e) => {
        if (!local) return;
        e.preventDefault();
        depth.current = 0;
        setDragging(false);
        void importFile(e.dataTransfer.files[0]);
      }}
    >
      <a className="skip-link" href="#main" onClick={(e) => (e.preventDefault(), document.getElementById("main")?.focus())}>
        {t.skip}
      </a>
      <header className="topbar">
        {/* Home shows the big logo in its hero, so the header keeps only the slot until the hero scrolls away. */}
        <a
          className={`brand ${brandHidden ? "brand-hidden" : ""}`}
          href={href("/")}
          aria-label={t.home}
          aria-hidden={brandHidden || undefined}
          tabIndex={brandHidden ? -1 : undefined}
        >
          <Wordmark size="header" />
        </a>
        <nav className="nav" aria-label={t.navLabel}>
          {NAV.map((n, i) => (
            <a
              key={n.name}
              href={href(n.path)}
              className={route.name === n.name ? "on" : ""}
              aria-current={route.name === n.name ? "page" : undefined}
              aria-keyshortcuts={String(i + 1)}
            >
              {t.nav[n.name]}
            </a>
          ))}
        </nav>
        <div className="topbar-tools">
          <button className="search-trigger" aria-label={t.searchHint} aria-keyshortcuts="/ Meta+K" onClick={() => setPalette(true)}>
            <SearchIcon />
            <span>{t.searchHint}</span>
            <kbd aria-hidden="true">/</kbd>
          </button>
          {local && (
            <button className="btn icon upload-button" aria-label={t.upload} title={t.uploadTitle} aria-keyshortcuts="u" onClick={openFilePicker}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 14v5h14v-5" />
              </svg>
            </button>
          )}
          <div className="lang-switch" role="group" aria-label={t.language}>
            {(["en", "ru"] as const).map((l) => (
              <button key={l} lang={l} aria-pressed={lang === l} aria-label={t.langNames[l]} title={t.langNames[l]} onClick={() => setLang(l)}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          <button
            className="btn icon theme-toggle"
            aria-label={t.themeLabel(t.theme[theme], t.theme[nextTheme])}
            title={t.themeLabel(t.theme[theme], t.theme[nextTheme])}
            onClick={() => setTheme(nextTheme)}
          >
            <ThemeIcon pref={theme} />
          </button>
          <span className="topbar-social">
            <a className="btn icon" href={REPO_URL} target="_blank" rel="noopener" aria-label={t.github} title={t.github}>
              <GitHubMark />
            </a>
            <a className="btn icon" href={AUTHOR_URL} target="_blank" rel="noopener" aria-label={t.x} title={t.x}>
              <XMark />
            </a>
            <ContactButton variant="icon" />
          </span>
        </div>
      </header>

      <main className="main" id="main" tabIndex={-1}>
        {route.name === "home" && <HomePage />}
        {route.name === "library" && <LibraryPage tab={route.tab} params={route.params} />}
        {route.name === "map" && (
          <Suspense fallback={<Loading label={t.loading.map} />}>
            <MapPage focus={route.focus} initialView={route.view} />
          </Suspense>
        )}
        {route.name === "blog" && (
          <Suspense fallback={<Loading label={t.loading.blog} />}>
            <BlogPage slug={route.slug} />
          </Suspense>
        )}
        {route.name === "about" && (
          <Suspense fallback={<Loading label={t.loading.about} />}>
            <AboutPage />
          </Suspense>
        )}
        {route.name === "book" && <BookPage key={route.id} id={route.id} page={route.page} sentence={route.sentence} />}
      </main>


      {local && <input ref={registerPicker} type="file" accept=".epub,.fb2,.txt,.md" hidden onChange={(e) => void importFile(e.target.files?.[0]).finally(() => (e.target.value = ""))} />}

      {palette && <Palette onClose={() => setPalette(false)} />}
      {local && dragging && (
        <div className="drop-overlay" aria-hidden="true">
          <div>
            <b>{t.dropTitle}</b>
            <span>{t.dropNote}</span>
          </div>
        </div>
      )}
      {local && (importing.busy || importing.error) && (
        <div className={`toast ${importing.error ? "error" : ""}`} role={importing.error ? "alert" : "status"}>
          <span className="toast-label">{importing.error ? t.error : t.working}</span>
          <span className={importing.busy ? "cursor" : undefined}>{importing.busy ?? importing.error}</span>
          {importing.error && (
            <button onClick={clearImportError} aria-label={t.dismiss}>
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                <path d="m4 4 8 8M12 4l-8 8" />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
