import { AbsoluteFill, useCurrentFrame } from "remotion";
import data from "../data/analysis.json";
import { C, mono, progress } from "../theme";
import { Headline } from "../ui/Headline";

const { tension, light } = data.canonCurve;
const X0 = 190,
  W = 1000,
  Y0 = 360,
  H = 480;
const LO = 0.3,
  HI = 0.52;
const px = (i: number, n: number) => X0 + (i / (n - 1)) * W;
const py = (v: number) => Y0 + H - ((v - LO) / (HI - LO)) * H;
const path = (vs: number[]) => vs.map((v, i) => `${i ? "L" : "M"}${px(i, vs.length).toFixed(1)},${py(v).toFixed(1)}`).join(" ");

const peak = tension.indexOf(Math.max(...tension));
const dark = light.indexOf(Math.min(...light));
const pct = (i: number) => Math.round((i / (tension.length - 1)) * 100);

const HX = 1330,
  HW = 470,
  HY = 400,
  HH = 330;
const hist = data.climax.histogram;
const hmax = Math.max(...hist);

export const Pulse: React.FC = () => {
  const frame = useCurrentFrame();
  const draw = progress(frame, 6, 50);
  const peakOn = progress(frame, 44, 54);
  const late = Math.round(data.climax.lateShare * 100 * progress(frame, 56, 86));
  return (
    <AbsoluteFill style={{ background: C.bg, fontFamily: mono }}>
      <Headline tag="04 · analysis" title="The canon has a heartbeat." sub="Mean tension and light across 100 books, each stretched from first page to last." />
      <svg width={1920} height={1080} style={{ position: "absolute" }}>
        <defs>
          <clipPath id="draw">
            <rect x={X0} y={Y0 - 40} width={W * draw} height={H + 80} />
          </clipPath>
          <linearGradient id="tfill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={C.red} stopOpacity={0.35} />
            <stop offset="1" stopColor={C.red} stopOpacity={0} />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line x1={X0 + t * W} x2={X0 + t * W} y1={Y0} y2={Y0 + H} stroke={C.line} />
            <text x={X0 + t * W} y={Y0 + H + 30} fill={C.muted} fontSize={16} textAnchor="middle" fontFamily={mono}>
              {t * 100}%
            </text>
          </g>
        ))}
        {[0.35, 0.4, 0.45, 0.5].map((v) => (
          <g key={v}>
            <line x1={X0} x2={X0 + W} y1={py(v)} y2={py(v)} stroke={C.line} strokeDasharray="2 6" />
            <text x={X0 - 16} y={py(v) + 5} fill={C.muted} fontSize={15} textAnchor="end" fontFamily={mono}>
              {v.toFixed(2)}
            </text>
          </g>
        ))}
        <g clipPath="url(#draw)">
          <path d={`${path(tension)} L${X0 + W},${Y0 + H} L${X0},${Y0 + H} Z`} fill="url(#tfill)" />
          <path d={path(tension)} fill="none" stroke={C.red} strokeWidth={4} style={{ filter: `drop-shadow(0 0 10px ${C.red})` }} />
          <path d={path(light)} fill="none" stroke={C.yellow} strokeWidth={3} strokeDasharray="10 8" />
        </g>
        <g opacity={peakOn}>
          <line x1={px(peak, tension.length)} x2={px(peak, tension.length)} y1={Y0 - 10} y2={Y0 + H} stroke={C.red} strokeDasharray="4 5" />
          <rect x={px(peak, tension.length) - 9} y={py(tension[peak]) - 9} width={18} height={18} fill={C.bg} stroke={C.red} strokeWidth={3} />
          <text x={px(peak, tension.length) - 16} y={Y0 - 18} fill={C.red} fontSize={21} fontWeight={700} textAnchor="end" fontFamily={mono}>
            ▲ tension peaks at {pct(peak)}%
          </text>
          <rect x={px(dark, light.length) - 7} y={py(light[dark]) - 7} width={14} height={14} fill={C.bg} stroke={C.yellow} strokeWidth={2.5} />
          <text x={px(dark, light.length)} y={py(light[dark]) + 36} fill={C.yellow} fontSize={18} textAnchor="middle" fontFamily={mono}>
            darkest at {pct(dark)}%
          </text>
        </g>
        <g fontFamily={mono} fontSize={17}>
          <rect x={X0} y={Y0 + H + 58} width={26} height={4} fill={C.red} />
          <text x={X0 + 38} y={Y0 + H + 66} fill={C.ink2}>
            tension
          </text>
          <rect x={X0 + 150} y={Y0 + H + 58} width={26} height={4} fill={C.yellow} />
          <text x={X0 + 188} y={Y0 + H + 66} fill={C.ink2}>
            light
          </text>
        </g>

        <text x={HX} y={HY - 30} fill={C.muted} fontSize={16} letterSpacing={3} fontFamily={mono}>
          WHERE EACH BOOK’S CLIMAX FALLS
        </text>
        {hist.map((v, i) => {
          const grow = progress(frame, 40 + i * 2.5, 58 + i * 2.5);
          const bw = HW / hist.length;
          const h = (v / hmax) * HH * grow;
          const hot = i >= 7;
          return (
            <g key={i}>
              <rect x={HX + i * bw + 3} y={HY + HH - h} width={bw - 6} height={h} fill={hot ? C.green : C.faint} style={{ filter: hot ? `drop-shadow(0 0 10px ${C.green}88)` : undefined }} />
              <text x={HX + i * bw + bw / 2} y={HY + HH - h - 10} fill={hot ? C.green : C.muted} fontSize={15} textAnchor="middle" fontFamily={mono} opacity={grow}>
                {v}
              </text>
            </g>
          );
        })}
        <line x1={HX} x2={HX + HW} y1={HY + HH} y2={HY + HH} stroke={C.line2} />
        <text x={HX} y={HY + HH + 28} fill={C.muted} fontSize={15} fontFamily={mono}>
          first page
        </text>
        <text x={HX + HW} y={HY + HH + 28} fill={C.muted} fontSize={15} textAnchor="end" fontFamily={mono}>
          last page
        </text>
      </svg>
      <div style={{ position: "absolute", left: HX, top: HY + HH + 60, opacity: progress(frame, 56, 62) }}>
        <div style={{ fontSize: 92, fontWeight: 800, color: C.green, letterSpacing: -3, lineHeight: 1 }}>{late}%</div>
        <div style={{ fontSize: 21, color: C.ink2, marginTop: 10, width: 470, lineHeight: 1.4 }}>of classics save their climax for the final 30% of the book.</div>
      </div>
    </AbsoluteFill>
  );
};
