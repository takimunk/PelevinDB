import { DEFAULT_WEIGHTS, WEIGHT_PRESETS, type Weights } from "../../domain/fingerprint.ts";
import { DEFAULT_AXES, type AxisChoice } from "./axes.ts";
import type { GraphMode } from "./BookGraph.tsx";

/** A ready-made question to ask the map: which axes, 2D or 3D, and how books are compared. */
export type MapPreset = { id: string; label: string; question: string; mode: GraphMode; axes: AxisChoice[]; weights: Weights };

const weights = (id: string) => WEIGHT_PRESETS.find((p) => p.id === id)!.weights;

export const MAP_PRESETS: MapPreset[] = [
  { id: "pca", label: "Overview", question: "The three directions in which books differ most", mode: "3d", axes: DEFAULT_AXES, weights: DEFAULT_WEIGHTS },
  {
    id: "ending",
    label: "Ending vs opening",
    question: "Light in the first act across, light in the last act up: tragedies sink to the bottom",
    mode: "2d",
    axes: ["arc:act0", "arc:act4", "pc2"],
    weights: DEFAULT_WEIGHTS,
  },
  { id: "laugh", label: "Laughing in the dark", question: "Humour against light: bottom right is dark comedy", mode: "2d", axes: ["texture:humor", "texture:valence", "pc2"], weights: DEFAULT_WEIGHTS },
  { id: "thrill", label: "Thrill", question: "Tension, pace and fear: where the page-turners cluster", mode: "3d", axes: ["texture:tension", "texture:pace", "emotions:fear"], weights: weights("feel") },
  { id: "head", label: "Head vs heart", question: "Abstract ideas against sadness", mode: "2d", axes: ["texture:ideas", "emotions:sadness", "pc2"], weights: DEFAULT_WEIGHTS },
  { id: "voice", label: "Talk vs thought", question: "Dialogue share against a character's inner voice", mode: "2d", axes: ["mode:dialogue", "mode:introspection", "pc2"], weights: weights("craft") },
  { id: "hope", label: "Hope vs reality", question: "Worldview against how fantastical the world is", mode: "2d", axes: ["profile:worldview", "profile:realism", "pc2"], weights: weights("about") },
  { id: "epic", label: "Epic vs intimate", question: "Scope, interiority and war", mode: "3d", axes: ["profile:scope", "texture:interiority", "themes:war"], weights: DEFAULT_WEIGHTS },
  { id: "themes", label: "Love, death, money", question: "Three themes as three axes", mode: "3d", axes: ["themes:love", "themes:death", "themes:money"], weights: weights("about") },
];

const same = (a: AxisChoice[], b: AxisChoice[], n: number) => a.slice(0, n).every((c, i) => c === b[i]);

export const matchPreset = (mode: GraphMode, axes: AxisChoice[], w: Weights) =>
  MAP_PRESETS.find((p) => p.mode === mode && same(p.axes, axes, mode === "2d" ? 2 : 3) && Object.entries(p.weights).every(([k, v]) => w[k as keyof Weights] === v))?.id;
