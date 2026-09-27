import { useMemo, useState } from "react";
import { EMOTIONS, MOODS, THEMES } from "../../../shared/catalog.ts";
import { ARC_SHAPES, argmax, topEntries } from "../../domain/analysis.ts";
import { ALL_FEATURES, DEFAULT_WEIGHTS, FEATURE_GROUPS, fingerprintValues, WEIGHT_PRESETS, type Weights } from "../../domain/fingerprint.ts";
import { findRegions } from "../../domain/clusters.ts";
import { neighbours } from "../../domain/pca.ts";
import { navigate } from "../../app/router.ts";
import { bar } from "../../ui/ascii.ts";
import { GroupLegend, PixelStrip } from "../../ui/PixelStrip.tsx";
import { Search } from "../search/Search.tsx";
import { axisOptions, buildAxis, DEFAULT_AXES, placeStars, type AxisChoice } from "./axes.ts";
import { MAP_PRESETS, matchPreset, type MapPreset } from "./presets.ts";
import { BookGraph, regionColor, type GraphMode } from "./BookGraph.tsx";
import { starPath, useCorpus, useEmbedding, type Star } from "./corpus.ts";
import "./map.css";

const canonLabel = (c: NonNullable<Star["canon"]>) => (c.complete ? `canon · jev read all ${c.pages} pages` : `canon · jev read ${c.analysed}/${c.pages} pages`);
const glyph = (s: Star) => (s.kind === "library" ? "■" : s.canon?.complete ? "▣" : "□");

function StarCard({
  star,
  similar,
  region,
  onClose,
  onPick,
}: {
  star: Star;
  similar: { star: Star; similarity: number }[];
  region?: { name: string; color: string };
  onClose: () => void;
  onPick: (id: string) => void;
}) {
  const fp = star.fingerprint;
  const mood = MOODS.find((m) => m.id === argmax(fp.mood))!;
  const lead = EMOTIONS.find((e) => e.id === argmax(fp.emotions))!;
  const themes = topEntries(fp.themes, 4).map(([id]) => THEMES.find((t) => t.id === id)!.label.toLowerCase());
  const arc = ARC_SHAPES.find((a) => a.id === fp.arcShape);
  const [finding, setFinding] = useState(false);
  return (
    <aside className="star-card" aria-label={star.title}>
      <header className="star-card-top">
        <span>{star.kind === "library" ? "your book" : star.canon ? canonLabel(star.canon) : `atlas · jev · ${star.pagesRead ?? "?"} sampled pages`}</span>
        <button onClick={onClose} aria-label="Close card">
          [x]
        </button>
      </header>
      <h2>{star.title}</h2>
      <p className="star-card-author">{star.author}</p>
      <dl className="star-card-facts">
        {region && (
          <div>
            <dt>region</dt>
            <dd style={{ color: region.color }}>{region.name.toLowerCase()}</dd>
          </div>
        )}
        <div>
          <dt>emotion</dt>
          <dd style={{ color: lead.color }}>{lead.label.toLowerCase()}</dd>
        </div>
        <div>
          <dt>mood</dt>
          <dd style={{ color: mood.color }}>{mood.label.toLowerCase()}</dd>
        </div>
        <div>
          <dt>pace</dt>
          <dd>{bar(fp.texture.pace, 10, "█", "·")}</dd>
        </div>
        <div>
          <dt>tension</dt>
          <dd>{bar(fp.texture.tension, 10, "█", "·")}</dd>
        </div>
        <div>
          <dt>themes</dt>
          <dd>{themes.join(", ")}</dd>
        </div>
        <div>
          <dt>arc</dt>
          <dd>{arc?.label.toLowerCase() ?? "flat line"}</dd>
        </div>
      </dl>
      <PixelStrip values={fingerprintValues(fp)} size={7} label="fingerprint coordinates" />
      <div className="star-card-near">
        <span className="eyebrow">nearest</span>
        {similar.map((n) => (
          <button key={n.star.id} onClick={() => onPick(n.star.id)}>
            <em>{String(Math.round(Math.max(0, n.similarity) * 100)).padStart(3)}</em> {n.star.title}
          </button>
        ))}
      </div>
      {star.kind === "library" || star.canon ? (
        <button className="btn primary full" onClick={() => navigate(starPath(star))}>
          {star.canon ? "open book" : "open dashboard"} →
        </button>
      ) : finding ? (
        <Search initialQuery={star.title} autoFocus placeholder="search project gutenberg" />
      ) : (
        <button className="btn ghost full" onClick={() => setFinding(true)}>
          fetch text from project gutenberg
        </button>
      )}
    </aside>
  );
}

export function MapPage({ focus }: { focus?: string }) {
  const [weights, setWeights] = useState<Weights>(DEFAULT_WEIGHTS);
  const [includeAtlas, setIncludeAtlas] = useState(true);
  const [labels, setLabels] = useState(false);
  const [threads, setThreads] = useState(true);
  const [showRegions, setShowRegions] = useState(true);
  const [filter, setFilter] = useState("");
  const [mode, setMode] = useState<GraphMode>("3d");
  const [axisChoice, setAxisChoice] = useState<AxisChoice[]>(DEFAULT_AXES);
  const selected = focus ?? null;
  const stars = useCorpus({ includeAtlas });
  const embedding = useEmbedding(stars, weights);
  const byId = useMemo(() => new Map(stars.map((s) => [s.id, s])), [stars]);
  const axes = useMemo(() => axisChoice.map((c) => buildAxis(c, stars, embedding)), [axisChoice, stars, embedding]);
  const options = useMemo(() => axisOptions(embedding), [embedding]);
  const dims = mode === "2d" ? 2 : 3;
  const coords = useMemo(() => placeStars(stars.map((s) => s.id), axes, dims), [stars, axes, dims]);
  const regions = useMemo(() => findRegions(stars, coords, { weights, axes: axisChoice.slice(0, dims) }), [stars, coords, weights, axisChoice, dims]);
  const select = (id: string | null) => navigate(id ? `/map?focus=${id}` : "/map", { replace: true });
  const current = selected ? byId.get(selected) : undefined;
  const currentRegion = current && showRegions ? regions.findIndex((r) => r.members.includes(current.id)) : -1;
  const similar = current ? neighbours(embedding.rows, current.id, 5).flatMap((n) => (byId.has(n.id) ? [{ star: byId.get(n.id)!, similarity: n.similarity }] : [])) : [];
  const preset = WEIGHT_PRESETS.find((p) => FEATURE_GROUPS.every((g) => p.weights[g.id] === weights[g.id]))?.id;
  const view = matchPreset(mode, axisChoice, weights);
  const applyView = (p: MapPreset) => {
    setMode(p.mode);
    setAxisChoice(p.axes);
    setWeights(p.weights);
  };
  const viewInfo = MAP_PRESETS.find((p) => p.id === view);
  const own = stars.filter((s) => s.kind === "library").length;
  const read = stars.filter((s) => s.canon?.complete).length;
  const needle = filter.toLowerCase();
  const list = stars.filter((s) => !needle || (s.title + " " + s.author).toLowerCase().includes(needle));

  return (
    <div className="map-page">
      <aside className="map-rail">
        <div className="eyebrow">map</div>
        <h1>
          {ALL_FEATURES.length} dimensions in {mode === "2d" ? 2 : 3}
        </h1>
        <p className="map-intro">
          Every book is a vector of {ALL_FEATURES.length} Jev answers. Pick a question below, or put principal components or any single answer on the axes. Edges link each book to its 3
          nearest neighbours across all dimensions.
        </p>
        <div className="map-views" role="group" aria-label="Views">
          {MAP_PRESETS.map((p) => (
            <button key={p.id} className={view === p.id ? "on" : ""} aria-pressed={view === p.id} title={p.question} onClick={() => applyView(p)}>
              {p.label}
            </button>
          ))}
        </div>
        <p className="map-question">{viewInfo ? viewInfo.question : "Custom view."}</p>
        <div className="presets" role="group" aria-label="View">
          {(["2d", "3d"] as const).map((m) => (
            <button key={m} className={mode === m ? "on" : ""} aria-pressed={mode === m} onClick={() => setMode(m)}>
              {m}
            </button>
          ))}
        </div>
        <div className="axis-pickers">
          {(mode === "2d" ? [0, 1] : [0, 1, 2]).map((k) => (
            <label key={k}>
              <span className={`axis-${"xyz"[k]}`}>{"xyz"[k]}</span>
              <select value={axisChoice[k]} onChange={(e) => setAxisChoice(axisChoice.map((c, i) => (i === k ? e.target.value : c)))} aria-label={`${"xyz"[k]} axis`}>
                {options.map((g) => (
                  <optgroup key={g.group} label={g.group}>
                    {g.options.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
          ))}
          {axisChoice.some((c, i) => c !== DEFAULT_AXES[i]) && (
            <button className="link" onClick={() => setAxisChoice(DEFAULT_AXES)}>
              reset axes to PCA
            </button>
          )}
        </div>
        <p className="map-note dim">weights below shape PCA and the edges.</p>
        <div className="presets" role="group" aria-label="Compare by">
          {WEIGHT_PRESETS.map((p) => (
            <button key={p.id} className={preset === p.id ? "on" : ""} aria-pressed={preset === p.id} onClick={() => setWeights(p.weights)}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="weights">
          {FEATURE_GROUPS.map((g) => (
            <label key={g.id} title={g.hint}>
              <span>
                {g.label.toLowerCase()}
                <em>{weights[g.id].toFixed(1)}</em>
              </span>
              <input type="range" min={0} max={2} step={0.1} value={weights[g.id]} onChange={(e) => setWeights({ ...weights, [g.id]: Number(e.target.value) })} />
            </label>
          ))}
        </div>
        <div className="toggles">
          <label>
            <input type="checkbox" checked={includeAtlas} onChange={(e) => setIncludeAtlas(e.target.checked)} /> atlas
          </label>
          <label>
            <input type="checkbox" checked={labels} onChange={(e) => setLabels(e.target.checked)} /> all labels
          </label>
          <label>
            <input type="checkbox" checked={threads} onChange={(e) => setThreads(e.target.checked)} /> edges
          </label>
          <label>
            <input type="checkbox" checked={showRegions} onChange={(e) => setShowRegions(e.target.checked)} /> regions
          </label>
        </div>
        <div className="map-list">
          <input className="map-filter" placeholder={`find among ${stars.length} books`} value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter books on the map" />
          <ul>
            {list.map((s) => (
              <li key={s.id}>
                <button className={s.id === selected ? "on" : ""} onClick={() => select(s.id)}>
                  <i style={{ color: EMOTIONS.find((e) => e.id === argmax(s.fingerprint.emotions))!.color }}>{glyph(s)}</i>
                  <span>{s.title}</span>
                  <small>{s.author}</small>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <GroupLegend />
        <p className="map-foot">
          {own ? `${own} of your books on the map.` : "Analyse a book and it joins the graph."}
          {read > 0 && ` ▣ ${read} canon books read in full, each opens as a book page.`}
          {stars.length > own + read ? ` □ ${stars.length - own - read} atlas books measured by Jev.` : !read && " No atlas yet: run npm run atlas to add reference books."}
        </p>
      </aside>
      <section className="map-stage">
        <BookGraph
          stars={stars}
          embedding={embedding}
          axes={axes}
          coords={coords}
          regions={regions}
          mode={mode}
          selected={selected}
          onSelect={select}
          labels={labels}
          threads={threads}
          showRegions={showRegions}
        />
        {stars.length < 3 && (
          <div className="map-empty">
            <p>
              {stars.length} {stars.length === 1 ? "book has" : "books have"} Jev data; the map needs at least 3. Analyse books from your library, or run <code>npm run corpus</code>.
            </p>
          </div>
        )}
        {current && (
          <StarCard
            key={current.id}
            star={current}
            similar={similar}
            region={currentRegion >= 0 ? { name: regions[currentRegion].name, color: regionColor(currentRegion) } : undefined}
            onClose={() => select(null)}
            onPick={select}
          />
        )}
      </section>
    </div>
  );
}
