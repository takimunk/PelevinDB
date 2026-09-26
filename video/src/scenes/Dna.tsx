import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import data from "../data/analysis.json";
import { C, EMOTION_COLORS, mono, progress } from "../theme";
import { Cursor } from "../ui/Cursor";
import { Headline } from "../ui/Headline";

const f = data.featured;
const X0 = 120,
  W = 1680,
  DNA_TOP = 320,
  DNA_H = 250;
const COL = W / f.dna.length;
const RIDGE_TOP = 620,
  RIDGE_H = 34;
const climaxCol = Math.min(f.dna.length - 1, Math.floor((f.page.index / f.pages) * f.dna.length));
const climaxX = X0 + (climaxCol + 0.5) * COL;
const texture = (id: string) => Number(f.page.texture.find(([k]) => k === id)![1]).toFixed(2);

function ridge(values: (number | null)[], y: number) {
  const pts = values.map((v, i) => [X0 + (i / (values.length - 1)) * W, y + RIDGE_H - (v ?? 0) * RIDGE_H * 1.9] as const);
  const line = pts.map(([x, yy], i) => `${i ? "L" : "M"}${x.toFixed(1)},${yy.toFixed(1)}`).join(" ");
  return { line, area: `${line} L${X0 + W},${y + RIDGE_H} L${X0},${y + RIDGE_H} Z` };
}

export const Dna: React.FC = () => {
  const frame = useCurrentFrame();
  const hover = progress(frame, 50, 58);
  const strip = progress(frame, 58, 76);
  const tipX = climaxX - 440;
  return (
    <AbsoluteFill style={{ background: C.bg, fontFamily: mono }}>
      <Headline tag="02 · fingerprint" title="Every page becomes data." sub={`${f.title} · ${f.pages} pages · colour = leading emotion · height = intensity`} />

      <svg width={1920} height={1080} style={{ position: "absolute" }}>
        {f.dna.map((d, i) => {
          if (!d) return null;
          const grow = progress(frame, 4 + i * 0.28, 16 + i * 0.28);
          const h = d.v * DNA_H * grow;
          const dim = hover > 0 && i !== climaxCol ? 1 - hover * 0.55 : 1;
          return (
            <rect
              key={i}
              x={X0 + i * COL + 1}
              y={DNA_TOP + DNA_H - h}
              width={COL - 3}
              height={h}
              fill={EMOTION_COLORS[d.e]}
              opacity={dim}
              style={{ filter: i === climaxCol && hover ? `drop-shadow(0 0 12px ${EMOTION_COLORS[d.e]})` : undefined }}
            />
          );
        })}
        {Array.from({ length: Math.floor(DNA_H / 9) }, (_, k) => (
          <rect key={k} x={X0} y={DNA_TOP + k * 9 + 7} width={W} height={2} fill={C.bg} />
        ))}
        <line x1={X0} x2={X0 + W} y1={DNA_TOP + DNA_H + 8} y2={DNA_TOP + DNA_H + 8} stroke={C.line2} />

        {f.spectrum.map((s, k) => {
          const y = RIDGE_TOP + k * (RIDGE_H + 8);
          const { line, area } = ridge(s.values, y);
          const draw = progress(frame, 14 + k * 2, 44 + k * 2);
          return (
            <g key={s.id}>
              <clipPath id={`clip-${s.id}`}>
                <rect x={X0} y={y - 60} width={W * draw} height={RIDGE_H + 70} />
              </clipPath>
              <g clipPath={`url(#clip-${s.id})`}>
                <path d={area} fill={s.color} opacity={0.14} />
                <path d={line} fill="none" stroke={s.color} strokeWidth={2} />
              </g>
              <text x={X0 + 8} y={y + 6} fill={s.color} fontSize={15} fontFamily={mono} opacity={draw > 0 ? 1 : 0} style={{ paintOrder: "stroke" }} stroke={C.bg} strokeWidth={5}>
                {s.id}
              </text>
            </g>
          );
        })}

        <line x1={climaxX} x2={climaxX} y1={DNA_TOP - 10} y2={RIDGE_TOP + 8 * (RIDGE_H + 8)} stroke={C.green} strokeDasharray="4 5" opacity={hover} />
      </svg>

      <div
        style={{
          position: "absolute",
          left: tipX,
          top: DNA_TOP + 20,
          width: 400,
          border: `1px solid ${C.green}`,
          background: "rgba(3,5,10,0.94)",
          opacity: hover,
          transform: `translateY(${(1 - hover) * 10}px)`,
          fontSize: 17,
          boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
        }}
      >
        <div style={{ background: C.green, color: C.bg, padding: "6px 14px", fontWeight: 700, letterSpacing: 2 }}>▲ CLIMAX · p.{f.page.index + 1}</div>
        <div style={{ padding: "12px 14px", lineHeight: 1.6, color: C.ink2 }}>
          {(
            [
              ["tension", texture("tension"), C.red],
              ["pace", texture("pace"), C.amber],
              ["light", texture("valence"), C.yellow],
              ["mood", String(f.page.mood[0]), C.ink],
            ] as const
          ).map(([k, v, col]) => (
            <div key={k} style={{ display: "flex" }}>
              <span style={{ width: 130 }}>{k}</span>
              <span style={{ color: col }}>{v}</span>
            </div>
          ))}
          <div style={{ color: C.muted, marginTop: 6, fontSize: 15 }}>“…he was shot out of the boat, ere the crew knew he was gone.”</div>
        </div>
      </div>

      <div style={{ position: "absolute", left: X0, top: 972, display: "flex", alignItems: "center", gap: 22, opacity: strip }}>
        <div style={{ display: "flex", gap: 3 }}>
          {f.fingerprint.map((p, i) => {
            const on = interpolate(frame, [58 + i * 0.2, 62 + i * 0.2], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            const col = (f.groupColors as Record<string, string>)[p.group];
            return <div key={i} style={{ width: 10, height: 22, background: col, opacity: (0.15 + 0.85 * Math.min(1, p.value * 1.4)) * on }} />;
          })}
        </div>
        <div style={{ color: C.ink2, fontSize: 18 }}>
          <span style={{ color: C.ink, fontWeight: 700 }}>85</span> coordinates · one fingerprint per book
        </div>
      </div>

      <Cursor
        appear={30}
        keys={[
          { f: 30, at: { x: 1500, y: 900 } },
          { f: 50, at: { x: climaxX + 4, y: DNA_TOP + 80 }, click: true },
          { f: 90, at: { x: climaxX + 8, y: DNA_TOP + 96 } },
        ]}
      />
    </AbsoluteFill>
  );
};
