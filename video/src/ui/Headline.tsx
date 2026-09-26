import { useCurrentFrame } from "remotion";
import { C, mono, progress } from "../theme";
import { Decode } from "./Decode";

export const Headline: React.FC<{ tag: string; title: string; sub?: string; start?: number; x?: number; y?: number; size?: number }> = ({
  tag,
  title,
  sub,
  start = 0,
  x = 120,
  y = 118,
  size = 64,
}) => {
  const frame = useCurrentFrame();
  const rule = progress(frame, start, start + 14);
  return (
    <div style={{ position: "absolute", left: x, top: y, fontFamily: mono, width: 1680 }}>
      <div style={{ color: C.green, fontSize: 18, letterSpacing: 4, textTransform: "uppercase", display: "flex", alignItems: "center", gap: 18 }}>
        <Decode text={`// ${tag}`} start={start} speed={3} scramble={3} />
        <div style={{ height: 1, width: 180 * rule, background: C.green, opacity: 0.6 }} />
      </div>
      <div style={{ color: C.ink, fontSize: size, fontWeight: 700, letterSpacing: -1.5, marginTop: 14, lineHeight: 1.08 }}>
        <Decode text={title} start={start + 2} speed={2.2} scramble={4} />
      </div>
      {sub && (
        <div style={{ color: C.ink2, fontSize: 22, marginTop: 16, opacity: progress(frame, start + 10, start + 22), letterSpacing: 0.2 }}>{sub}</div>
      )}
    </div>
  );
};

/** Panel with a terminal title bar. */
export const Pane: React.FC<{ title: string; right?: string; style?: React.CSSProperties; children: React.ReactNode }> = ({ title, right, style, children }) => (
  <div style={{ position: "absolute", border: `1px solid ${C.line2}`, background: "rgba(7,10,18,0.82)", fontFamily: mono, ...style }}>
    <div
      style={{
        height: 38,
        borderBottom: `1px solid ${C.line}`,
        display: "flex",
        alignItems: "center",
        padding: "0 16px",
        fontSize: 15,
        color: C.muted,
        letterSpacing: 1,
        gap: 12,
      }}
    >
      <span style={{ color: C.green }}>▍</span>
      {title}
      <div style={{ flex: 1 }} />
      {right}
    </div>
    {children}
  </div>
);
