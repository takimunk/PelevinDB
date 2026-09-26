import { AbsoluteFill, interpolate, random, useCurrentFrame } from "remotion";
import data from "../data/analysis.json";
import { C, fmt, mono, progress } from "../theme";
import { beat, DURATION, FPS, SCENES } from "../timeline";

const CHAPTERS = [
  { label: "read", scenes: ["read"] },
  { label: "fingerprint", scenes: ["dna"] },
  { label: "map", scenes: ["map"] },
  { label: "analysis", scenes: ["pulse", "facts"] },
];

const timecode = (frame: number) => {
  const s = Math.floor(frame / FPS);
  return `00:00:${String(s).padStart(2, "0")}:${String(frame % FPS).padStart(2, "0")}`;
};

/** tmux-style top bar and status line, as in the app. */
export const Hud: React.FC = () => {
  const frame = useCurrentFrame();
  const show = progress(frame, beat(2.5), beat(3.5));
  const hide = 1 - progress(frame, beat(35), beat(35) + 8);
  const active = SCENES.find((s) => frame >= beat(s.from) && frame < beat(s.to))?.id;
  return (
    <AbsoluteFill style={{ fontFamily: mono, opacity: show * hide, pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          inset: "0 0 auto 0",
          height: 64,
          borderBottom: `1px solid ${C.line}`,
          display: "flex",
          alignItems: "center",
          background: "rgba(3,5,10,0.85)",
          transform: `translateY(${(1 - show) * -64}px)`,
        }}
      >
        <Logo size={20} style={{ padding: "0 32px" }} />
        {CHAPTERS.map((c, i) => {
          const on = c.scenes.includes(active as string);
          const scene = SCENES.filter((s) => c.scenes.includes(s.id));
          const fill = progress(frame, beat(scene[0].from), beat(scene[scene.length - 1].to), (t) => t);
          return (
            <div
              key={c.label}
              style={{
                position: "relative",
                height: "100%",
                padding: "0 30px",
                display: "flex",
                alignItems: "center",
                borderLeft: `1px solid ${C.line}`,
                color: on ? C.bg : C.muted,
                background: on ? C.green : "transparent",
                fontSize: 17,
                letterSpacing: 3,
                textTransform: "uppercase",
              }}
            >
              <span style={{ opacity: 0.55, marginRight: 12 }}>{i + 1}</span>
              {c.label}
              <div style={{ position: "absolute", left: 0, bottom: 0, height: 3, width: `${fill * 100}%`, background: on ? C.bg : C.faint }} />
            </div>
          );
        })}
        <div style={{ flex: 1 }} />
        <div style={{ color: C.muted, fontSize: 16, letterSpacing: 2, padding: "0 32px", display: "flex", gap: 14, alignItems: "center" }}>
          <span style={{ width: 9, height: 9, background: C.green, boxShadow: `0 0 10px ${C.green}`, opacity: Math.floor(frame / 10) % 3 ? 1 : 0.35 }} />
          jev online
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          inset: "auto 0 0 0",
          height: 44,
          borderTop: `1px solid ${C.line}`,
          display: "flex",
          alignItems: "center",
          fontSize: 15,
          color: C.muted,
          background: "rgba(3,5,10,0.85)",
          transform: `translateY(${(1 - show) * 44}px)`,
        }}
      >
        <div style={{ background: C.green, color: C.bg, height: "100%", display: "flex", alignItems: "center", padding: "0 20px", fontWeight: 700 }}>■ xbook 0.3</div>
        <div style={{ padding: "0 24px", borderRight: `1px solid ${C.line}` }}>
          {data.scale.books} books · {fmt(data.scale.pages)} pages read by jev · rubric {data.rubric}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ padding: "0 24px", color: C.ink2 }}>{timecode(frame)}</div>
      </div>
    </AbsoluteFill>
  );
};

export const Logo: React.FC<{ size?: number; style?: React.CSSProperties; caret?: boolean }> = ({ size = 20, style, caret = true }) => {
  const frame = useCurrentFrame();
  const px = size * 0.42;
  const cells = [
    [0, 0],
    [1, 0],
    [0, 1],
    [2, 1],
    [1, 2],
    [2, 2],
  ];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: size * 0.8, ...style }}>
      <div style={{ position: "relative", width: px * 3, height: px * 3 }}>
        {cells.map(([x, y], i) => (
          <div key={i} style={{ position: "absolute", left: x * px, top: y * px, width: px - 1, height: px - 1, background: i === 5 ? C.green2 : C.green }} />
        ))}
      </div>
      <div style={{ fontFamily: mono, fontWeight: 700, fontSize: size, letterSpacing: size * 0.22, color: C.ink }}>
        XBOOK<span style={{ color: C.green, opacity: caret && Math.floor(frame / 9) % 2 ? 0 : 1 }}>_</span>
      </div>
    </div>
  );
};

/** Scanlines, vignette, grain and a glitch burst on every cut. */
export const Crt: React.FC = () => {
  const frame = useCurrentFrame();
  const cuts = SCENES.map((s) => beat(s.from)).filter((f) => f > 0);
  const since = Math.min(...cuts.map((c) => (frame >= c ? frame - c : Infinity)));
  const burst = since < 7 ? 1 - since / 7 : 0;
  const fadeOut = interpolate(frame, [DURATION - 12, DURATION], [0, 1], { extrapolateLeft: "clamp" });
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {burst > 0 &&
        Array.from({ length: 7 }, (_, i) => {
          const y = random(`g-y-${frame}-${i}`) * 1080;
          const h = 4 + random(`g-h-${frame}-${i}`) * 50;
          const dx = (random(`g-x-${frame}-${i}`) - 0.5) * 160 * burst;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: dx,
                top: y,
                width: 1920,
                height: h,
                background: i % 2 ? "rgba(125,255,154,0.16)" : "rgba(111,141,255,0.16)",
                mixBlendMode: "screen",
                opacity: burst,
              }}
            />
          );
        })}
      <AbsoluteFill style={{ background: "#dfffe8", opacity: burst ** 3 * 0.18, mixBlendMode: "screen" }} />
      <AbsoluteFill style={{ background: "repeating-linear-gradient(to bottom, rgba(0,0,0,0) 0 2px, rgba(0,0,0,0.26) 2px 3px)" }} />
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.6) 100%)" }} />
      <AbsoluteFill style={{ opacity: 0.07, mixBlendMode: "overlay" }}>
        <svg width="1920" height="1080">
          <filter id="grain">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={frame % 24} stitchTiles="stitch" />
          </filter>
          <rect width="100%" height="100%" filter="url(#grain)" />
        </svg>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "#000", opacity: fadeOut }} />
    </AbsoluteFill>
  );
};
