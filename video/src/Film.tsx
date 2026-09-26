import { AbsoluteFill, Html5Audio, interpolate, Sequence, staticFile, useCurrentFrame } from "remotion";
import { Boot } from "./scenes/Boot";
import { Dna } from "./scenes/Dna";
import { Facts } from "./scenes/Facts";
import { MapScene } from "./scenes/MapScene";
import { Outro } from "./scenes/Outro";
import { Pulse } from "./scenes/Pulse";
import { Read } from "./scenes/Read";
import { C } from "./theme";
import { beat, SCENES, type SceneId } from "./timeline";
import { Crt, Hud } from "./ui/Chrome";

export const SCENE_COMPONENTS: Record<SceneId, React.FC> = {
  boot: Boot,
  read: Read,
  dna: Dna,
  map: MapScene,
  pulse: Pulse,
  facts: Facts,
  outro: Outro,
};

/** Each scene settles in from a slight push, so hard cuts on the beat still feel like camera moves. */
const Settle: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, 10], [1.035, 1], { extrapolateRight: "clamp", easing: (t) => 1 - (1 - t) ** 3 });
  return <AbsoluteFill style={{ transform: `scale(${scale})` }}>{children}</AbsoluteFill>;
};

export const Film: React.FC = () => (
  <AbsoluteFill style={{ background: C.bg }}>
    {SCENES.map((s) => {
      const Scene = SCENE_COMPONENTS[s.id];
      return (
        <Sequence key={s.id} name={s.id} from={beat(s.from)} durationInFrames={beat(s.to) - beat(s.from)}>
          <Settle>
            <Scene />
          </Settle>
        </Sequence>
      );
    })}
    <Hud />
    <Crt />
    <Html5Audio src={staticFile("score.wav")} />
  </AbsoluteFill>
);
