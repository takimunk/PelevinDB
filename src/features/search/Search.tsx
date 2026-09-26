import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { CatalogHit } from "../../../shared/types.ts";
import {
  importCatalog,
  openFilePicker,
  useImportState,
} from "../../app/importer.ts";
import { navigate } from "../../app/router.ts";
import { api } from "../../services/api.ts";
import { useLibrary } from "../../storage/library.ts";
import { useCorpusList } from "../../storage/corpus.ts";
import { useAtlas } from "../../storage/atlas.ts";
import "./search.css";

type Item =
  | { kind: "library"; id: string; title: string; author: string; note: string }
  | { kind: "atlas" | "canon"; id: string; title: string; author: string; note: string }
  | {
      kind: "catalog";
      hit: CatalogHit;
      title: string;
      author: string;
      note: string;
    }
  | { kind: "upload"; title: string; author: string; note: string };

const TAG: Record<Item["kind"], string> = {
  library: "LIB",
  atlas: "MAP",
  canon: "CAN",
  catalog: "PG ",
  upload: "UPL",
};
const norm = (s: string) => s.toLocaleLowerCase().replace(/ё/g, "е");

export function Search({
  autoFocus = false,
  initialQuery = "",
  placeholder = "title, author or theme",
  onDone,
}: {
  autoFocus?: boolean;
  initialQuery?: string;
  placeholder?: string;
  onDone?: () => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [open, setOpen] = useState(!!initialQuery);
  const [active, setActive] = useState(0);
  const [catalog, setCatalog] = useState<{
    q: string;
    hits: CatalogHit[];
    loading: boolean;
    error?: string;
  }>({ q: "", hits: [], loading: false });
  const { books } = useLibrary();
  const atlas = useAtlas();
  const canon = useCorpusList();
  const importing = useImportState();
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const q = query.trim();

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    if (q.length < 3) {
      setCatalog({ q, hits: [], loading: false });
      return;
    }
    const controller = new AbortController();
    setCatalog((c) => ({ ...c, loading: true, error: undefined }));
    const timer = setTimeout(() => {
      api
        .search(q, controller.signal)
        .then(({ hits }) => setCatalog({ q, hits, loading: false }))
        .catch(
          (e) =>
            !controller.signal.aborted &&
            setCatalog({ q, hits: [], loading: false, error: e.message }),
        );
    }, 450);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q]);

  const items = useMemo<Item[]>(() => {
    const n = norm(q);
    const match = (title: string, author: string) =>
      !n || norm(title).includes(n) || norm(author).includes(n);
    const own = books
      .filter((b) => match(b.title, b.author))
      .slice(0, n ? 6 : 4)
      .map((b) => ({
        kind: "library" as const,
        id: b.id,
        title: b.title,
        author: b.author,
        note: `${Math.round((b.analyzed / Math.max(1, b.pages)) * 100)}%`,
      }));
    const full = new Map(canon?.books.map((c) => [c.id, c]));
    const ref = n
      ? atlas
          .filter((a) => match(a.title, a.author))
          .slice(0, 4)
          .map((a) => {
            const c = full.get(a.id);
            return {
              kind: c ? ("canon" as const) : ("atlas" as const),
              id: a.id,
              title: a.title,
              author: a.author,
              note: c ? `${c.pages}p` : "map",
            };
          })
      : [];
    const remote = catalog.hits.map((hit) => ({
      kind: "catalog" as const,
      hit,
      title: hit.title,
      author: hit.author,
      note: `#${hit.id}`,
    }));
    return [
      ...own,
      ...ref,
      ...remote,
      {
        kind: "upload",
        title: "upload a file",
        author: "epub · fb2 · txt · md, up to 20 MB",
        note: "u",
      },
    ];
  }, [q, books, atlas, canon, catalog.hits]);

  const choose = (item: Item) => {
    setOpen(false);
    onDone?.();
    if (item.kind === "library" || item.kind === "canon") navigate(`/book/${item.id}`);
    else if (item.kind === "atlas") navigate(`/map?focus=${item.id}`);
    else if (item.kind === "catalog") void importCatalog(item.hit);
    else openFilePicker();
  };

  const status = importing.busy
    ? importing.busy
    : catalog.loading
      ? "querying project gutenberg"
      : q.length >= 3
        ? (catalog.error ?? `${catalog.hits.length} hits in project gutenberg`)
        : q.length
          ? "type 3+ chars to query gutenberg"
          : "enter ↵ open · ↑↓ move · esc close";

  return (
    <div
      className="search"
      onBlur={(e) =>
        !e.currentTarget.contains(e.relatedTarget) && setOpen(false)
      }
    >
      <label className="search-field">
        <span className="search-prompt">find</span>
        <input
          ref={inputRef}
          value={query}
          placeholder={placeholder}
          aria-label="Search books"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          spellCheck={false}
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(items.length - 1, a + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === "Enter" && items[active]) {
              e.preventDefault();
              choose(items[active]);
            } else if (e.key === "Escape") setOpen(false);
          }}
        />
      </label>
      {open && (
        <div className="search-results">
          <div id={listId} role="listbox" aria-label="Results">
            {items.map((item, index) => (
              <button
                key={
                  item.kind === "catalog"
                    ? item.hit.id
                    : item.kind === "upload"
                      ? "upload"
                      : item.id
                }
                role="option"
                aria-selected={index === active}
                className={`search-item ${item.kind} ${index === active ? "active" : ""}`}
                onMouseEnter={() => setActive(index)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(item)}
              >
                <span className="search-cursor">
                  {index === active ? ">" : " "}
                </span>
                <span className="search-tag">{TAG[item.kind]}</span>
                <span className="search-text">
                  <b>{item.title}</b>
                  <small>{item.author || "unknown author"}</small>
                </span>
                <span className="search-note">{item.note}</span>
              </button>
            ))}
          </div>
          <div
            className={`search-status ${catalog.loading || importing.busy ? "cursor" : ""}`}
          >
            {status}
          </div>
        </div>
      )}
    </div>
  );
}
