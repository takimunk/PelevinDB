import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useTheme } from "../i18n/index.ts";
import { buildScene, HEAD_PIVOT, RIVER, SHADOW_BOX, SIGN, SUN, type Prim, type SceneCloud } from "./ural-scene.ts";

// «Чапаев и Пустота»: the Urals as a river. A young man on a towel on a low rise of sand leans back on
// his arms, looking at an endless river; now and then he almost turns to us, then looks back. Particles
// throughout: ink on paper in the light theme, light on dark paper in the dark one. The man is drawn
// in contour only. Decorative; fills its parent box.

const vertex = (densityPass: boolean) => /* glsl */ `
  attribute vec4 aData;   // kind, strength, head weight, breathing weight
  attribute float aSeed;
  attribute float aLine;  // 1 = authored line, 0 = surface sample (drawn only on the silhouette)
  uniform float uTime;
  uniform float uFlow;
  uniform float uYaw;
  uniform float uPitch;
  uniform float uBreath;
  uniform float uSize;
  uniform float uRefDist;
  uniform float uIntro;
  uniform float uRiverGain;
  uniform float uRiverSize;
  uniform float uDark;
  uniform vec2 uFade;
  uniform vec2 uHaze;
  uniform vec3 uPivot;
  uniform vec4 uRiverAxis; // camera x, camera z, view slope dx/dz, span per metre of depth
  uniform vec3 uRiver;     // near bank z, far z, log scale
  uniform sampler2D uDensity;
  uniform sampler2D uShadowMap;
  uniform vec4 uShadowBox;  // ground x0, z0, x1, z1 covered by the mask
  uniform vec2 uShadowTexel;
  uniform vec3 uSun;
  uniform float uShadowOn;  // light theme only
  varying float vAlpha;
  vec3 turnHead(vec3 v, float yaw, float pitch) {
    float cp = cos(pitch), sp = sin(pitch);
    v = vec3(v.x, cp * v.y - sp * v.z, sp * v.y + cp * v.z);
    float cy = cos(yaw), sy = sin(yaw);
    return vec3(cy * v.x + sy * v.z, v.y, -sy * v.x + cy * v.z);
  }

  const float TAU = 6.2831853;

  // Shadow at a ground point: follow the sun ray back to y = 0 and read the (blurred) mask there.
  float shadowAt(vec3 q) {
    vec2 g = q.xz + uSun.xz * (q.y / -uSun.y);
    vec2 uv = (g - uShadowBox.xy) / (uShadowBox.zw - uShadowBox.xy);
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 0.0;
    float s = 0.0;
    for (int i = -1; i <= 1; i++)
      for (int j = -1; j <= 1; j++) s += texture2D(uShadowMap, uv + vec2(float(i), float(j)) * uShadowTexel * 2.2).r;
    return s / 9.0;
  }

  float rowSpan(float z) { return 12.0 + uRiverAxis.w * max(1.0, z - uRiverAxis.y); }
  float rowCentre(float z) { return uRiverAxis.x + (z - uRiverAxis.y) * uRiverAxis.z; }

  void main() {
    float kind = aData.x;
    float alpha = abs(aData.y);
    vec3 p = position;
    vec3 n = normal;
    bool river = kind > 3.5;
    float current = 0.0;
    float glint = 0.0;

    if (river) {
      // Depth from the bank to the horizon on a log scale, so the screen is evenly filled.
      float zN = uRiver.x;
      float scale = (uRiver.y - zN) / (exp(uRiver.z) - 1.0);
      float z0 = zN + (exp(position.z * uRiver.z) - 1.0) * scale;
      // Across the view: each depth row spans what the camera sees there, flowing toward −x.
      float span = rowSpan(z0);
      float f = fract(position.x + uFlow * normal.x * 0.9 / span);
      float xb = rowCentre(z0) + span * (0.5 - f);
      float grow = 1.0 + 0.06 * (z0 - zN);

      // Currents: three families of meandering lines whose positions drift with time; where one
      // family fades and another rises they merge and split. Riders are pulled hard into the lines,
      // drifters loosely, slow water barely.
      float ph = 2.4 * log(1.0 + (z0 - zN) / 2.5);
      float dph = 2.4 / (2.5 + z0 - zN);
      float w1 = 0.9 * sin(0.11 * xb + 0.05 * uTime) + 0.5 * sin(0.27 * xb - 0.08 * uTime + 1.3 + z0 * 0.1);
      float w2 = 0.8 * sin(0.09 * xb + 0.04 * uTime + 2.1) + 0.4 * sin(0.33 * xb + 0.07 * uTime - z0 * 0.13);
      float w3 = 0.7 * sin(0.15 * xb - 0.06 * uTime + 4.0) + 0.6 * sin(0.21 * xb + 0.05 * uTime + z0 * 0.21);
      float p1 = ph + w1;
      float p2 = ph * 1.37 + w2;
      float p3 = ph * 0.71 + w3;
      float m1 = 0.5 + 0.5 * sin(0.07 * xb - 0.06 * uTime + z0 * 0.05);
      float m3 = 0.5 + 0.5 * sin(0.05 * xb + 0.045 * uTime - z0 * 0.08 + 1.0);
      float b1 = pow(0.5 + 0.5 * cos(TAU * p1), 4.0) * m1;
      float b2 = pow(0.5 + 0.5 * cos(TAU * p2), 4.0) * (1.0 - m1);
      float b3 = pow(0.5 + 0.5 * cos(TAU * p3), 5.0) * m3;
      current = max(max(b1, b2), b3);
      float pull = normal.y > 0.75 ? 0.92 : normal.y > 0.25 ? 0.5 : 0.18;
      float dz = -pull * (m1 * sin(TAU * p1) / (TAU * dph) + (1.0 - m1) * sin(TAU * p2) / (TAU * dph * 1.37)) * (1.0 - 0.5 * m3)
                 - pull * m3 * 0.5 * sin(TAU * p3) / (TAU * dph * 0.71);
      // Surges and turbulence: a coherent flow field, so trains stay trains while the water churns.
      float surge = sin(0.42 * xb - 1.3 * uTime + z0 * 0.7);
      float x = xb + current * 0.5 * surge + 0.35 * grow * sin(0.45 * xb + 0.31 * z0 + 0.7 * uTime) * (1.0 - current);
      float z = z0 + dz + 0.16 * grow * sin(0.8 * xb + 0.6 * z0 - 0.5 * uTime) * sin(0.37 * xb - 0.9 * z0 + 0.3 * uTime) * (1.0 - current);

      // Eddies: they drift downstream, spin up, and dissolve before they wrap around.
      for (int i = 0; i < 4; i++) {
        float fi = float(i);
        float ez = zN + 2.2 + fi * fi * 2.4 + fi * 1.5;
        float life = fract(uFlow * (0.018 + 0.006 * fi) + fi * 0.37);
        float ex = rowCentre(ez) + rowSpan(ez) * 0.34 * (0.5 - life) * 2.0;
        float R = 0.9 + 0.55 * fi;
        vec2 d = vec2(x - ex, (z - ez) * 1.5);
        float fall = exp(-dot(d, d) / (R * R));
        float ang = fall * 2.6 * sin(3.14159 * life) * (mod(fi, 2.0) < 0.5 ? 1.0 : -1.0);
        float ca = cos(ang), sa = sin(ang);
        d = vec2(ca * d.x - sa * d.y, sa * d.x + ca * d.y);
        x = ex + d.x;
        z = ez + d.y / 1.5;
        current = max(current, fall * sin(3.14159 * life) * 0.8);
      }
      z += (sin(x * 0.35) * 0.12 + sin(x * 0.9 + 1.0) * 0.04) * (1.0 - smoothstep(0.0, 2.0, z0 - zN));
      float shore = smoothstep(zN - 0.05, zN + 0.25, z); // water pushed up the bank fades out
      float y = 0.012 + sin(x * 1.7 + uTime * 1.3 + z * 3.0) * 0.012 + sin(x * 0.6 - uTime * 0.8 + z * 1.1) * 0.01;
      p = vec3(x, y, z);
      n = vec3(0.0, 1.0, 0.0);

      float ends = smoothstep(0.0, 0.1, f) * smoothstep(1.0, 0.9, f) * smoothstep(0.0, 0.3, z0 - zN) * shore;
      float tw = 0.5 + 0.5 * sin(uTime * (1.1 + aSeed * 2.4) + aSeed * 91.0 + x * 0.9);
      glint = pow(tw, 10.0) * ends;
      alpha *= ends * (0.55 + 0.55 * tw) * (0.5 + 0.7 * current) * (0.85 + 0.3 * surge * current);
    } else {
      float hw = aData.z;
      if (hw > 0.0) {
        p = uPivot + turnHead(p - uPivot, uYaw * hw, uPitch * hw);
        n = turnHead(n, uYaw * hw, uPitch * hw);
      }
      // Hair strokes (w < 0) stay quiet as light on dark, or the head turns into a pale helmet.
      if (aData.w < -0.5) alpha *= mix(1.0, 0.3, uDark);
      else p += n * (0.004 * uBreath * aData.w);
    }

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float dist = length(mv.xyz);
    ${
      densityPass
        ? `
    // Density pass (quarter resolution, additive): every river particle deposits a little ink.
    gl_PointSize = 2.0;
    vAlpha = river ? alpha * 0.05 * (1.0 - smoothstep(uHaze.x, uHaze.y, dist)) : 0.0;
    `
        : `
    gl_PointSize = uSize * clamp(uRefDist / dist, 0.5, 1.3);
    if (river) {
      // Light gathers where the water bunches up: read the local density back from the small target.
      vec2 uv = gl_Position.xy / gl_Position.w * 0.5 + 0.5;
      float bunch = smoothstep(0.06, 0.75, texture2D(uDensity, uv).r);
      gl_PointSize *= uRiverSize;
      alpha = alpha * mix(0.35, 1.9, bunch) * uRiverGain + glint * (0.25 + 1.1 * bunch);
      alpha *= 1.0 - smoothstep(uHaze.x, uHaze.y, dist);
      // the sign's shadow reaches the water: a faint darkening near the bank
      if (uShadowOn > 0.5) alpha *= 1.0 + 0.7 * shadowAt(p);
    } else {
      if (aLine > 1.5) {
        // Shadow stipple (light theme): extra sand that only shows inside the projected shadow, and
        // the contact band at the towel's edges.
        alpha = uShadowOn * (aLine > 2.5 ? alpha : 0.9 * smoothstep(0.04, 0.8, shadowAt(p)));
      } else if (kind < 1.5 && uShadowOn > 0.5) {
        alpha *= 1.0 + 2.2 * shadowAt(p); // existing sand and towel darken in shadow
      }
      if (kind > 1.5 && kind < 2.5 && aLine < 0.5) {
        // The figure in contour: keep the samples where the surface turns away from the eye.
        vec3 vn = normalize(normalMatrix * n);
        float facing = abs(dot(vn, normalize(-mv.xyz)));
        alpha *= smoothstep(0.26, 0.04, facing);
      }
      alpha *= 1.0 - smoothstep(uFade.x, uFade.y, dist);
    }
    alpha *= smoothstep(aSeed * 0.55, aSeed * 0.55 + 0.45, uIntro);
    vAlpha = alpha;
    `
    }
  }
`;

const fragment = /* glsl */ `
  uniform vec3 uInk;
  uniform float uOpacity;
  varying float vAlpha;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = min(1.0, vAlpha) * uOpacity * (1.0 - smoothstep(0.3, 0.5, d));
    if (a < 0.004) discard;
    gl_FragColor = vec4(uInk, a);
  }
`;

const densityFragment = /* glsl */ `
  varying float vAlpha;
  void main() {
    if (length(gl_PointCoord - 0.5) > 0.5) discard;
    gl_FragColor = vec4(vAlpha, 0.0, 0.0, 1.0);
  }
`;

// Camera framings for a wide (2:1) and a tall (4:5) hero; anything between is interpolated.
const WIDE = { aspect: 2, fov: 34, pos: new THREE.Vector3(-2.9, 2.05, -3.3), target: new THREE.Vector3(1.0, 0.35, 3.6) };
/** Narrow 16:9 strips (phones, small tablets): a touch wider and aimed further along the bank, so the
 * sign, the river and the man with his shadow all fit, with less empty sand in front. */
const STRIP = { fov: 37, pos: new THREE.Vector3(-3.0, 2.2, -3.4), target: new THREE.Vector3(1.55, 0.5, 3.9) };
const TALL = { aspect: 0.8, fov: 52, pos: new THREE.Vector3(-1.7, 2.3, -3.5), target: new THREE.Vector3(1.9, 0.2, 2.2) };
/** The sign's board runs along the river (its plane parallel to the flow), facing the land side. */
const SIGN_FACING = Math.PI;

const REST_YAW = -0.32; // slightly toward us
const reducedMotion = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

type Key = { to: number; dur: number; hold: number };

/** The head's little drama: glances, hesitations, near-turns, all eased and never quite periodic. */
function headPlanner(rand = Math.random) {
  const queue: Key[] = [];
  let from = REST_YAW;
  let to = REST_YAW;
  let t = 0;
  let dur = 1;
  let hold = 3;
  const plan = () => {
    const r = rand();
    const rest = { to: REST_YAW + (rand() - 0.5) * 0.08, dur: 2.2 + rand(), hold: 3 + rand() * 5 };
    if (r < 0.3) {
      // hesitation: starts to turn, thinks better of it
      queue.push({ to: -0.62 - rand() * 0.12, dur: 1.5 + rand() * 0.6, hold: 0.3 + rand() * 0.4 }, rest);
    } else if (r < 0.7) {
      queue.push({ to: -0.95 - rand() * 0.25, dur: 2.3 + rand() * 0.8, hold: 1 + rand() * 1.4 }, { ...rest, dur: 2.8 + rand() });
    } else {
      // almost faces us, holds a beat, and slowly returns to the river
      queue.push({ to: -0.62, dur: 1.6, hold: 0.5 + rand() * 0.6 }, { to: -1.42 - rand() * 0.12, dur: 2.4 + rand() * 0.6, hold: 1.8 + rand() * 1.2 }, { ...rest, dur: 3.6 + rand() });
    }
  };
  return (dt: number) => {
    t += dt;
    if (t > dur + hold) {
      if (!queue.length) plan();
      const k = queue.shift()!;
      from = to;
      to = k.to;
      dur = k.dur;
      hold = k.hold;
      t = 0;
    }
    return from + (to - from) * ease(Math.min(1, t / dur));
  };
}

/**
 * An invisible solid version of the figure, drawn into the depth buffer only, so nothing on the far
 * side of his body (contours, hems, the sand behind him) shows through.
 */
function occluder(prims: Prim[], maxInset = 0.012) {
  // Thin parts (hair locks, fingers) get a proportionally smaller inset so they still occlude.
  const inset = (r: number) => Math.min(maxInset, r * 0.35);
  const body = new THREE.Group();
  const head = new THREE.Group();
  const pivot = new THREE.Vector3(...HEAD_PIVOT);
  head.position.copy(pivot);
  const material = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });
  const sphere = new THREE.SphereGeometry(1, 18, 12);
  const geometries: THREE.BufferGeometry[] = [sphere];
  const put = (mesh: THREE.Mesh, onHead: boolean) => {
    if (onHead) mesh.position.sub(pivot);
    mesh.renderOrder = -1;
    (onHead ? head : body).add(mesh);
  };
  const ball = (c: THREE.Vector3, r: number, onHead: boolean) => {
    const m = new THREE.Mesh(sphere, material);
    m.position.copy(c);
    m.scale.setScalar(Math.max(0.0005, r - inset(r)));
    put(m, onHead);
  };
  for (const q of prims) {
    if (q.t === "cap") {
      const a = new THREE.Vector3(...q.a);
      const b = new THREE.Vector3(...q.b);
      const g = new THREE.CylinderGeometry(Math.max(0.0005, q.rb - inset(q.rb)), Math.max(0.0005, q.ra - inset(q.ra)), a.distanceTo(b), 12, 1, true);
      geometries.push(g);
      const m = new THREE.Mesh(g, material);
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      put(m, q.head);
      ball(a, q.ra, q.head);
      ball(b, q.rb, q.head);
    } else if (q.t === "ell") {
      const m = new THREE.Mesh(sphere, material);
      const axes = q.ax.map((v) => {
        const w = new THREE.Vector3(...v);
        const r = w.length();
        return w.multiplyScalar(Math.max(0.0005, r - inset(r)) / r);
      });
      const o = q.head ? pivot : new THREE.Vector3();
      m.matrixAutoUpdate = false;
      m.matrix.makeBasis(axes[0], axes[1], axes[2]).setPosition(q.c[0] - o.x, q.c[1] - o.y, q.c[2] - o.z);
      m.renderOrder = -1;
      (q.head ? head : body).add(m);
    }
  }
  body.add(head);
  return { body, head, dispose: () => (geometries.forEach((g) => g.dispose()), material.dispose()) };
}

type BuildOptions = { signFacing: number; riverDensity: number };

/** Builds the cloud in a worker when possible so the first paint and input stay smooth. */
function loadCloud(opts: BuildOptions): { promise: Promise<SceneCloud>; cancel: () => void } {
  let worker: Worker | null = null;
  let timer = 0;
  const promise = new Promise<SceneCloud>((resolve) => {
    const onMain = () => {
      timer = window.setTimeout(() => resolve(buildScene(opts)), 0);
    };
    try {
      worker = new Worker(new URL("./ural-worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (e: MessageEvent<SceneCloud>) => {
        resolve(e.data);
        worker?.terminate();
        worker = null;
      };
      worker.onerror = (e) => {
        e.preventDefault();
        worker?.terminate();
        worker = null;
        onMain();
      };
      worker.postMessage(opts);
    } catch {
      onMain();
    }
  });
  return {
    promise,
    cancel: () => {
      worker?.terminate();
      clearTimeout(timer);
    },
  };
}

function cssColor(name: string, fallback: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const c = new THREE.Color();
  try {
    c.setStyle(v || fallback);
  } catch {
    c.setStyle(fallback);
  }
  return c;
}

type Controller = { setTheme: (dark: boolean) => void };

/** Full-box particle scene: the man, the towel, the sand, the river and the «УРАЛ» sign. */
export function UralScene({ className }: { className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const ctl = useRef<Controller | null>(null);
  const theme = useTheme();
  const themeRef = useRef(theme);
  themeRef.current = theme;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: "low-power" });
    } catch {
      return; // no WebGL: the stage simply stays empty
    }
    const still = reducedMotion();
    // Phones and small machines get a lighter river.
    const small = Math.min(innerWidth, innerHeight) < 700 || (navigator.hardwareConcurrency ?? 8) <= 4;
    if (getComputedStyle(el).position === "static") el.style.position = "relative";
    renderer.setClearColor(0x000000, 0);
    const canvas = renderer.domElement;
    Object.assign(canvas.style, { position: "absolute", inset: "0", width: "100%", height: "100%", display: "block", opacity: "0", transition: "opacity 900ms ease" });
    el.appendChild(canvas);

    const scene = new THREE.Scene();
    const densityScene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(WIDE.fov, 2, 0.1, 120);
    const densityTarget = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    const uniforms = {
      uTime: { value: 0 },
      uFlow: { value: 0 },
      uYaw: { value: REST_YAW },
      uPitch: { value: 0 },
      uBreath: { value: 0 },
      uSize: { value: 2 },
      uRefDist: { value: 4 },
      uIntro: { value: still ? 1 : 0 },
      uRiverGain: { value: 1 },
      uRiverSize: { value: 1 },
      uDark: { value: 0 },
      uFade: { value: new THREE.Vector2(12, 24) },
      uHaze: { value: new THREE.Vector2(14, 62) },
      uPivot: { value: new THREE.Vector3(...HEAD_PIVOT) },
      uRiverAxis: { value: new THREE.Vector4(0, 0, 0.6, 1.5) },
      uRiver: { value: new THREE.Vector3(RIVER.near, RIVER.far, RIVER.log) },
      uDensity: { value: densityTarget.texture },
      uShadowMap: { value: null as THREE.Texture | null },
      uShadowBox: { value: new THREE.Vector4(...SHADOW_BOX) },
      uShadowTexel: { value: new THREE.Vector2(1 / 256, 1 / 220) },
      uSun: { value: new THREE.Vector3(...SUN) },
      uShadowOn: { value: 0 },
      uInk: { value: new THREE.Color(0x141413) },
      uOpacity: { value: 0.9 },
    };
    const material = new THREE.ShaderMaterial({ vertexShader: vertex(false), fragmentShader: fragment, uniforms, transparent: true, depthWrite: false, depthTest: true });
    const densityMaterial = new THREE.ShaderMaterial({
      vertexShader: vertex(true),
      fragmentShader: densityFragment,
      uniforms,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    let geometry: THREE.BufferGeometry | null = null;
    let solid: ReturnType<typeof occluder> | null = null;

    // Shadows (light theme): the figure's occluder and a proxy of the sign are projected along the
    // sun onto the ground into a small top-down mask; sand reads it back as extra stippled ink.
    const shadowTarget = new THREE.WebGLRenderTarget(256, 220, { depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    const shadowMaterial = new THREE.ShaderMaterial({
      uniforms: { uSun: { value: new THREE.Vector3(...SUN) }, uShadowBox: { value: new THREE.Vector4(...SHADOW_BOX) } },
      vertexShader: /* glsl */ `
        uniform vec3 uSun;
        uniform vec4 uShadowBox;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vec2 g = w.xz + uSun.xz * (w.y / -uSun.y);
          vec2 uv = (g - uShadowBox.xy) / (uShadowBox.zw - uShadowBox.xy);
          gl_Position = vec4(uv * 2.0 - 1.0, 0.0, 1.0);
        }
      `,
      fragmentShader: "void main() { gl_FragColor = vec4(1.0); }",
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
    });
    const signProxy = new THREE.Group();
    {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, SIGN.bottom + SIGN.height, 8), shadowMaterial);
      post.position.set(0, (SIGN.bottom + SIGN.height) / 2, -0.035);
      const board = new THREE.Mesh(new THREE.BoxGeometry(SIGN.width, SIGN.height, 0.02), shadowMaterial);
      board.position.set(0, SIGN.bottom + SIGN.height / 2, 0);
      post.frustumCulled = board.frustumCulled = false;
      signProxy.add(post, board);
      signProxy.position.set(SIGN.x, 0, SIGN.z);
      signProxy.rotation.y = SIGN_FACING;
      signProxy.updateMatrixWorld(true);
    }
    const shadowCam = new THREE.OrthographicCamera(); // unused by the projection shader, required by render()
    let shadowYaw = NaN;
    let caster: ReturnType<typeof occluder> | null = null; // full-size proxy of the figure for the shadow
    uniforms.uShadowMap.value = shadowTarget.texture;
    const renderShadow = () => {
      if (!caster) return;
      caster.head.rotation.set(uniforms.uPitch.value, uniforms.uYaw.value, 0, "YXZ");
      const meshes: THREE.Mesh[] = [];
      caster.body.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
      });
            // The projection happens in the shader, so the shadow camera's frustum must not cull anything.
      meshes.forEach((m) => ((m.material = shadowMaterial), (m.frustumCulled = false)));
      caster.body.updateMatrixWorld(true);
      renderer.setRenderTarget(shadowTarget);
      renderer.clear();
      renderer.autoClear = false; // two renders into one mask
      renderer.render(caster.body, shadowCam);
      renderer.render(signProxy, shadowCam);
      renderer.autoClear = true;
      renderer.setRenderTarget(null);
      shadowYaw = uniforms.uYaw.value;
    };

    const base = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
    const fit = () => {
      const rect = el.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      const dpr = Math.min(devicePixelRatio || 1, 2);
      renderer.setPixelRatio(dpr);
      renderer.setSize(width, height, false);
      densityTarget.setSize(Math.max(1, Math.round(width / 4)), Math.max(1, Math.round(height / 4)));
      const aspect = width / height;
      const k = THREE.MathUtils.clamp((aspect - TALL.aspect) / (WIDE.aspect - TALL.aspect), 0, 1);
      const s = k * k * (3 - 2 * k);
      camera.aspect = aspect;
      // Boxes wider than 2:1 zoom in a little so he does not shrink into the sand.
      camera.fov = THREE.MathUtils.lerp(TALL.fov, WIDE.fov, s) * Math.pow(Math.min(1, WIDE.aspect / aspect), 0.35);
      base.pos.lerpVectors(TALL.pos, WIDE.pos, s);
      base.target.lerpVectors(TALL.target, WIDE.target, s);
      // Below ~900px wide the stage is a 16:9 strip: blend toward the strip framing.
      const narrow = THREE.MathUtils.smoothstep(width, 900, 500) * THREE.MathUtils.smoothstep(aspect, 1.2, 1.6);
      camera.fov = THREE.MathUtils.lerp(camera.fov, STRIP.fov, narrow);
      base.pos.lerp(STRIP.pos, narrow);
      base.target.lerp(STRIP.target, narrow);
      camera.updateProjectionMatrix();
      // The river spreads each depth row across exactly what this framing can see (plus a margin).
      const halfW = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * aspect;
      const slope = (base.target.x - base.pos.x) / (base.target.z - base.pos.z);
      uniforms.uRiverAxis.value.set(base.pos.x, base.pos.z, slope, 2.9 * halfW * Math.sqrt(1 + slope * slope));
      uniforms.uRefDist.value = base.pos.length();
      // Slightly larger points on small screens so the drawing stays legible at ~390px.
      uniforms.uSize.value = (THREE.MathUtils.clamp(0.95 + width / 2600, 1.1, 1.5) + 0.25 * narrow) * dpr;
    };

    const setTheme = (dark: boolean) => {
      const ink = cssColor("--ink", dark ? "#ecebe6" : "#141413");
      const l = ink.getHSL({ h: 0, s: 0, l: 0 }).l;
      if (dark ? l < 0.5 : l > 0.5) ink.setStyle(dark ? "#ecebe6" : "#141413");
      uniforms.uInk.value = ink;
      uniforms.uOpacity.value = dark ? 0.88 : 0.9;
      // Ink on paper needs more coverage than light on dark: the light theme's river is heavier.
      uniforms.uRiverGain.value = dark ? 1.5 : 3.8;
      uniforms.uRiverSize.value = dark ? 1 : 1.25;
      uniforms.uDark.value = dark ? 1 : 0;
      uniforms.uShadowOn.value = dark ? 0 : 1;
      requestFrame();
    };
    ctl.current = { setTheme };

    const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
    const move = (e: PointerEvent) => {
      pointer.x = THREE.MathUtils.clamp((e.clientX / innerWidth) * 2 - 1, -1, 1);
      pointer.y = THREE.MathUtils.clamp((e.clientY / innerHeight) * 2 - 1, -1, 1);
    };
    if (!still) window.addEventListener("pointermove", move, { passive: true });

    const head = headPlanner();
    const offset = new THREE.Vector3();
    let raf = 0;
    let visible = true;
    let last = performance.now();
    let clock = still ? 41 : 0;
    let intro = still ? 1 : 0;
    const draw = (now: number) => {
      raf = 0;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!still) {
        clock += dt;
        intro = Math.min(1, intro + dt / 2.4);
        pointer.sx += (pointer.x - pointer.sx) * Math.min(1, dt * 1.5);
        pointer.sy += (pointer.y - pointer.sy) * Math.min(1, dt * 1.5);
        const yaw = head(dt);
        uniforms.uYaw.value = yaw;
        // Turning toward us, he tips his chin a touch down.
        uniforms.uPitch.value = THREE.MathUtils.clamp((REST_YAW - yaw) * 0.07, 0, 0.1);
        uniforms.uBreath.value = Math.sin(clock * 1.35);
        uniforms.uFlow.value += dt;
      } else {
        uniforms.uFlow.value = 23;
      }
      solid?.head.rotation.set(uniforms.uPitch.value, uniforms.uYaw.value, 0, "YXZ");
      uniforms.uTime.value = clock;
      uniforms.uIntro.value = intro;
      offset.set(Math.sin(clock * 0.061) * 0.1 + pointer.sx * 0.22, Math.sin(clock * 0.047) * 0.04 - pointer.sy * 0.1, Math.sin(clock * 0.039) * 0.06);
      camera.position.copy(base.pos).add(offset);
      camera.lookAt(base.target);
      // The shadow follows the head turn; the mask is only redrawn when the head has moved a little.
      if (uniforms.uShadowOn.value > 0.5 && solid && !(Math.abs(uniforms.uYaw.value - shadowYaw) < 0.02)) renderShadow();
      renderer.setRenderTarget(densityTarget);
      renderer.clear();
      renderer.render(densityScene, camera);
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
      if (!still && visible && !document.hidden) raf = requestAnimationFrame(draw);
    };
    function requestFrame() {
      if (!raf && geometry && visible && !document.hidden) raf = requestAnimationFrame(draw);
    }

    const resize = new ResizeObserver(() => {
      fit();
      requestFrame();
    });
    resize.observe(el);
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) {
        last = performance.now();
        requestFrame();
      }
    });
    io.observe(el);
    const onVisibility = () => {
      last = performance.now();
      requestFrame();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const lost = (e: Event) => {
      e.preventDefault();
      cancelAnimationFrame(raf);
      raf = 0;
    };
    const restored = () => requestFrame();
    canvas.addEventListener("webglcontextlost", lost);
    canvas.addEventListener("webglcontextrestored", restored);

    fit();
    setTheme(themeRef.current === "dark");

    let disposed = false;
    const load = loadCloud({ signFacing: SIGN_FACING, riverDensity: small ? 0.45 : 1 });
    load.promise.then((cloud) => {
      if (disposed) return;
      // One set of buffers (shared on the GPU), drawn three ways: the river's density pass, the river,
      // and everything else.
      const attrs = {
        position: new THREE.BufferAttribute(cloud.position, 3),
        normal: new THREE.BufferAttribute(cloud.normal, 3),
        aData: new THREE.BufferAttribute(cloud.data, 4),
        aSeed: new THREE.BufferAttribute(cloud.seed, 1),
        aLine: new THREE.BufferAttribute(cloud.line, 1),
      };
      const view = (start: number, count: number) => {
        const g = new THREE.BufferGeometry();
        for (const [name, attr] of Object.entries(attrs)) g.setAttribute(name, attr);
        g.setDrawRange(start, count);
        g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 10), 200);
        return g;
      };
      geometry = view(0, cloud.riverCount);
      const restGeo = view(cloud.riverCount, cloud.count - cloud.riverCount);
      densityScene.add(new THREE.Points(geometry, densityMaterial));
      scene.add(new THREE.Points(geometry, material), new THREE.Points(restGeo, material));
      disposeExtra = () => restGeo.dispose();
      solid = occluder(cloud.prims);
      caster = occluder(cloud.prims, 0);
      scene.add(solid.body);
      canvas.style.opacity = "1";
      last = performance.now();
      requestFrame();
    });
    let disposeExtra = () => {};

    return () => {
      disposed = true;
      load.cancel();
      ctl.current = null;
      cancelAnimationFrame(raf);
      resize.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointermove", move);
      canvas.removeEventListener("webglcontextlost", lost);
      canvas.removeEventListener("webglcontextrestored", restored);
      geometry?.dispose();
      disposeExtra();
      solid?.dispose();
      caster?.dispose();
      material.dispose();
      densityMaterial.dispose();
      densityTarget.dispose();
      shadowTarget.dispose();
      shadowMaterial.dispose();
      signProxy.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    };
  }, []);

  useEffect(() => {
    ctl.current?.setTheme(theme === "dark");
  }, [theme]);

  return <div ref={host} className={className} aria-hidden="true" style={{ overflow: "hidden" }} />;
}
