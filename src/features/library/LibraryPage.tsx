import { useMemo, useState } from "react";
import { openFilePicker } from "../../app/importer.ts";
import { navigate } from "../../app/router.ts";
import { useCanonShelf } from "../../storage/corpus.ts";
import { useLibrary } from "../../storage/library.ts";
import { fmt, plural } from "../../ui/format.ts";
import { Search } from "../search/Search.tsx";
import { BookTable } from "./BookTable.tsx";
import { CanonTable } from "./CanonTable.tsx";
import { applyShelf, column, FACETS, facetCounts, LENSES, ranges, readState, VIEWS, writeState, type ShelfState, type ViewId } from "./shelf.ts";
import "./library.css";

const SORTS = {
  recent: { label: "recent", fn: () => 0 },
  title: { label: "title", fn: (a: { title: string }, b: { title: string }) => a.title.localeCompare(b.title) },
  length: { label: "size", fn: (a: { chars: number }, b: { chars: number }) => b.chars - a.chars },
} as const;

function CanonShelf({ params }: { params: Record<string, string> }) {
  const [showFilters, setShowFilters] = useState(false);
  const { available, rows } = useCanonShelf();
  const state = readState(params);
  const key = writeState(state);
  const set = (next: Partial<ShelfState>) => {
    const qs = writeState({ ...state, ...next });
    navigate(qs ? `/library?${qs}` : "/library", { replace: true });
  };
  const all = useMemo(() => rows ?? [], [rows]);
  const shown = useMemo(() => applyShelf(all, readState(params)), [all, key]);
  const scale = useMemo(() => ranges(all), [all]);
  const filtered = !!(state.q || state.lens || Object.keys(state.facets).length);

  if (available === false)
    return (
      <div className="library-empty">
        <p>
          <span className="warn">No canon yet.</span> Run <code>npm run corpus</code> to read the ranked canon into the server store.
        </p>
      </div>
    );

  const sort = (id: string) => {
    const col = column(id)!;
    set(state.sort === id ? { dir: -state.dir as 1 | -1 } : { sort: id, dir: col.score ? -1 : 1 });
  };
  return (
    <>
      <div className="shelf-tools">
        <label className="library-grep">
          <span>find</span>
          <input value={state.q} onChange={(e) => set({ q: e.target.value })} placeholder="title or author" aria-label="Filter library" />
        </label>
        <div className="presets shelf-views" role="group" aria-label="Columns">
          {(Object.keys(VIEWS) as ViewId[]).map((v) => (
            <button key={v} className={state.view === v ? "on" : ""} aria-pressed={state.view === v} onClick={() => set({ view: v })}>
              {VIEWS[v].label}
            </button>
          ))}
        </div>
      </div>
      <button className="btn shelf-filter-toggle" aria-expanded={showFilters} aria-controls="shelf-refinements" onClick={() => setShowFilters(!showFilters)}>
        {showFilters ? "Hide filters" : "Filters"} · {shown.length} books{filtered ? " · active" : ""}
      </button>
      <div id="shelf-refinements" className={`shelf-refinements ${showFilters ? "expanded" : ""}`}>
        <div className="shelf-filters">
          {FACETS.map((f) => (
            <label key={f} className={state.facets[f] ? "on" : ""}>
              <span>{column(f)!.label}</span>
              <select value={state.facets[f] ?? ""} onChange={(e) => set({ facets: { ...state.facets, [f]: e.target.value || undefined } })} aria-label={`Filter by ${column(f)!.label}`}>
                <option value="">any</option>
                {facetCounts(all, f).map(([v, n]) => (
                  <option key={v} value={v}>
                    {v} ({n})
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <div className="shelf-lenses" role="group" aria-label="Quick filters">
          {LENSES.map((l) => (
            <button key={l.id} className={state.lens === l.id ? "on" : ""} aria-pressed={state.lens === l.id} title={l.hint} onClick={() => set({ lens: state.lens === l.id ? null : l.id })}>
              {l.label} <small>{all.filter(l.test).length}</small>
            </button>
          ))}
          <span className="shelf-count">
            {shown.length === all.length ? `${all.length} books` : `${shown.length} of ${all.length} books`}
            {filtered && (
              <button className="link" onClick={() => set({ q: "", lens: null, facets: {} })}>
                clear filters
              </button>
            )}
          </span>
        </div>
      </div>
      <CanonTable rows={shown} state={state} ranges={scale} onSort={sort} />
      <p className="shelf-note dim">
        Scores are 0–1 means of Jev's answers over every page of the book. Shading runs from the lowest to the highest value on the shelf: red columns are feel, blue are craft, green are the
        whole-book profile. Hover a header for what it measures.
      </p>
    </>
  );
}

export function LibraryPage({ tab = "canon", params = {} }: { tab?: "mine" | "canon"; params?: Record<string, string> }) {
  const { books, ready } = useLibrary();
  const { rows } = useCanonShelf();
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<keyof typeof SORTS>("recent");
  const shown = useMemo(() => {
    const q = filter.toLowerCase();
    return books.filter((b) => !q || (b.title + " " + b.author).toLowerCase().includes(q)).sort(SORTS[sort].fn);
  }, [books, filter, sort]);
  const chars = books.reduce((s, b) => s + b.chars, 0);
  const read = rows?.filter((b) => b.complete).length ?? 0;
  return (
    <div className="library-page">
      <header className="page-head">
        <div>
          <div className="eyebrow">library</div>
          {tab === "canon" ? (
            <h1>
              Canon{" "}
              <span className="dim">
                · {rows?.length ?? 0} {plural(rows?.length ?? 0, "book")} · {read} read in full by Jev
              </span>
            </h1>
          ) : (
            <h1>
              Your books{" "}
              <span className="dim">
                · {books.length} · {fmt(chars)} characters
              </span>
            </h1>
          )}
        </div>
        <button className="btn primary" onClick={openFilePicker}>
          upload book
        </button>
      </header>
      <div className="presets shelf-tabs" role="group" aria-label="Shelf">
        <button className={tab === "canon" ? "on" : ""} aria-pressed={tab === "canon"} onClick={() => navigate("/library", { replace: true })}>
          canon
        </button>
        <button className={tab === "mine" ? "on" : ""} aria-pressed={tab === "mine"} onClick={() => navigate("/library?tab=mine", { replace: true })}>
          your books
        </button>
      </div>
      {tab === "canon" ? (
        <CanonShelf params={params} />
      ) : (
        <>
          <div className="library-tools">
            <label className="library-grep">
              <span>find</span>
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="title or author" aria-label="Filter library" />
            </label>
            <div className="presets" role="group" aria-label="Sort">
              {(Object.keys(SORTS) as (keyof typeof SORTS)[]).map((key) => (
                <button key={key} className={sort === key ? "on" : ""} aria-pressed={sort === key} onClick={() => setSort(key)}>
                  {SORTS[key].label}
                </button>
              ))}
            </div>
          </div>
          {ready && !books.length ? (
            <div className="library-empty">
              <p>Find a public-domain book or upload your own.</p>
              <Search />
            </div>
          ) : (
            <BookTable books={shown} />
          )}
        </>
      )}
    </div>
  );
}
