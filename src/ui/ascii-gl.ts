import * as THREE from "three";

THREE.ColorManagement.enabled = false;

export const GLYPHS = " .·:-=+*%#@";

const vertex = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const fragment = /* glsl */ `
  uniform sampler2D tScene;
  uniform sampler2D tGlyphs;
  uniform vec2 uCells;
  uniform vec2 uCell;
  uniform float uCount;
  uniform float uGain;
  void main() {
    vec2 frag = gl_FragCoord.xy;
    vec2 cell = floor(frag / uCell);
    vec3 c = texture2D(tScene, (cell + 0.5) / uCells).rgb;
    float peak = max(c.r, max(c.g, c.b));
    float l = clamp(1.0 - exp(-peak * uGain), 0.0, 1.0);
    float gi = floor(l * (uCount - 1.0) + 0.5);
    vec2 inCell = fract(frag / uCell);
    float mask = texture2D(tGlyphs, vec2((gi + inCell.x) / uCount, inCell.y)).r;
    vec3 hue = peak > 1e-4 ? c / peak : vec3(0.0);
    // Page background is #080808.
    gl_FragColor = vec4(vec3(0.031) + hue * mask * (0.45 + 0.75 * l), 1.0);
  }
`;

async function glyphAtlas(cellW: number, cellH: number) {
  await document.fonts?.load(`${Math.round(cellH * 0.82)}px "JetBrains Mono"`).catch(() => undefined);
  const canvas = document.createElement("canvas");
  canvas.width = cellW * GLYPHS.length;
  canvas.height = cellH;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fff";
  ctx.font = `${Math.round(cellH * 0.82)}px "JetBrains Mono", ui-monospace, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  [...GLYPHS].forEach((g, i) => ctx.fillText(g, i * cellW + cellW / 2, cellH / 2 + 1));
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}

export type Frame = { time: number; dt: number };

/**
 * Renders a three.js scene as coloured ASCII: the scene goes into a render target with one texel per
 * character cell (additive light accumulates), then a full-screen pass picks a glyph by brightness.
 */
export class AsciiView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  camera: THREE.Camera;
  cols = 1;
  rows = 1;
  private target = new THREE.WebGLRenderTarget(1, 1, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, type: THREE.HalfFloatType });
  private post: THREE.Scene;
  private postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private material: THREE.ShaderMaterial;
  private observer: ResizeObserver;
  private raf = 0;
  private start = performance.now();
  private last = performance.now();
  private visible = true;
  private io: IntersectionObserver;
  onFrame?: (frame: Frame) => void;
  onResize?: (width: number, height: number) => void;

  readonly host: HTMLElement;
  readonly cell: { w: number; h: number };

  constructor(host: HTMLElement, camera: THREE.Camera, cell = { w: 7, h: 12 }, gain = 1.6) {
    this.host = host;
    this.cell = cell;
    this.camera = camera;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: "low-power" });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.setClearColor(0x080808, 1);
    this.renderer.domElement.className = "ascii-gl";
    host.appendChild(this.renderer.domElement);
    this.material = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      uniforms: {
        tScene: { value: this.target.texture },
        tGlyphs: { value: null },
        uCells: { value: new THREE.Vector2(1, 1) },
        uCell: { value: new THREE.Vector2(cell.w, cell.h) },
        uCount: { value: GLYPHS.length },
        uGain: { value: gain },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.post = new THREE.Scene();
    this.post.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material));
    const dpr = this.renderer.getPixelRatio();
    void glyphAtlas(Math.round(cell.w * dpr), Math.round(cell.h * dpr)).then((t) => (this.material.uniforms.tGlyphs.value = t));
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.io = new IntersectionObserver(([e]) => (this.visible = e.isIntersecting));
    this.io.observe(host);
    this.resize();
    this.renderer.clear();
    this.loop();
  }

  private resize() {
    const { clientWidth: w, clientHeight: h } = this.host;
    if (!w || !h) return;
    const dpr = this.renderer.getPixelRatio();
    this.renderer.setSize(w, h, false);
    this.cols = Math.max(1, Math.floor(w / this.cell.w));
    this.rows = Math.max(1, Math.floor(h / this.cell.h));
    this.target.setSize(this.cols, this.rows);
    this.material.uniforms.uCells.value.set(this.cols, this.rows);
    this.material.uniforms.uCell.value.set(this.cell.w * dpr, this.cell.h * dpr);
    if (this.camera instanceof THREE.PerspectiveCamera) {
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    this.onResize?.(w, h);
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    if (!this.visible || document.hidden || !this.material.uniforms.tGlyphs.value) return;
    const now = performance.now();
    const frame = { time: (now - this.start) / 1000, dt: Math.min(0.1, (now - this.last) / 1000) };
    this.last = now;
    this.onFrame?.(frame);
    this.renderer.setRenderTarget(this.target);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.post, this.postCamera);
  };

  /** Screen position of a world point, in CSS pixels relative to the host. */
  project(v: THREE.Vector3) {
    const p = v.clone().project(this.camera);
    return { x: ((p.x + 1) / 2) * this.host.clientWidth, y: ((1 - p.y) / 2) * this.host.clientHeight, visible: p.z < 1 && p.z > -1 };
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    this.io.disconnect();
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose();
      (mesh.material as THREE.Material | undefined)?.dispose?.();
    });
    this.target.dispose();
    this.material.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

/**
 * Point cloud with per-vertex colour, drawn additively so density becomes brightness.
 * `size` is in character cells: three.js scales point size by the renderer pixel ratio, which must not apply to the cell target.
 */
export function pointCloud(positions: Float32Array, colors: Float32Array, cells = 1) {
  const size = cells / Math.min(2, window.devicePixelRatio);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({ size, sizeAttenuation: false, vertexColors: true, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }),
  );
}
