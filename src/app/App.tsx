import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { BookPage } from "../features/book/BookPage.tsx";
import { HomePage } from "../features/home/HomePage.tsx";
import { LibraryPage } from "../features/library/LibraryPage.tsx";
import { Search } from "../features/search/Search.tsx";
import { initLibrary, useLibrary } from "../storage/library.ts";
import { clearImportError, importFile, openFilePicker, registerPicker, useImportState } from "./importer.ts";
import { href, navigate, useRoute } from "./router.ts";

const MapPage = lazy(() => import("../features/map/MapPage.tsx").then((m) => ({ default: m.MapPage })));

function Palette({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <div className="palette-backdrop" onMouseDown={onClose}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Find book" onMouseDown={(e) => e.stopPropagation()}>
        <Search autoFocus onDone={onClose} />
      </div>
    </div>
  );
}

const typing = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement;
  return t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName);
};

export default function App() {
  const route = useRoute();
  const importing = useImportState();
  const { books } = useLibrary();
  const [palette, setPalette] = useState(false);
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);

  useEffect(() => void initLibrary(), []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
        return;
      }
      if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "/") {
        e.preventDefault();
        setPalette(true);
      } else if (e.key === "1") navigate("/");
      else if (e.key === "2") navigate("/library");
      else if (e.key === "3") navigate("/map");
      else if (e.key === "u") openFilePicker();
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);
  useEffect(() => setPalette(false), [route.name, route.name === "book" ? route.id : ""]);

  const nav = [
    { name: "home", key: "1", label: "Overview", path: "/" },
    { name: "library", key: "2", label: "Library", path: "/library" },
    { name: "map", key: "3", label: "Map", path: "/map" },
  ];
  const analyzed = books.filter((b) => b.analyzed > 0).length;

  return (
    <div
      className={`app route-${route.name}`}
      onDragEnter={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        depth.current++;
        setDragging(true);
      }}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (!depth.current) setDragging(false);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        depth.current = 0;
        setDragging(false);
        void importFile(e.dataTransfer.files[0]);
      }}
    >
      <header className="topbar">
        <a className="brand" href={href("/")} aria-label="xbook home">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <rect x="0" y="0" width="7" height="7" />
            <rect x="9" y="9" width="7" height="7" />
            <rect x="9" y="0" width="3" height="3" />
            <rect x="0" y="12" width="3" height="3" />
          </svg>
          <span className="brand-name">XBOOK</span>
        </a>
        <nav className="nav">
          {nav.map((n) => (
            <a key={n.name} data-key={n.key} href={href(n.path)} className={route.name === n.name ? "on" : ""} aria-current={route.name === n.name ? "page" : undefined}>
              {n.label}
            </a>
          ))}
        </nav>
        <div className="topbar-right">
          <button className="palette-trigger" onClick={() => setPalette(true)}>
            Find book <kbd>/</kbd>
          </button>
          <button className="btn icon palette-icon" aria-label="Find book" onClick={() => setPalette(true)}>
            /
          </button>
          <button className="btn icon" aria-label="Upload book" title="Upload book (u)" onClick={openFilePicker}>
            ↑
          </button>
        </div>
      </header>

      <main className="main">
        {route.name === "home" && <HomePage />}
        {route.name === "library" && <LibraryPage tab={route.tab} params={route.params} />}
        {route.name === "map" && (
          <Suspense fallback={<div className="loading-page">loading map<span className="cursor" /></div>}>
            <MapPage focus={route.focus} />
          </Suspense>
        )}
        {route.name === "book" && <BookPage key={route.id} id={route.id} page={route.page} />}
      </main>

      <footer className="statusline">
        <span>xbook</span>
        <span>
          {books.length} {books.length === 1 ? "book" : "books"} in your library · {analyzed} analysed
        </span>
        <span className="statusline-keys">
          <kbd>/</kbd> find <kbd>u</kbd> upload <kbd>1</kbd>
          <kbd>2</kbd>
          <kbd>3</kbd> go
        </span>
      </footer>

      <input ref={registerPicker} type="file" accept=".epub,.fb2,.txt,.md" hidden onChange={(e) => void importFile(e.target.files?.[0]).finally(() => (e.target.value = ""))} />

      {palette && <Palette onClose={() => setPalette(false)} />}
      {dragging && (
        <div className="drop-overlay" aria-hidden="true">
          <div>
            <b>DROP TO OPEN</b>
            <span>epub · fb2 · txt · md — the text stays local until you run the analysis</span>
          </div>
        </div>
      )}
      {(importing.busy || importing.error) && (
        <div className={`toast ${importing.error ? "error" : ""}`} role={importing.error ? "alert" : "status"}>
          <span>{importing.busy ? <span className="cursor">{importing.busy}</span> : importing.error}</span>
          {importing.error && (
            <button onClick={clearImportError} aria-label="Dismiss">
              [x]
            </button>
          )}
        </div>
      )}
    </div>
  );
}
