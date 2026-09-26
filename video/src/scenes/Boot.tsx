import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import data from "../data/analysis.json";
import { C, fmt, mono, progress } from "../theme";
import { Logo } from "../ui/Chrome";
import { Typed } from "../ui/Decode";
import { GlyphField } from "../ui/GlyphField";

export const Boot: React.FC = () => {
  const frame = useCurrentFrame();
  const field = progress(frame, 0, 30);
  const logo = progress(frame, 36, 50);
  const push = interpolate(frame, [0, 60], [1.08, 1]);
  return (
    <AbsoluteFill style={{ background: C.bg, fontFamily: mono }}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", transform: `scale(${push})` }}>
        <GlyphField spin={0.035} zoom={0.9 + frame * 0.004} opacity={field * (1 - logo * 0.55)} />
      </AbsoluteFill>
      <div style={{ position: "absolute", left: 120, top: 150, fontSize: 26, color: C.ink, lineHeight: 1.7, opacity: 1 - logo * 0.65 }}>
        <div>
          <span style={{ color: C.green }}>~/canon $ </span>
          <Typed text="xbook read --top 100" start={4} cps={0.75} caret={frame < 34} />
        </div>
        <div style={{ color: C.muted, opacity: progress(frame, 32, 36) }}>
          ✓ {data.scale.books} books · {fmt(data.scale.pages)} pages · {fmt(data.scale.judgments)} answers
        </div>
      </div>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: logo }}>
        <div style={{ transform: `scale(${0.9 + logo * 0.1})`, display: "flex", flexDirection: "column", alignItems: "center", gap: 26 }}>
          <Logo size={120} />
          <div style={{ fontSize: 30, color: C.ink2, letterSpacing: 10, textTransform: "uppercase" }}>a terminal over books</div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
