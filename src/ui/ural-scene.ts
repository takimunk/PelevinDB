// Procedural point cloud for the home hero: a young man on a towel on a low rise of sand by an endless
// river, and the «УРАЛ» sign on the bank. World units are metres. The man sits at the origin facing +z;
// the river starts at the bank (z ≈ 2) and runs to the horizon. Everything is built once; all motion
// (head turn, breathing, the river's currents) happens in the shader.
//
// The figure and the head are signed-distance assemblies (smooth unions of capsules and ellipsoids, with
// no carved details: it is drawn in outline). Particles are sampled on each part and projected onto the blended surface, so the
// body has no seams; clothing, folds, hair and features are decided per particle from the same fields.

export const KIND = { ground: 0, towel: 1, body: 2, sign: 3, river: 4 } as const;

/** He sits on a low, flat-topped rise of sand. */
export const LIFT = 0.2;
/** Neck base: the head and neck turn about a vertical axis through this point. */
export const HEAD_PIVOT: [number, number, number] = [0, 0.59 + LIFT, -0.235];
/** River particles: z runs from the bank to the horizon on a log scale (see the shader). */
export const RIVER = { near: 2.04, far: 75, log: 4.5 };
/** Sign on the bank to the left of the view, near the water, turned so its board is foreshortened. */
/** Direction the sunlight travels: high, from behind-left, so shadows fall forward-right toward the water. */
export const SUN: [number, number, number] = (() => {
  const v = [-0.62, -0.62, 0.74];
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l] as [number, number, number];
})();
/** Ground area covered by the shadow mask: x0, z0, x1, z1. */
export const SHADOW_BOX: [number, number, number, number] = [-3.2, -1.6, 5.2, 5.6];
export const SIGN = { x: 3.9, z: 1.45, width: 1.24, height: 0.42, bottom: 1.68 };

type V = [number, number, number];

export type Prim = { t: "cap"; a: V; b: V; ra: number; rb: number; head: boolean } | { t: "ell"; c: V; ax: [V, V, V]; head: boolean };

export type SceneCloud = {
  count: number;
  /** Rest position; for river particles: (phase along the flow, 0, position across 0..1). */
  position: Float32Array;
  /** Surface normal; for river particles: (speed, current membership, train position). */
  normal: Float32Array;
  /** kind, strength (opacity 0..1; negative marks dark material such as hair), head-turn weight, breathing weight */
  data: Float32Array;
  /** Per-particle random 0..1. */
  seed: Float32Array;
  /**
   * 0 contour-only surface sample; 1 authored line (drawn at any angle); 2 shadow stipple (sand drawn
   * only where the shadow mask is dark, light theme); 3 contact shadow (light theme only).
   */
  line: Float32Array;
  /** Solid shapes inside the figure for a depth-only mesh that hides its far side. */
  prims: Prim[];
  /** River particles come first; this many. */
  riverCount: number;
};

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V, k: number): V => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: V) => Math.sqrt(dot(a, a));
const norm = (a: V): V => mul(a, 1 / (len(a) || 1));
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const lerp = (a: V, b: V, t: number): V => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export const bankZ = (x: number) => 2.0 + Math.sin(x * 0.35) * 0.12 + Math.sin(x * 0.9 + 1) * 0.04;
export const groundY = (x: number, z: number) => LIFT * (1 - smooth(1.35, 2.75, Math.hypot(x, (z - 0.15) * 1.1)));

class Builder {
  pos: number[] = [];
  nrm: number[] = [];
  dat: number[] = [];
  sd: number[] = [];
  sh: number[] = [];
  rand: () => number;
  constructor(rand: () => number) {
    this.rand = rand;
  }
  push(p: V, n: V, kind: number, strength: number, head = 0, breathe = 0, line = 0) {
    this.pos.push(p[0], p[1], p[2]);
    this.nrm.push(n[0], n[1], n[2]);
    this.dat.push(kind, strength, head, breathe);
    this.sd.push(this.rand());
    this.sh.push(line);
  }
  unit(): V {
    const u = this.rand() * 2 - 1;
    const th = this.rand() * Math.PI * 2;
    const q = Math.sqrt(1 - u * u);
    return [q * Math.cos(th), u, q * Math.sin(th)];
  }
  gauss() {
    return (this.rand() + this.rand() + this.rand() + this.rand() - 2) / 1.15;
  }
  build(prims: Prim[]): Omit<SceneCloud, "riverCount"> {
    return {
      count: this.sd.length,
      position: new Float32Array(this.pos),
      normal: new Float32Array(this.nrm),
      data: new Float32Array(this.dat),
      seed: new Float32Array(this.sd),
      line: new Float32Array(this.sh),
      prims,
    };
  }
}

// ---------------------------------------------------------------- signed distance assemblies

type Shape = { t: "cap"; a: V; b: V; ra: number; rb: number } | { t: "ell"; c: V; e: [V, V, V]; r: V };
type Tag = "skin" | "shirt" | "shorts" | "eye" | "lip" | "brow";
type Part = { s: Shape; k: number; tag: Tag; weight: number; carve?: boolean; name?: string };

const cap = (a: V, b: V, ra: number, rb: number): Shape => ({ t: "cap", a, b, ra, rb });
function ell(c: V, x: V, y: V, r: V): Shape {
  const ex = norm(x);
  const ez = norm(cross(ex, y));
  const ey = cross(ez, ex);
  return { t: "ell", c, e: [ex, ey, ez], r };
}
const ellA = (c: V, r: V) => ell(c, [1, 0, 0], [0, 1, 0], r);

function sdShape(s: Shape, p: V) {
  if (s.t === "cap") {
    const pa = sub(p, s.a);
    const ba = sub(s.b, s.a);
    const t = clamp(dot(pa, ba) / dot(ba, ba));
    return len(sub(pa, mul(ba, t))) - (s.ra + (s.rb - s.ra) * t);
  }
  const d = sub(p, s.c);
  const q0 = dot(d, s.e[0]) / s.r[0];
  const q1 = dot(d, s.e[1]) / s.r[1];
  const q2 = dot(d, s.e[2]) / s.r[2];
  const k0 = Math.sqrt(q0 * q0 + q1 * q1 + q2 * q2);
  const k1 = Math.sqrt((q0 / s.r[0]) ** 2 + (q1 / s.r[1]) ** 2 + (q2 / s.r[2]) ** 2);
  return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(...s.r);
}
function smin(a: number, b: number, k: number) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
function bound(s: Shape): [V, number] {
  if (s.t === "cap") return [lerp(s.a, s.b, 0.5), len(sub(s.b, s.a)) / 2 + Math.max(s.ra, s.rb)];
  return [s.c, Math.max(...s.r)];
}

class Assembly {
  parts: Part[];
  near: number[][];
  constructor(parts: Part[]) {
    this.parts = parts;
    const b = parts.map((p) => bound(p.s));
    // Only parts that can touch take part in a sample's field; keeps sampling cheap.
    this.near = parts.map((_, i) =>
      parts.map((_, j) => j).filter((j) => j === i || parts[j].carve || len(sub(b[i][0], b[j][0])) < b[i][1] + b[j][1] + 0.06),
    );
  }
  field(p: V, set: number[]) {
    let d = Infinity;
    for (const j of set) {
      const q = this.parts[j];
      if (q.carve) continue;
      const v = sdShape(q.s, p);
      d = d === Infinity ? v : smin(d, v, q.k);
    }
    for (const j of set) {
      const q = this.parts[j];
      if (!q.carve) continue;
      const v = -sdShape(q.s, p);
      const h = Math.max(q.k - Math.abs(d - v), 0) / q.k;
      d = Math.max(d, v) + h * h * q.k * 0.25;
    }
    return d;
  }
  grad(p: V, set: number[]): V {
    const e = 5e-4;
    return [
      (this.field([p[0] + e, p[1], p[2]], set) - this.field([p[0] - e, p[1], p[2]], set)) / (2 * e),
      (this.field([p[0], p[1] + e, p[2]], set) - this.field([p[0], p[1] - e, p[2]], set)) / (2 * e),
      (this.field([p[0], p[1], p[2] + e], set) - this.field([p[0], p[1], p[2] - e], set)) / (2 * e),
    ];
  }
  /** Projects p onto the blended surface; null if it does not converge. */
  project(p: V, set: number[]): V | null {
    for (let it = 0; it < 10; it++) {
      const d = this.field(p, set);
      if (Math.abs(d) < 2e-4) return p;
      const g = this.grad(p, set);
      const gg = dot(g, g);
      if (gg < 1e-6) return null;
      p = sub(p, mul(g, d / gg));
    }
    return null;
  }
  /** Samples on part i, projected onto the blended surface. */
  *sample(B: Builder, i: number, n: number): Generator<{ p: V; n: V; set: number[] }> {
    const s = this.parts[i].s;
    const set = this.near[i];
    let got = 0;
    for (let tries = 0; got < n && tries < n * 6; tries++) {
      let p: V;
      const v = B.unit();
      if (s.t === "cap") {
        const ab = sub(s.b, s.a);
        const along = dot(v, norm(ab));
        const t = clamp(B.rand() + (along > 0.6 ? 0.5 : along < -0.6 ? -0.5 : 0));
        p = add(add(s.a, mul(ab, t)), mul(v, s.ra + (s.rb - s.ra) * t));
      } else {
        p = add(s.c, add(add(mul(s.e[0], v[0] * s.r[0]), mul(s.e[1], v[1] * s.r[1])), mul(s.e[2], v[2] * s.r[2])));
      }
      if (this.field(p, set) < -0.005) continue; // buried inside a neighbour
      const q = this.project(p, set);
      if (!q) continue;
      got++;
      yield { p: q, n: norm(this.grad(q, set)), set };
    }
  }
}

function area(s: Shape) {
  if (s.t === "cap") return 2 * Math.PI * ((s.ra + s.rb) / 2) * len(sub(s.b, s.a)) + 2 * Math.PI * (s.ra * s.ra + s.rb * s.rb);
  const [a, b, c] = s.r;
  return 4 * Math.PI * Math.pow((Math.pow(a * b, 1.6) + Math.pow(a * c, 1.6) + Math.pow(b * c, 1.6)) / 3, 1 / 1.6);
}


// ---------------------------------------------------------------- the man

const LEAN = (27 * Math.PI) / 180;
const SPINE: V = [0, Math.cos(LEAN), -Math.sin(LEAN)];
const CHEST: V = [0, Math.sin(LEAN), Math.cos(LEAN)];
const X: V = [1, 0, 0];
const UP: V = [0, 1, 0];
const PELVIS: V = [0, 0.07, 0.01];
const at = (k: number) => add(PELVIS, mul(SPINE, k));
/** Head centre at rest (he looks at the river, +z). Anime proportions: a slightly larger head. */
const HEAD: V = [0, 0.752, -0.205];
/** Shoulder, elbow and wrist of each arm (side = ±1). */
function armJoints(side: number): [V, V, V] {
  const sh = add(at(0.475), [side * 0.158, 0, 0]);
  const wr: V = [side * 0.25, 0.05, -0.47];
  const el = add(lerp(sh, wr, 0.47), [side * 0.012, 0, 0.012]);
  return [sh, el, wr];
}

/** A clean, simplified hand: palm, the fingers as one tapered blade, and a thumb. */
function hand(side: number, wrist: V, parts: Part[]) {
  const dh = norm([side * 0.45, 0, -1]); // fingers point back and out
  const perp = norm(cross(UP, dh));
  const inward = mul(perp, dot(perp, [-side, 0, 0]) > 0 ? 1 : -1);
  const palm: V = add(add(wrist, mul(dh, 0.045)), [0, -0.03, 0]);
  parts.push({ s: ell(palm, perp, UP, [0.033, 0.012, 0.042]), k: 0.012, tag: "skin", weight: 2 });
  parts.push({ s: cap(wrist, add(palm, mul(dh, -0.02)), 0.022, 0.024), k: 0.012, tag: "skin", weight: 1.5 });
  parts.push({ s: ell(add(add(palm, mul(dh, 0.06)), [0, -0.004, 0]), perp, UP, [0.03, 0.008, 0.04]), k: 0.01, tag: "skin", weight: 2 });
  const tb = add(add(palm, mul(inward, 0.028)), mul(dh, -0.01));
  const tt = add(tb, add(mul(inward, 0.022), add(mul(dh, 0.04), [0, -0.008, 0])));
  parts.push({ s: cap(tb, tt, 0.01, 0.006), k: 0.008, tag: "skin", weight: 2.4 });
}

function bodyParts() {
  const P: Part[] = [];
  const torso = (s: Shape, tag: Tag = "shirt") => P.push({ s, k: 0.06, tag, weight: 1 });
  // a slim torso: pelvis → waist → ribcage → shoulders, blended into one surface
  torso(ell(at(0.06), X, SPINE, [0.13, 0.09, 0.1]), "shorts");
  torso(ell(at(0.2), X, SPINE, [0.112, 0.11, 0.085]));
  torso(ell(at(0.36), X, SPINE, [0.136, 0.12, 0.09]));
  torso(ell(at(0.47), X, SPINE, [0.165, 0.058, 0.078]));
  torso(ell(at(0.54), X, SPINE, [0.075, 0.04, 0.052]));
  P.push({ s: cap(at(0.55), [0, HEAD[1] - 0.085, HEAD[2] - 0.03], 0.034, 0.03), k: 0.03, tag: "skin", weight: 1.2, name: "neck" });

  for (const side of [-1, 1]) {
    const [sh, el, wr] = armJoints(side);
    P.push({ s: ell(sh, X, SPINE, [0.046, 0.046, 0.046]), k: 0.04, tag: "shirt", weight: 1 }); // shoulder
    P.push({ s: cap(sh, el, 0.036, 0.029), k: 0.025, tag: "skin", weight: 1 });
    // short sleeve, a little proud of the arm so the edge shows
    P.push({ s: cap(sh, lerp(sh, el, 0.6), 0.05, 0.046), k: 0.01, tag: "shirt", weight: 1 });
    P.push({ s: cap(el, wr, 0.028, 0.021), k: 0.018, tag: "skin", weight: 1.2 });
    hand(side, wr, P);
  }
  // long legs: right (−x) stretched out, left knee drawn up
  const legs: [V, V, V][] = [
    [
      [-0.085, 0.1, 0.05],
      [-0.1, 0.095, 0.5],
      [-0.11, 0.058, 0.96],
    ],
    [
      [0.085, 0.1, 0.05],
      [0.14, 0.43, 0.38],
      [0.16, 0.07, 0.68],
    ],
  ];
  for (const [hip, knee, ank] of legs) {
    P.push({ s: cap(hip, knee, 0.062, 0.04), k: 0.03, tag: "skin", weight: 1 });
    P.push({ s: cap(hip, lerp(hip, knee, 0.55), 0.08, 0.068), k: 0.012, tag: "shorts", weight: 1 });
    P.push({ s: cap(knee, ank, 0.04, 0.026), k: 0.025, tag: "skin", weight: 1 });
  }
  // feet: the right one upright on its heel, the left flat on the towel
  P.push({ s: cap([-0.11, 0.042, 0.95], [-0.12, 0.145, 1.035], 0.03, 0.02), k: 0.018, tag: "skin", weight: 1.4 });
  P.push({ s: cap([0.16, 0.032, 0.65], [0.18, 0.024, 0.83], 0.029, 0.02), k: 0.018, tag: "skin", weight: 1.4 });
  return P;
}

/**
 * The head at rest, anime-style: a round skull, a small V jaw and chin, a tiny nose, small ears, and
 * the hair: a cap over the crown plus separate tapered locks (spiky layered bangs, side locks framing
 * the face, spikes at the back and nape, and an ahoge) so the silhouette breaks into pointed locks.
 */
function headParts() {
  const h = (x: number, y: number, z: number): V => [HEAD[0] + x, HEAD[1] + y, HEAD[2] + z];
  const P: Part[] = [];
  const put = (s: Shape, k: number, weight = 1, tag: Tag = "skin", name?: string) => P.push({ s, k, tag, weight, name });
  put(ellA(h(0, 0.015, -0.01), [0.085, 0.092, 0.096]), 0.03, 1, "skin", "skull");
  put(ellA(h(0, -0.035, 0.025), [0.064, 0.055, 0.062]), 0.03, 0.8, "skin", "face");
  for (const s of [-1, 1]) {
    put(cap(h(s * 0.058, -0.035, 0.0), h(s * 0.006, -0.098, 0.064), 0.02, 0.009), 0.03, 1); // jaw line to the chin
    put(ell(h(s * 0.083, -0.018, -0.012), [0, 0, 1], norm([0, 1, 0.2]), [0.016, 0.022, 0.008]), 0.008, 3); // ear
  }
  put(cap(h(0, -0.012, 0.092), h(0, -0.03, 0.101), 0.006, 0.003), 0.01, 3); // nose
  // hair
  put(ellA(h(0, 0.045, -0.03), [0.094, 0.086, 0.1]), 0.012, 1, "skin", "hair");
  const lock = (root: V, mid: V, tip: V, r: number) => {
    P.push({ s: cap(root, mid, r, r * 0.6), k: 0.018, tag: "skin", weight: 1.6 });
    P.push({ s: cap(mid, tip, r * 0.6, 0.0015), k: 0.004, tag: "skin", weight: 1.6 });
  };
  // bangs: layered, pointed, falling over the forehead
  [-0.062, -0.034, -0.008, 0.02, 0.046, 0.07].forEach((x, i) => {
    const drop = [0.012, -0.004, 0.006, -0.01, 0.004, 0.016][i];
    lock(h(x * 0.8, 0.082, 0.045), h(x * 0.95, 0.05, 0.095), h(x * 1.12 + (i % 2 ? 0.006 : -0.006), drop, 0.103), 0.026);
  });
  // side locks framing the face
  for (const s of [-1, 1]) {
    lock(h(s * 0.078, 0.05, 0.03), h(s * 0.094, 0.0, 0.045), h(s * 0.09, -0.07, 0.04), 0.022);
    lock(h(s * 0.086, 0.04, -0.02), h(s * 0.1, -0.01, -0.02), h(s * 0.098, -0.06, -0.015), 0.022);
  }
  // spikes over the crown and back, and at the nape
  for (let i = 0; i < 9; i++) {
    const a = -0.9 + (i / 8) * 1.8; // across the back
    const dir = norm([Math.sin(a) * 0.9, 0.15 - Math.abs(Math.sin(a)) * 0.35, -Math.cos(a)]);
    const root = h(dir[0] * 0.06, 0.07 - Math.abs(dir[0]) * 0.03, -0.03 + dir[2] * 0.05);
    const tip = add(root, add(mul(dir, 0.1 + (i % 2) * 0.02), [0, -0.035, 0]));
    lock(root, lerp(root, tip, 0.5), tip, 0.03);
  }
  for (let i = 0; i < 5; i++) {
    const x = -0.05 + i * 0.025;
    lock(h(x, 0.0, -0.1), h(x * 1.1, -0.05, -0.11), h(x * 1.2, -0.095 - (i % 2) * 0.012, -0.1), 0.022);
  }
  for (let i = 0; i < 4; i++) {
    const x = -0.045 + i * 0.03;
    lock(h(x, 0.125, 0.0), h(x * 1.2, 0.14, -0.06), h(x * 1.3, 0.12, -0.12), 0.026); // top layer swept back
  }
  // ahoge: a single stray strand standing up from the crown
  P.push({ s: cap(h(0.004, 0.12, 0.02), h(0.012, 0.165, 0.035), 0.006, 0.004), k: 0.004, tag: "skin", weight: 3 });
  P.push({ s: cap(h(0.012, 0.165, 0.035), h(0.034, 0.178, 0.065), 0.004, 0.0012), k: 0.003, tag: "skin", weight: 3 });
  return P;
}

const TAU = Math.PI * 2;
/** The figure is drawn with the same weight as the sand, river and sign. */
const FIGURE_INK = 0.45;

function man(B: Builder, total: number) {
  const body = new Assembly(bodyParts());
  const headA = new Assembly(headParts());
  const [, py, pz] = HEAD_PIVOT;
  const pivotY = py - LIFT;
  const neckWeight = (p: V) => clamp((p[1] - pivotY) / 0.1) * (Math.abs(p[2] - pz) < 0.2 ? 1 : 0);

  // Surface samples. They carry normals only: the shader keeps those on the silhouette (n·v ≈ 0) and
  // drops the rest, so the figure is drawn in contour and stays correct as the head and camera move.
  const place = (A: Assembly, share: number, headPart: boolean) => {
    const weights = A.parts.map((q) => (q.carve ? 0 : area(q.s) * q.weight));
    const sum = weights.reduce((a, b) => a + b, 0);
    A.parts.forEach((part, i) => {
      if (part.carve) return;
      for (const { p, n, set } of A.sample(B, i, Math.round((weights[i] / sum) * share))) {
        if (p[1] < 0.003) continue;
        let hw = headPart ? 1 : 0;
        if (!headPart && part.name === "neck") hw = neckWeight(p);
        const up = dot(sub(p, PELVIS), SPINE) / 0.6;
        const bw = !headPart && part.tag === "shirt" ? Math.sin(Math.PI * clamp((up - 0.2) / 0.65)) : 0;
        B.push(p, n, KIND.body, FIGURE_INK, hw, bw, 0);
      }
    });
  };
  place(body, total * 0.66, false);
  place(headA, total * 0.18, true);

  // Authored feature lines, drawn whatever the angle (the occluder still hides the far side).
  const nearSet = (A: Assembly, c: V, r: number) =>
    A.parts
      .map((q, i) => [q, i] as const)
      .filter(([q]) => {
        const [bc, br] = bound(q.s);
        return len(sub(bc, c)) < br + r + 0.12;
      })
      .map(([, i]) => i);
  const line = (A: Assembly, pts: V[], set: number[], strength: number, head: boolean, lift = 0.0015) => {
    for (const s of pts) {
      const p = A.project(s, set);
      if (!p) continue;
      const n = norm(A.grad(p, set));
      const q = add(p, mul(n, lift));
      B.push(q, n, KIND.body, strength, head ? 1 : neckWeight(q), 0, 1);
    }
  };
  /** A ring (or arc) around an axis, projected onto the surface; th = 0 points along `ref`. */
  const ring = (A: Assembly, c: V, axis: V, r: number, count: number, strength: number, head = false, arc: [number, number] = [0, TAU], ref: V = CHEST, wobble = 0) => {
    const a = norm(axis);
    const u = norm(sub(ref, mul(a, dot(ref, a))));
    const w = cross(a, u);
    const pts: V[] = [];
    for (let i = 0; i < count; i++) {
      const th = arc[0] + (arc[1] - arc[0]) * B.rand();
      const off = mul(a, Math.sin(th * 3 + 1) * wobble);
      pts.push(add(add(c, off), add(mul(u, Math.cos(th) * r), mul(w, Math.sin(th) * r))));
    }
    line(A, pts, nearSet(A, c, r), strength, head);
  };
  // T-shirt: crew neck, hem and sleeve edges; everything else is silhouette.
  const neckBase = at(0.55);
  const neckTop: V = [0, HEAD[1] - 0.085, HEAD[2] - 0.03];
  const neckAxis = norm(sub(neckTop, neckBase));
  ring(body, add(neckBase, mul(neckAxis, 0.008)), neckAxis, 0.08, 380, FIGURE_INK, false, [0, TAU], CHEST, 0.004);
  ring(body, at(0.13), SPINE, 0.22, 900, FIGURE_INK, false, [0, TAU], CHEST, 0.006);
  for (const side of [-1, 1]) {
    const [sh, el] = armJoints(side);
    ring(body, lerp(sh, el, 0.6), sub(el, sh), 0.08, 300, FIGURE_INK, false, [0, TAU], [0, 1, 0]);
  }

  // Solid stand-ins for the occluder: every part, hair locks included, so hair is solid too
  // (the renderer insets each one in proportion to its size).
  const toPrim = (q: Part, head: boolean): Prim | null => {
    if (q.carve) return null;
    const s = q.s;
    if (s.t === "cap") return Math.max(s.ra, s.rb) < 0.004 ? null : { t: "cap", a: s.a, b: s.b, ra: s.ra, rb: s.rb, head };
    return { t: "ell", c: s.c, ax: [mul(s.e[0], s.r[0]), mul(s.e[1], s.r[1]), mul(s.e[2], s.r[2])], head };
  };
  return [...body.parts.map((q) => toPrim(q, false)), ...headA.parts.map((q) => toPrim(q, true))].filter((q): q is Prim => q !== null);
}

// ---------------------------------------------------------------- towel, sand, river, sign

function towel(B: Builder, n: number) {
  const w = 0.92;
  const l = 1.9;
  const z0 = -0.8;
  for (let i = 0; i < n; i++) {
    const u = B.rand();
    const v = B.rand();
    const stripe = [0.07, 0.11, 0.89, 0.93].some((c) => Math.abs(v - c) < 0.012);
    const hem = u < 0.02 || u > 0.98 || v < 0.012 || v > 0.988;
    if (!stripe && !hem && B.rand() < 0.45) continue;
    const p: V = [(u - 0.5) * w, 0.008 + Math.sin(u * 9 + v * 4) * 0.004, z0 + v * l];
    B.push(p, UP, KIND.towel, stripe ? 0.85 : hem ? 0.8 : 0.32, 0, 0);
  }
  for (let i = 0; i < 1400; i++) {
    const u = B.rand();
    const end = B.rand() < 0.5 ? 0 : 1;
    if (Math.floor(u * 60) % 2) continue;
    B.push([(u - 0.5) * w, 0.006, z0 + end * l + (end ? 1 : -1) * B.rand() * 0.04], UP, KIND.towel, 0.6, 0, 0);
  }
  // Contact shadow: a thin stippled band just outside the towel's down-sun edges (−x side and far end).
  for (let i = 0; i < 1600; i++) {
    const out = Math.pow(B.rand(), 1.6) * 0.03;
    const p: V = B.rand() < 0.55 ? [-w / 2 - out, 0.002, z0 + B.rand() * l] : [(B.rand() - 0.5) * w, 0.002, z0 + l + out];
    B.push(p, UP, KIND.towel, 0.32 * (1 - out / 0.03), 0, 0, 3);
  }
}

/** Extra sand where shadows can fall (around him and the sign); drawn only inside the shadow mask. */
function shadowSand(B: Builder, n: number) {
  const areas: [number, number, number, number, number][] = [
    [-2.2, -0.9, 0.6, 2.1, 0.85], // x0, z0, x1, z1, share
    [2.6, 1.2, 4.2, 2.2, 0.15],
  ];
  for (const [x0, z0, x1, z1, share] of areas) {
    for (let i = 0; i < n * share; i++) {
      const x = x0 + B.rand() * (x1 - x0);
      const z = z0 + B.rand() * (z1 - z0);
      if (z > bankZ(x) - 0.02) continue;
      B.push([x, groundY(x, z) + 0.003, z], UP, KIND.ground, 1, 0, 0, 2);
    }
  }
}

function sand(B: Builder, n: number) {
  for (let i = 0; i < n; i++) {
    const x = -18 + B.rand() * 36;
    const z = -8 + B.rand() * (bankZ(x) + 8);
    if (Math.hypot(x, z) > 2.5 && B.rand() < 0.25) continue; // a touch denser on the rise
    B.push([x, groundY(x, z), z], UP, KIND.ground, 0.1 + B.rand() * 0.2, 0, 0);
  }
  // The wet edge of the bank: a faint, slightly denser line.
  for (let i = 0; i < n * 0.12; i++) {
    const x = -18 + B.rand() * 36;
    const z = bankZ(x) - 0.02 - Math.abs(B.gauss()) * 0.07;
    B.push([x, 0, z], UP, KIND.ground, 0.42, 0, 0);
  }
}

function river(B: Builder, n: number) {
  // Two populations: slow water everywhere, and about a third of the particles riding the currents —
  // faster, pulled into the current lines, travelling in longer trains.
  let made = 0;
  while (made < n) {
    // current riders, lone drifters (any speed, loosely pulled), and slow water
    const r = B.rand();
    const kind = r < 0.34 ? 1 : r < 0.56 ? 0.5 : 0;
    const across = B.rand();
    const speed = kind === 1 ? 1.5 + B.rand() * 1.1 : kind === 0.5 ? 0.2 + B.rand() * 2.2 : 0.5 + B.rand() * 0.5;
    const count = kind === 1 ? 6 + Math.floor(B.rand() * 12) : kind === 0.5 ? 1 : 2 + Math.floor(B.rand() * 5);
    const head = B.rand();
    const gap = kind === 1 ? 0.0012 : 0.0016;
    const strength = kind === 1 ? 0.8 + B.rand() * 0.2 : 0.4 + B.rand() * 0.35;
    for (let k = 0; k < count && made < n; k++, made++) {
      const taper = count > 1 ? Math.sin((Math.PI * (k + 0.5)) / count) : 1;
      B.push([head - k * gap, 0, clamp(across + B.gauss() * 0.0008)], [speed, kind, k / count], KIND.river, strength * (0.4 + 0.6 * taper), 0, 0);
    }
  }
}

function signText(text: string) {
  const W = 780;
  const H = 240;
  // Works on the main thread and in a worker (OffscreenCanvas).
  let g: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;
  if (typeof OffscreenCanvas !== "undefined") g = new OffscreenCanvas(W, H).getContext("2d", { willReadFrequently: true });
  else if (typeof document !== "undefined") {
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    g = c.getContext("2d", { willReadFrequently: true });
  }
  if (!g) return null;
  g.fillStyle = "#000";
  g.textAlign = "center";
  g.textBaseline = "middle";
  let size = 200;
  const font = (px: number) => `700 ${px}px "IBM Plex Sans", "Helvetica Neue", Arial, sans-serif`;
  g.font = font(size);
  const w = g.measureText(text).width;
  if (w > W * 0.86) size *= (W * 0.86) / w;
  g.font = font(size);
  g.fillText(text, W / 2, H / 2 + size * 0.04);
  return { W, H, pixels: g.getImageData(0, 0, W, H).data };
}

function sign(B: Builder, n: number, facing: number) {
  const { x, z, width: w, height: h, bottom } = SIGN;
  const cy = Math.cos(facing);
  const sy = Math.sin(facing);
  const place = (lx: number, ly: number, lz: number): V => [x + lx * cy + lz * sy, ly, z - lx * sy + lz * cy];
  const nrm: V = [sy, 0, cy];
  const board = (lx: number, ly: number, strength: number) => B.push(place(lx, bottom + ly, 0), nrm, KIND.sign, strength, 0, 0);
  const perimeter = (inset: number, count: number, strength: number) => {
    const ww = w - inset * 2;
    const hh = h - inset * 2;
    const P = 2 * (ww + hh);
    for (let i = 0; i < count; i++) {
      let d = B.rand() * P;
      const j = () => B.gauss() * 0.0025;
      if (d < ww) board(-ww / 2 + d, inset + j(), strength);
      else if ((d -= ww) < hh) board(ww / 2 + j(), inset + d, strength);
      else if ((d -= hh) < ww) board(ww / 2 - d, h - inset + j(), strength);
      else board(-ww / 2 + j(), h - inset - (d - ww), strength);
    }
  };
  perimeter(0, Math.round(n * 0.13), 0.95);
  perimeter(0.03, Math.round(n * 0.09), 0.75);
  for (let i = 0; i < n * 0.14; i++) board((B.rand() - 0.5) * w, B.rand() * h, 0.2);
  const img = signText("УРАЛ");
  const letters = Math.round(n * 0.56);
  if (img) {
    const { W, H, pixels } = img;
    const ih = h - 0.08;
    const iw = (ih * W) / H;
    let got = 0;
    for (let tries = 0; got < letters && tries < letters * 40; tries++) {
      const px = B.rand() * W;
      const py = B.rand() * H;
      if (pixels[((py | 0) * W + (px | 0)) * 4 + 3] < 128) continue;
      got++;
      board((px / W - 0.5) * iw, h / 2 + (0.5 - py / H) * ih, 1);
    }
  }
  // One post, behind the board, from the sand up to the board's top edge.
  for (let i = 0; i < n * 0.08; i++) {
    const a = B.rand() * Math.PI * 2;
    const y = B.rand() * (bottom + h - 0.02);
    const r = 0.028;
    const lx = Math.cos(a) * r;
    const lz = -0.035 + Math.sin(a) * r;
    B.push(place(lx, y, lz), [Math.cos(a) * cy + Math.sin(a) * sy, 0, -Math.cos(a) * sy + Math.sin(a) * cy], KIND.sign, y > bottom ? 0.35 : 0.8, 0, 0);
  }
}

export function buildScene(opts: { signFacing: number; density?: number; riverDensity?: number }): SceneCloud {
  const k = opts.density ?? 1;
  const B = new Builder(rng(1993));
  // River first: the renderer draws it separately (a density pass feeds its brightness).
  river(B, Math.round(170000 * (opts.riverDensity ?? 1)));
  const riverCount = B.sd.length;
  sand(B, Math.round(15000 * k));
  shadowSand(B, Math.round(42000 * (opts.riverDensity ?? 1) ** 0.5));
  // The figure and towel sit on the rise: build them on flat ground, then lift.
  const from = B.sd.length;
  towel(B, Math.round(9000 * k));
  const prims = man(B, Math.round(62000 * k));
  for (let i = from; i < B.sd.length; i++) B.pos[i * 3 + 1] += LIFT;
  const lift = (v: V): V => [v[0], v[1] + LIFT, v[2]];
  const lifted = prims.map((q): Prim => (q.t === "cap" ? { ...q, a: lift(q.a), b: lift(q.b) } : { ...q, c: lift(q.c) }));
  sign(B, Math.round(14000 * k), opts.signFacing);
  return { ...B.build(lifted), riverCount };
}
