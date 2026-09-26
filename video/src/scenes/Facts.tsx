import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import data from "../data/analysis.json";
import { C, fmt, mono } from "../theme";
import { FRAMES_PER_BEAT } from "../timeline";
import { Headline } from "../ui/Headline";

const corr = data.correlations.find((c) => c.a === "tension" && c.b === "light")!;
const tragedy = data.arcs.find((a) => a.id === "fall")!;
const darkest = data.extremes.find((e) => e.label === "darkest")!;

const CARDS = [
  { big: corr.r.toFixed(2).replace("-", "−"), unit: "r", line: "tension vs light", note: `the darker the page, the higher the stakes · ${fmt(data.scale.pages)} pages`, color: C.red },
  { big: `${tragedy.count}`, unit: "/ 100", line: "tragedy is the top shape", note: "Vonnegut’s six story arcs, fitted to each book’s light curve", color: C.blue },
  { big: darkest.title, unit: "", line: `the darkest book · light ${darkest.value.toFixed(2)}`, note: darkest.author, color: C.yellow },
  { big: `$${data.scale.usdPerPage.toFixed(4)}`, unit: "", line: "per page read", note: `the whole canon for $${data.scale.jevUsd.toFixed(2)}`, color: C.green },
];

export const Facts: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: C.bg, fontFamily: mono }}>
      <Headline tag="04 · analysis" title="What 1.4 million answers say." />
      {CARDS.map((c, i) => {
        const land = i * FRAMES_PER_BEAT;
        const t = interpolate(frame, [land, land + 6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const flash = interpolate(frame, [land, land + 8], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const col = i % 2,
          row = Math.floor(i / 2);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: 120 + col * 850,
              top: 330 + row * 330,
              width: 830,
              height: 310,
              border: `1px solid ${t > 0 ? c.color : C.line}`,
              background: `linear-gradient(135deg, ${c.color}14, rgba(7,10,18,0.9) 60%)`,
              opacity: t,
              transform: `scale(${1.12 - 0.12 * t}) translateY(${(1 - t) * 30}px)`,
              filter: `blur(${(1 - t) * 8}px)`,
              padding: "34px 40px",
              boxSizing: "border-box",
              boxShadow: `0 0 ${60 * flash}px ${c.color}55`,
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
              <div style={{ fontSize: c.big.length > 8 ? 84 : 110, fontWeight: 800, color: c.color, letterSpacing: -4, lineHeight: 1 }}>{c.big}</div>
              <div style={{ fontSize: 32, color: c.color, opacity: 0.7 }}>{c.unit}</div>
            </div>
            <div style={{ fontSize: 30, color: C.ink, marginTop: 26, fontWeight: 500 }}>{c.line}</div>
            <div style={{ fontSize: 19, color: C.muted, marginTop: 10 }}>{c.note}</div>
            <div style={{ position: "absolute", inset: 0, background: c.color, opacity: flash * 0.25, mixBlendMode: "screen" }} />
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
