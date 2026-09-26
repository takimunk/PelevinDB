import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { C, mono, progress } from "../theme";
import { Logo } from "../ui/Chrome";
import { Decode } from "../ui/Decode";
import { GlyphField } from "../ui/GlyphField";

export const Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const logo = progress(frame, 0, 14);
  const push = interpolate(frame, [0, 75], [1.1, 1]);
  return (
    <AbsoluteFill style={{ background: C.bg, fontFamily: mono }}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", transform: `scale(${push})` }}>
        <GlyphField spin={0.012} zoom={1.25} opacity={0.32 * progress(frame, 0, 20)} />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "radial-gradient(700px 360px at 50% 50%, rgba(3,5,10,0.92), rgba(3,5,10,0.2))" }} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ opacity: logo, transform: `scale(${0.94 + 0.06 * logo})` }}>
          <Logo size={132} />
        </div>
        <div style={{ fontSize: 46, fontWeight: 700, color: C.ink, marginTop: 44, letterSpacing: -1 }}>
          <Decode text="Every page, measured." start={8} speed={2} />
        </div>
        <div style={{ fontSize: 22, color: C.ink2, marginTop: 22, opacity: progress(frame, 22, 34), letterSpacing: 1 }}>
          No score is invented. Every number on screen is a Jev answer.
        </div>
        <div style={{ fontSize: 18, color: C.green, marginTop: 42, letterSpacing: 6, textTransform: "uppercase", opacity: progress(frame, 30, 42) }}>
          xbook · read by jev · typesafe
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
