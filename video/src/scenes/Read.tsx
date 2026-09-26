import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import data from "../data/analysis.json";
import { C, EMOTION_COLORS, fmt, mono, progress } from "../theme";
import { Headline, Pane } from "../ui/Headline";

const page = data.featured.page;
const TEXTURE_LABEL: Record<string, string> = { valence: "light", humor: "humour" };

function wrap(text: string, width: number, max: number) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    if ((line + " " + word).trim().length > width) {
      lines.push(line.trim());
      line = word;
      if (lines.length === max) break;
    } else line += " " + word;
  }
  return lines;
}
const LINES = wrap(page.text, 50, 21);

const Gauge: React.FC<{ label: string; value: number; color: string; start: number }> = ({ label, value, color, start }) => {
  const frame = useCurrentFrame();
  const t = progress(frame, start, start + 12);
  const cells = 16;
  const lit = Math.round(value * cells * t);
  return (
    <div style={{ display: "flex", alignItems: "center", height: 31, fontSize: 19, opacity: progress(frame, start, start + 4) }}>
      <span style={{ width: 170, color: C.ink2 }}>{label}</span>
      <span style={{ letterSpacing: 1 }}>
        {Array.from({ length: cells }, (_, i) => (
          <span key={i} style={{ color: i < lit ? color : C.faint, textShadow: i < lit ? `0 0 8px ${color}66` : "none" }}>
            {i < lit ? "█" : "·"}
          </span>
        ))}
      </span>
      <span style={{ marginLeft: 18, color: value > 0.75 ? color : C.ink, fontWeight: 500 }}>{(value * t).toFixed(2)}</span>
    </div>
  );
};

const Counter: React.FC<{ value: number; label: string; start: number; prefix?: string; decimals?: number }> = ({ value, label, start, prefix = "", decimals = 0 }) => {
  const frame = useCurrentFrame();
  const t = progress(frame, start, start + 26);
  const v = value * t;
  return (
    <div style={{ opacity: progress(frame, start, start + 6) }}>
      <div style={{ fontSize: 50, fontWeight: 700, color: C.ink, letterSpacing: -1 }}>
        {prefix}
        {decimals ? v.toFixed(decimals) : fmt(Math.round(v))}
      </div>
      <div style={{ fontSize: 17, color: C.muted, letterSpacing: 2, textTransform: "uppercase", marginTop: 4 }}>{label}</div>
    </div>
  );
};

export const Read: React.FC = () => {
  const frame = useCurrentFrame();
  const scan = interpolate(frame, [8, 70], [0, LINES.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const drift = interpolate(frame, [0, 90], [0, -14]);
  return (
    <AbsoluteFill style={{ background: C.bg, fontFamily: mono }}>
      <Headline tag="01 · read" title="Jev reads every page." sub="36 questions per page: Plutchik emotions, pace, tension, light, mood, narration, themes." />
      <div style={{ position: "absolute", inset: 0, transform: `translateY(${drift}px)` }}>
        <Pane title="less moby-dick.txt" right={`p.${page.index + 1} / ${data.featured.pages}`} style={{ left: 120, top: 330, width: 800, height: 560, overflow: "hidden" }}>
          <div style={{ padding: "18px 26px", fontSize: 19, lineHeight: "30px", position: "relative" }}>
            {LINES.map((line, i) => {
              const read = scan > i + 1;
              const on = scan > i && scan <= i + 1;
              return (
                <div key={i} style={{ color: on ? C.bg : read ? C.ink : C.muted, background: on ? C.green : "transparent", opacity: read || on ? 1 : 0.55 }}>
                  {line}
                </div>
              );
            })}
          </div>
        </Pane>
        <Pane title="jev · jev-1.13.0" right="36 answers" style={{ left: 960, top: 330, width: 840, height: 560 }}>
          <div style={{ display: "flex", padding: "16px 26px", gap: 34 }}>
            <div>
              <div style={{ color: C.green, fontSize: 15, letterSpacing: 3, marginBottom: 6 }}>EMOTIONS · SCORE</div>
              {page.emotions.map(([id, v], i) => (
                <Gauge key={id as string} label={id as string} value={v as number} color={EMOTION_COLORS[id as string]} start={10 + i * 3} />
              ))}
            </div>
          </div>
          <div style={{ position: "absolute", left: 26, top: 330 }}>
            <div style={{ color: C.green, fontSize: 15, letterSpacing: 3, marginBottom: 6 }}>TEXTURE · SCORE</div>
            {page.texture
              .filter(([id]) => ["pace", "tension", "valence", "imagery"].includes(id as string))
              .map(([id, v], i) => (
                <Gauge key={id as string} label={TEXTURE_LABEL[id as string] ?? (id as string)} value={v as number} color={id === "valence" ? C.yellow : C.red} start={34 + i * 3} />
              ))}
          </div>
          <div style={{ position: "absolute", right: 26, top: 60, width: 190, fontSize: 18, lineHeight: 1.5, opacity: progress(frame, 44, 52) }}>
            <div style={{ color: C.muted, fontSize: 14, letterSpacing: 3 }}>MOOD · CHOICE</div>
            <div style={{ color: C.ink, marginBottom: 18 }}>
              {page.mood[0]} <span style={{ color: C.muted }}>{(page.mood[1] as number).toFixed(2)}</span>
            </div>
            <div style={{ color: C.muted, fontSize: 14, letterSpacing: 3 }}>NARRATION</div>
            <div style={{ color: C.ink, marginBottom: 18 }}>{page.mode[0]}</div>
            <div style={{ color: C.muted, fontSize: 14, letterSpacing: 3 }}>THEMES · NOUL</div>
            {page.themes.map(([id, v]) => (
              <div key={id as string} style={{ color: C.ink }}>
                {id} <span style={{ color: C.muted }}>{(v as number).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </Pane>
      </div>
      <div style={{ position: "absolute", left: 120, top: 928, display: "flex", gap: 90 }}>
        <Counter value={data.scale.pages} label="pages read" start={40} />
        <Counter value={data.scale.judgments} label="answers" start={46} />
        <Counter value={data.scale.jevUsd} label="total jev cost" prefix="$" decimals={2} start={52} />
      </div>
    </AbsoluteFill>
  );
};
