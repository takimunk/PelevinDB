import { interpolate, useCurrentFrame } from "remotion";
import { easeInOut } from "../theme";

export type Point = { x: number; y: number };
export type CursorKey = { f: number; at: Point | ((frame: number) => Point); click?: boolean };

const resolve = (at: CursorKey["at"], frame: number) => (typeof at === "function" ? at(frame) : at);

/** Moves between keyframes with an eased glide; function targets let the pointer track moving nodes. */
export function cursorAt(keys: CursorKey[], frame: number): Point {
  if (frame <= keys[0].f) return resolve(keys[0].at, frame);
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1],
      b = keys[i];
    if (frame <= b.f) {
      const t = interpolate(frame, [a.f, b.f], [0, 1], { easing: easeInOut });
      const pa = resolve(a.at, frame),
        pb = resolve(b.at, frame);
      return { x: pa.x + (pb.x - pa.x) * t, y: pa.y + (pb.y - pa.y) * t };
    }
  }
  return resolve(keys[keys.length - 1].at, frame);
}

export const Cursor: React.FC<{ keys: CursorKey[]; appear?: number; vanish?: number }> = ({ keys, appear = keys[0].f, vanish = Infinity }) => {
  const frame = useCurrentFrame();
  const p = cursorAt(keys, frame);
  const fadeIn = interpolate(frame, [appear, appear + 6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = Number.isFinite(vanish) ? interpolate(frame, [vanish - 6, vanish], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 1;
  const opacity = fadeIn * fadeOut;
  const clicks = keys.filter((k) => k.click && frame >= k.f && frame < k.f + 14);
  return (
    <>
      {clicks.map((k) => {
        const t = (frame - k.f) / 14;
        const c = resolve(k.at, k.f);
        return (
          <div
            key={k.f}
            style={{
              position: "absolute",
              left: c.x - 30 * t - 6,
              top: c.y - 30 * t - 6,
              width: 60 * t + 12,
              height: 60 * t + 12,
              border: "2px solid #7dff9a",
              opacity: (1 - t) * opacity,
            }}
          />
        );
      })}
      <svg width={34} height={40} viewBox="0 0 17 20" style={{ position: "absolute", left: p.x - 2, top: p.y - 2, opacity, filter: "drop-shadow(0 4px 10px rgba(0,0,0,.6))" }}>
        <path d="M1 1 L1 16 L5 12.5 L8 19 L10.6 17.8 L7.7 11.5 L13 11.5 Z" fill="#f4f8ff" stroke="#03050a" strokeWidth={1.1} strokeLinejoin="round" />
      </svg>
    </>
  );
};
