import { useEffect, useRef } from "react";
import { EMOTIONS, MODES, MOODS, TEXTURES, THEMES } from "../../../shared/catalog.ts";
import type { SegmentAnalysis } from "../../../shared/types.ts";
import { argmax, isParatext, modeColor, moodColor } from "../../domain/analysis.ts";
import { pageValues } from "../../domain/fingerprint.ts";
import type { Segment } from "../../domain/text.ts";
import { bar } from "../../ui/ascii.ts";
import { PixelStrip } from "../../ui/PixelStrip.tsx";
import { Sliders } from "./charts/Text.tsx";

/** A `less` pane: the page on the left, every Jev answer about it underneath. */
export function Reader({
  segment,
  analysis,
  total,
  onMove,
  onClose,
}: {
  segment: Segment;
  analysis: SegmentAnalysis | null;
  total: number;
  onMove: (delta: number) => void;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    textRef.current?.scrollTo({ top: 0 });
  }, [segment.id]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "q") onClose();
      if (e.key === "ArrowRight" || e.key === "n") onMove(1);
      if (e.key === "ArrowLeft" || e.key === "p") onMove(-1);
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onMove, onClose]);
  const mood = analysis && MOODS.find((m) => m.id === argmax(analysis.mood))!;
  const mode = analysis && MODES.find((m) => m.id === argmax(analysis.mode))!;
  const themes = analysis ? THEMES.filter((t) => analysis.themes[t.id] >= 0.5).sort((a, b) => analysis.themes[b.id] - analysis.themes[a.id]) : [];
  return (
    <aside className="reader" role="dialog" aria-modal="false" aria-label={`Page ${segment.id}`}>
      <header className="reader-top">
        <span className="reader-page">
          less <b>p.{segment.id}</b>/{total}
        </span>
        <div className="reader-nav">
          <button aria-label="Previous page" disabled={segment.id <= 1} onClick={() => onMove(-1)}>
            [← p]
          </button>
          <button aria-label="Next page" disabled={segment.id >= total} onClick={() => onMove(1)}>
            [n →]
          </button>
          <button ref={closeRef} aria-label="Close reader" onClick={onClose}>
            [q]
          </button>
        </div>
      </header>
      <div className="reader-text" ref={textRef}>
        {segment.text}
      </div>
      <section className="reader-analysis">
        {analysis ? (
          isParatext(analysis) ? (
            <p className="reader-note">[skip] Jev marks this page as paratext (contents, licence, title page). It is excluded from book stats.</p>
          ) : (
            <>
              <PixelStrip values={pageValues(analysis)} size={10} label="jev answers" />
              <div className="reader-tags">
                <span style={{ color: moodColor(mood!.id) }}>mood:{mood!.label.toLowerCase()}</span>
                <span style={{ color: modeColor(mode!.id) }}>mode:{mode!.label.toLowerCase()}</span>
                {themes.map((t) => (
                  <span key={t.id}>#{t.label.toLowerCase()}</span>
                ))}
              </div>
              <div className="reader-emotions">
                {EMOTIONS.map((e) => (
                  <div key={e.id}>
                    <span>{e.label.toLowerCase()}</span>
                    <span style={{ color: e.color }}>{bar(analysis.emotions[e.id], 14, "█", "·")}</span>
                    <span>{String(Math.round(analysis.emotions[e.id] * 100)).padStart(3)}</span>
                  </div>
                ))}
              </div>
              <Sliders items={TEXTURES.map((t) => ({ id: t.id, low: t.low, high: t.high, value: analysis.texture[t.id], label: `${t.label} · confidence ${Math.round(analysis.textureConfidence[t.id] * 100)}%` }))} />
            </>
          )
        ) : (
          <p className="reader-note">[wait] Jev has not read this page yet.</p>
        )}
        <footer className="reader-foot">
          {segment.text.length} chars · {analysis ? `${analysis.model}${analysis.usage?.input_tokens ? ` · ${analysis.usage.input_tokens} tokens` : ""}` : "pending"} · ←/→ page · q close
        </footer>
      </section>
    </aside>
  );
}
