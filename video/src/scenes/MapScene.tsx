import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import data from "../data/analysis.json";
import { C, EMOTION_COLORS, mono, progress } from "../theme";
import { Cursor, type Point } from "../ui/Cursor";
import { Headline } from "../ui/Headline";

const CX = 800,
  CY = 640,
  R = 400,
  DIST = 3.4,
  PITCH = 0.42;

// Robust spread: the 90th percentile maps to 1 and outliers are compressed instead of shrinking the cloud.
const q90 = (xs: number[]) => [...xs].map(Math.abs).sort((a, b) => a - b)[Math.floor(xs.length * 0.9)];
const soft = (v: number, q: number) => Math.tanh((v / q) * 0.9) / Math.tanh(0.9);
const [qx, qy, qz] = (["x", "y", "z"] as const).map((k) => q90(data.map.points.map((p) => p[k])));
const POINTS = data.map.points.map((p) => ({ ...p, x: soft(p.x, qx), y: soft(p.y, qy) * 0.8, z: soft(p.z, qz) }));
type Node = (typeof POINTS)[number];
const byId = new Map(POINTS.map((p) => [p.id, p]));
const HOVERS = [
  { id: "pg-6130", other: "pg-228", from: 40, to: 74 },
  { id: "pg-69087", other: "pg-2852", from: 88, to: 120 },
];
const FAMOUS = ["pg-2701", "pg-1342", "pg-27761", "pg-2600", "pg-11", "pg-1128", "pg-345", "pg-4300", "pg-64317", "pg-2554", "pg-8800", "pg-3207"];

const hoverAmount = (f: number) => Math.max(...HOVERS.map((h) => interpolate(f, [h.from - 6, h.from, h.to - 4, h.to], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })));

// Orbit slows while a node is hovered, as in the app.
const YAW: number[] = (() => {
  const out = [0.35];
  for (let f = 1; f <= 130; f++) out.push(out[f - 1] + 0.013 * (1 - 0.82 * hoverAmount(f)));
  return out;
})();

function project(x: number, y: number, z: number, f: number) {
  const yaw = YAW[Math.max(0, Math.min(YAW.length - 1, Math.round(f)))];
  const x1 = x * Math.cos(yaw) + z * Math.sin(yaw);
  const z1 = -x * Math.sin(yaw) + z * Math.cos(yaw);
  const y1 = y * Math.cos(PITCH) - z1 * Math.sin(PITCH);
  const z2 = y * Math.sin(PITCH) + z1 * Math.cos(PITCH);
  const s = DIST / (DIST + z2);
  return { x: CX + x1 * R * s, y: CY - y1 * R * s, s, depth: z2 };
}
const nodeAt = (n: Node, f: number) => project(n.x, n.y, n.z, f);
const pointer = (id: string) => (f: number): Point => {
  const p = nodeAt(byId.get(id)!, f);
  return { x: p.x + 3, y: p.y + 3 };
};

const axisLabel = (i: number) => {
  const a = data.map.axes[i];
  return `${a.positive.slice(0, 2).join(" · ").toLowerCase()}`;
};

export const MapScene: React.FC = () => {
  const frame = useCurrentFrame();
  const intro = progress(frame, 0, 24);
  const active = HOVERS.find((h) => frame >= h.from - 6 && frame < h.to + 8);
  const h = hoverAmount(frame);
  const nodes = POINTS.map((n) => ({ n, p: nodeAt(n, frame) })).sort((a, b) => b.p.depth - a.p.depth);
  const hotIds = active ? [active.id, active.other] : [];
  const labels = new Set<string>();
  const boxes: { x: number; y: number; w: number }[] = [];
  for (const id of [...hotIds, ...FAMOUS]) {
    const p = nodeAt(byId.get(id)!, frame);
    const w = Math.min(28, byId.get(id)!.title.length) * (hotIds.includes(id) ? 12 : 9.2) + 20;
    if (boxes.some((b) => p.x + w > b.x && p.x < b.x + b.w && Math.abs(p.y - b.y) < 24)) continue;
    boxes.push({ x: p.x, y: p.y, w });
    labels.add(id);
  }
  const grid = Array.from({ length: 9 }, (_, i) => -1 + i * 0.25);
  const axes = [
    { v: [1, 0, 0], label: `+x ${axisLabel(0)}` },
    { v: [0, 1, 0], label: `+y ${axisLabel(1)}` },
    { v: [0, 0, 1], label: `+z ${axisLabel(2)}` },
  ];
  return (
    <AbsoluteFill style={{ background: C.bg, fontFamily: mono }}>
      <AbsoluteFill style={{ background: "radial-gradient(900px 600px at 42% 62%, rgba(60,90,200,0.14), transparent 70%)" }} />
      <svg width={1920} height={1080} style={{ position: "absolute" }}>
        <g opacity={0.5 * intro}>
          {grid.map((g) => {
            const a = project(-1, -0.75, g, frame),
              b = project(1, -0.75, g, frame),
              c = project(g, -0.75, -1, frame),
              d = project(g, -0.75, 1, frame);
            return (
              <g key={g} stroke={C.line} strokeWidth={1}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
                <line x1={c.x} y1={c.y} x2={d.x} y2={d.y} />
              </g>
            );
          })}
        </g>
        {axes.map(({ v, label }) => {
          const a = project(-v[0] * 0.9, -v[1] * 0.75, -v[2] * 0.9, frame);
          const b = project(v[0] * 0.9, v[1] * 0.75, v[2] * 0.9, frame);
          return (
            <g key={label} opacity={intro}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={C.line2} strokeDasharray="3 6" />
              <text x={b.x + 10} y={b.y - 8} fill={C.blue} fontSize={17} fontFamily={mono}>
                {label}
              </text>
            </g>
          );
        })}
        {data.map.edges.map(([a, b, s]) => {
          const pa = nodeAt(byId.get(a as string)!, frame),
            pb = nodeAt(byId.get(b as string)!, frame);
          const lit = active && ((a === active.id && b === active.other) || (b === active.id && a === active.other));
          if (lit) return null;
          return <line key={`${a}${b}`} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} stroke="#8fa8ff" strokeWidth={1} opacity={(0.1 + (s as number) * 0.12) * intro * (1 - h * 0.5)} />;
        })}
        {active &&
          (() => {
            const pa = nodeAt(byId.get(active.id)!, frame),
              pb = nodeAt(byId.get(active.other)!, frame);
            const draw = progress(frame, active.from, active.from + 10);
            const sim = data.map.edges.find(([a, b]) => (a === active.id && b === active.other) || (b === active.id && a === active.other))![2] as number;
            const mx = pa.x + (pb.x - pa.x) * draw,
              my = pa.y + (pb.y - pa.y) * draw;
            return (
              <g opacity={h}>
                <line x1={pa.x} y1={pa.y} x2={mx} y2={my} stroke={C.green} strokeWidth={3} style={{ filter: `drop-shadow(0 0 8px ${C.green})` }} />
                <rect x={(pa.x + pb.x) / 2 - 36} y={(pa.y + pb.y) / 2 - 17} width={72} height={30} fill={C.bg} stroke={C.green} opacity={draw} />
                <text x={(pa.x + pb.x) / 2} y={(pa.y + pb.y) / 2 + 5} fill={C.green} fontSize={17} textAnchor="middle" fontFamily={mono} fontWeight={700} opacity={draw}>
                  {sim.toFixed(2)}
                </text>
              </g>
            );
          })()}
        {nodes.map(({ n, p }, i) => {
          const pop = progress(frame, 2 + (n.rank % 20) * 0.6, 12 + (n.rank % 20) * 0.6);
          const hot = active && (n.id === active.id || n.id === active.other);
          const size = (hot ? 16 : 9) * p.s * pop;
          const col = EMOTION_COLORS[n.emotion];
          const fog = interpolate(p.depth, [-1, 1], [1, 0.35], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          const dim = active && !hot ? 1 - h * 0.6 : 1;
          const showLabel = labels.has(n.id);
          return (
            <g key={n.id} opacity={fog * dim}>
              <rect x={p.x - size / 2} y={p.y - size / 2} width={size} height={size} fill={n.rank <= 20 || hot ? col : C.bg} stroke={col} strokeWidth={1.5} />
              {hot && <rect x={p.x - size} y={p.y - size} width={size * 2} height={size * 2} fill="none" stroke={C.green} strokeWidth={1.5} />}
              {showLabel && (
                <text x={p.x + 14} y={p.y + 5} fill={hot ? C.ink : C.ink2} fontSize={hot ? 20 : 15} fontFamily={mono} fontWeight={hot ? 700 : 400} opacity={pop * (hot ? 1 : 0.8)}>
                  {n.title.length > 28 ? n.title.slice(0, 27) + "…" : n.title}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <Headline tag="03 · map" title="100 classics. 85 dimensions. One map." sub="Principal components of Jev answers · edges link nearest neighbours by cosine similarity." />

      {active && (
        <div
          style={{
            position: "absolute",
            left: 1400,
            top: 380,
            width: 400,
            border: `1px solid ${C.green}`,
            background: "rgba(3,5,10,0.94)",
            opacity: h,
            transform: `translateX(${(1 - h) * 20}px)`,
            boxShadow: "0 30px 80px rgba(0,0,0,0.7)",
          }}
        >
          <div style={{ background: C.green, color: C.bg, padding: "7px 16px", fontSize: 15, letterSpacing: 2, fontWeight: 700 }}>CANON · READ IN FULL</div>
          <div style={{ padding: "16px 18px", fontSize: 18, color: C.ink2, lineHeight: 1.55 }}>
            <div style={{ color: C.ink, fontSize: 26, fontWeight: 700, lineHeight: 1.15 }}>{byId.get(active.id)!.title.toUpperCase()}</div>
            <div style={{ marginBottom: 14 }}>{byId.get(active.id)!.author}</div>
            <div style={{ display: "flex" }}>
              <span style={{ width: 120 }}>emotion</span>
              <span style={{ color: EMOTION_COLORS[byId.get(active.id)!.emotion] }}>{byId.get(active.id)!.emotion}</span>
            </div>
            <div style={{ color: C.green, marginTop: 14, fontSize: 15, letterSpacing: 3 }}>// NEAREST</div>
            <div style={{ color: C.ink }}>
              <span style={{ color: C.green, fontWeight: 700 }}>
                {Math.round((data.map.edges.find(([a, b]) => (a === active.id && b === active.other) || (b === active.id && a === active.other))![2] as number) * 100)}
              </span>{" "}
              {byId.get(active.other)!.title}
            </div>
          </div>
        </div>
      )}

      <div style={{ position: "absolute", left: 1400, top: 720, width: 420, fontSize: 20, lineHeight: 1.5, color: C.ink2, opacity: progress(frame, 56, 66) }}>
        Homer sits next to Virgil. Christie next to Conan Doyle.
        <div style={{ color: C.green, marginTop: 8 }}>Found from the pages alone.</div>
      </div>

      <Cursor
        appear={24}
        keys={[
          { f: 24, at: { x: 1300, y: 980 } },
          { f: HOVERS[0].from, at: pointer(HOVERS[0].id), click: true },
          { f: HOVERS[0].to, at: pointer(HOVERS[0].id) },
          { f: HOVERS[1].from, at: pointer(HOVERS[1].id), click: true },
          { f: 120, at: pointer(HOVERS[1].id) },
        ]}
      />
    </AbsoluteFill>
  );
};
