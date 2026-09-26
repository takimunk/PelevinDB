import { random, useCurrentFrame } from "remotion";

const GLYPHS = "!<>-_\\/[]{}=+*^?#%@$01";

/** Terminal-style reveal: each character scrambles, then locks in from left to right. */
export const Decode: React.FC<{ text: string; start?: number; speed?: number; scramble?: number; seed?: string }> = ({
  text,
  start = 0,
  speed = 1.4,
  scramble = 5,
  seed = text,
}) => {
  const frame = useCurrentFrame() - start;
  if (frame < 0) return <span style={{ opacity: 0 }}>{text}</span>;
  const out = [...text].map((ch, i) => {
    const lock = i / speed + scramble;
    if (ch === " " || frame >= lock) return ch;
    if (frame < i / speed) return " ";
    return GLYPHS[Math.floor(random(`${seed}-${i}-${frame}`) * GLYPHS.length)];
  });
  return <span style={{ whiteSpace: "pre" }}>{out.join("")}</span>;
};

/** Typewriter with a block caret. */
export const Typed: React.FC<{ text: string; start?: number; cps?: number; caret?: boolean }> = ({ text, start = 0, cps = 1.2, caret = true }) => {
  const frame = useCurrentFrame() - start;
  const shown = Math.max(0, Math.min(text.length, Math.floor(frame * cps)));
  const done = shown >= text.length;
  const blink = done ? Math.floor(frame / 8) % 2 === 0 : true;
  return (
    <span style={{ whiteSpace: "pre" }}>
      {text.slice(0, shown)}
      {caret && frame >= 0 && <span style={{ opacity: blink ? 1 : 0, background: "currentColor", marginLeft: 2 }}>&nbsp;</span>}
    </span>
  );
};
