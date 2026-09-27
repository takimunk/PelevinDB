import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { EMOTIONS } from "../../../shared/catalog.ts";
import { argmax } from "../../domain/analysis.ts";
import type { Region } from "../../domain/clusters.ts";
import { fingerprintValues } from "../../domain/fingerprint.ts";
import { cosine, type Embedding } from "../../domain/pca.ts";
import { PixelStrip } from "../../ui/PixelStrip.tsx";
import type { GraphAxis } from "./axes.ts";
import type { Star } from "./corpus.ts";

const SPREAD = 10;
const K = 3;
const AXIS_COLORS = ["#ff4538", "#3ddc84", "#4d7cff"];
const REGION_COLORS = ["#ff6bb5", "#5ad1ff", "#ffd166", "#8cff7a", "#b28dff", "#ff9f43", "#4de8c2"];
const FONT = `11px "JetBrains Mono", ui-monospace, monospace`;
const REGION_FONT = `700 11px "JetBrains Mono", ui-monospace, monospace`;
const HOME = { yaw: 0.7, pitch: 0.42, distance: 34 };
const HOME_2D = { yaw: 0, pitch: 0, distance: 30 };
const TAN_HALF_FOV = Math.tan((45 * Math.PI) / 360);
/** World-space padding around a region. */
const PAD = 0.8;

export const regionColor = (i: number) => REGION_COLORS[i % REGION_COLORS.length];

export type GraphMode = "2d" | "3d";
type Props = {
  stars: Star[];
  embedding: Embedding;
  axes: GraphAxis[];
  /** Per star, its place on the shown axes in −1..1. */
  coords: Map<string, number[]>;
  regions: Region[];
  mode: GraphMode;
  selected: string | null;
  onSelect: (id: string | null) => void;
  labels: boolean;
  threads: boolean;
  showRegions: boolean;
};
type Screen = { x: number; y: number; depth: number; visible: boolean };

const starColor = (s: Star) => EMOTIONS.find((e) => e.id === argmax(s.fingerprint.emotions))!.color;
const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

/** Convex hull (monotone chain) of screen points. */
function hull(points: { x: number; y: number }[]) {
  const p = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const cross = (o: (typeof p)[0], a: (typeof p)[0], b: (typeof p)[0]) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const half = (list: typeof p) => {
    const out: typeof p = [];
    for (const q of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], q) <= 0) out.pop();
      out.push(q);
    }
    return out.slice(0, -1);
  };
  return [...half(p), ...half([...p].reverse())];
}

/** Fills the hull grown by `pad` pixels with rounded corners; one or two points become a dot or a capsule. */
function blob(g: CanvasRenderingContext2D, shape: { x: number; y: number }[], pad: number) {
  g.beginPath();
  if (shape.length === 1) {
    g.arc(shape[0].x, shape[0].y, pad, 0, Math.PI * 2);
    g.fill();
    return;
  }
  shape.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y)));
  if (shape.length > 2) g.closePath();
  g.lineJoin = g.lineCap = "round";
  g.lineWidth = pad * 2;
  g.fill();
  g.stroke();
}

/**
 * Books on two or three chosen axes: square nodes, nearest-neighbour edges, named axes and named translucent regions.
 * 3D: drag orbits, WASD moves in the ground plane. 2D: a flat chart, drag and WASD pan.
 */
export function BookGraph({ stars, embedding, axes, coords, regions, mode, selected, onSelect, labels, threads, showRegions }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const projected = useRef(new Map<string, Screen>());
  const [hover, setHover] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);
  const [spot, setSpot] = useState<number | null>(null);
  const view = useRef({
    ...HOME,
    target: new THREE.Vector3(),
    goal: null as THREE.Vector3 | null,
    keys: new Set<string>(),
    drag: null as null | {
      x: number;
      y: number;
      yaw: number;
      pitch: number;
      target: THREE.Vector3;
      moved: boolean;
    },
    pointer: null as null | { x: number; y: number },
    hover: null as string | null,
    dirty: true,
  });
  const live = useRef({
    selected,
    labels,
    threads,
    onSelect,
    mode,
    showRegions,
    spot,
  });
  live.current = {
    selected,
    labels,
    threads,
    onSelect,
    mode,
    showRegions,
    spot,
  };

  const byId = useMemo(() => new Map(stars.map((s) => [s.id, s])), [stars]);
  const positions = useMemo(
    () => new Map(stars.flatMap((s) => (coords.has(s.id) ? [[s.id, new THREE.Vector3(...[0, 1, 2].map((d) => (coords.get(s.id)![d] ?? 0) * SPREAD))] as const] : []))),
    [stars, coords],
  );
  const regionOf = useMemo(() => new Map(regions.flatMap((r, i) => r.members.map((id) => [id, i] as const))), [regions]);
  const edges = useMemo(() => {
    const ids = [...positions.keys()];
    const seen = new Set<string>();
    const out: { a: string; b: string; sim: number }[] = [];
    for (const a of ids) {
      const ra = embedding.rows.get(a)!;
      ids
        .filter((b) => b !== a)
        .map((b) => ({ b, sim: cosine(ra, embedding.rows.get(b)!) }))
        .sort((x, y) => y.sim - x.sim)
        .slice(0, K)
        .forEach(({ b, sim }) => {
          const key = a < b ? `${a}|${b}` : `${b}|${a}`;
          if (!seen.has(key)) {
            seen.add(key);
            out.push({ a, b, sim });
          }
        });
    }
    return out;
  }, [positions, embedding]);
  const axisNames = useMemo(() => axes.slice(0, mode === "2d" ? 2 : 3), [axes, mode]);

  // Glide to the selected book.
  useEffect(() => {
    const p = selected ? positions.get(selected) : null;
    if (p) view.current.goal = p.clone();
    view.current.dirty = true;
  }, [selected, positions]);
  useEffect(() => {
    view.current.dirty = true;
  }, [labels, threads, edges, axisNames, showRegions, spot]);
  useEffect(() => {
    Object.assign(view.current, mode === "2d" ? HOME_2D : HOME, {
      target: new THREE.Vector3(),
      goal: null,
      dirty: true,
    });
  }, [mode]);

  // Render loop.
  useEffect(() => {
    const el = canvas.current!;
    const host = wrap.current!;
    const ctx = el.getContext("2d")!;
    // 2D regions are drawn opaque off-screen, then composited translucent, so fill and padding never double up.
    const layer = document.createElement("canvas");
    const lctx = layer.getContext("2d")!;
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 400);
    const v = view.current;
    let raf = 0,
      last = performance.now(),
      w = 0,
      h = 0;

    const resize = () => {
      w = host.clientWidth;
      h = host.clientHeight;
      const dpr = Math.min(2, devicePixelRatio);
      el.width = layer.width = w * dpr;
      el.height = layer.height = h * dpr;
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
      v.dirty = true;
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    const tmp = new THREE.Vector3();
    const project = (p: THREE.Vector3): Screen => {
      tmp.copy(p).project(camera);
      return {
        x: ((tmp.x + 1) / 2) * w,
        y: ((1 - tmp.y) / 2) * h,
        depth: camera.position.distanceTo(p),
        visible: tmp.z > -1 && tmp.z < 1,
      };
    };
    const line = (a: THREE.Vector3, b: THREE.Vector3) => {
      const pa = project(a),
        pb = project(b);
      if (!pa.visible || !pb.visible) return;
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      // 3D: WASD moves the orbit centre in the camera's ground plane, Q/E down/up. 2D: WASD pans, Q/E zoom.
      const flat = live.current.mode === "2d";
      if (v.keys.size) {
        const forward = flat ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(-Math.sin(v.yaw), 0, -Math.cos(v.yaw));
        const right = flat ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(Math.cos(v.yaw), 0, -Math.sin(v.yaw));
        const step = dt * v.distance * 0.7;
        const move = new THREE.Vector3();
        if (v.keys.has("w")) move.add(forward);
        if (v.keys.has("s")) move.sub(forward);
        if (v.keys.has("d")) move.add(right);
        if (v.keys.has("a")) move.sub(right);
        if (flat) {
          const zoom = (v.keys.has("q") ? 1 : 0) - (v.keys.has("e") ? 1 : 0);
          if (zoom) {
            v.distance = Math.max(6, Math.min(90, v.distance * Math.exp(zoom * dt * 1.5)));
            v.dirty = true;
          }
        } else {
          if (v.keys.has("e")) move.y += 1;
          if (v.keys.has("q")) move.y -= 1;
        }
        if (move.lengthSq()) {
          v.target.addScaledVector(move.normalize(), step);
          v.goal = null;
          v.dirty = true;
        }
      }
      if (v.goal) {
        v.target.lerp(v.goal, 1 - Math.exp(-dt * 6));
        if (v.target.distanceTo(v.goal) < 0.01) v.goal = null;
        v.dirty = true;
      }
      if (!v.dirty) return;
      v.dirty = false;

      camera.position.set(v.target.x + Math.cos(v.pitch) * Math.sin(v.yaw) * v.distance, v.target.y + Math.sin(v.pitch) * v.distance, v.target.z + Math.cos(v.pitch) * Math.cos(v.yaw) * v.distance);
      camera.lookAt(v.target);
      camera.updateMatrixWorld();

      const { selected: sel, threads: showEdges, labels: allLabels } = live.current;
      const focus = v.hover ?? sel;
      const near = new Set<string>();
      if (focus)
        for (const e of edges)
          if (e.a === focus) near.add(e.b);
          else if (e.b === focus) near.add(e.a);

      ctx.clearRect(0, 0, w, h);
      ctx.font = FONT;
      ctx.lineWidth = 1;

      // Floor grid in 3D, chart grid in 2D.
      const floor = -SPREAD - 1;
      ctx.strokeStyle = flat ? "rgba(255, 255, 255, 0.08)" : "rgba(255, 255, 255, 0.05)";
      for (let i = -SPREAD; i <= SPREAD; i += 2) {
        if (flat) {
          line(new THREE.Vector3(i, -SPREAD, 0), new THREE.Vector3(i, SPREAD, 0));
          line(new THREE.Vector3(-SPREAD, i, 0), new THREE.Vector3(SPREAD, i, 0));
        } else {
          line(new THREE.Vector3(i, floor, -SPREAD), new THREE.Vector3(i, floor, SPREAD));
          line(new THREE.Vector3(-SPREAD, floor, i), new THREE.Vector3(SPREAD, floor, i));
        }
      }

      // Axes with their strongest feature at each end; full names are in the legend.
      const reach = SPREAD + 1.5;
      const axisBoxes: [number, number, number, number][] = [];
      for (let a = 0; a < axisNames.length; a++) {
        const unit = new THREE.Vector3(a === 0 ? 1 : 0, a === 1 ? 1 : 0, a === 2 ? 1 : 0);
        ctx.strokeStyle = AXIS_COLORS[a];
        ctx.globalAlpha = 0.35;
        ctx.setLineDash([3, 4]);
        line(unit.clone().multiplyScalar(-reach), unit.clone().multiplyScalar(reach));
        ctx.setLineDash([]);
        const name = axisNames[a];
        if (!name) continue;
        const letter = "xyz"[a];
        for (const [sign, text] of [
          [1, name.plus],
          [-1, name.minus],
        ] as const) {
          const p = project(unit.clone().multiplyScalar(sign * (reach + 0.4)));
          if (!p.visible) continue;
          ctx.globalAlpha = 0.95;
          ctx.fillStyle = AXIS_COLORS[a];
          const label = `${sign > 0 ? "+" : "−"}${letter} ${text}`;
          const tw = ctx.measureText(label).width;
          const x = Math.max(4, Math.min(w - tw - 4, p.x - tw / 2));
          const y = Math.max(64, Math.min(h - 70, p.y));
          axisBoxes.push([x - 3, y - 11, x + tw + 3, y + 4]);
          ctx.fillStyle = "rgba(8, 8, 8, 0.85)";
          ctx.fillRect(x - 3, y - 11, tw + 6, 15);
          ctx.fillStyle = AXIS_COLORS[a];
          ctx.fillText(label, x, y);
        }
      }
      ctx.globalAlpha = 1;

      // Project nodes once.
      const screen = new Map<string, Screen>();
      for (const [id, p] of positions) screen.set(id, project(p));
      projected.current = screen;
      const depths = [...screen.values()].map((s) => s.depth);
      const dMin = Math.min(...depths),
        dMax = Math.max(...depths);
      const fade = (d: number) => (flat ? 1 : 1 - 0.55 * Math.max(0, Math.min(1, (d - dMin) / Math.max(1e-6, dMax - dMin))));
      const pxPerUnit = (depth: number) => h / (2 * depth * TAN_HALF_FOV);

      // Regions: padded translucent hulls of the members on screen. In 3D the hull of the projected points is
      // the silhouette of the region's convex hull, so it reshapes as the camera orbits; far regions go first.
      const { showRegions: drawRegions, spot: lit } = live.current;
      const spotted = drawRegions && lit != null ? new Set(regions[lit]?.members) : null;
      if (drawRegions) {
        const centres = regions.map((r) => project(new THREE.Vector3(...[0, 1, 2].map((d) => (r.centre[d] ?? 0) * SPREAD))));
        const order = regions.map((_, i) => i).sort((a, b) => centres[b].depth - centres[a].depth);
        for (const i of order) {
          const shape = hull(regions[i].members.flatMap((id) => (screen.get(id)?.visible ? [screen.get(id)!] : [])));
          if (!shape.length) continue;
          const strength = (lit == null ? 1 : lit === i ? 1.8 : 0.35) * fade(centres[i].depth);
          const pad = PAD * pxPerUnit(flat ? v.distance : centres[i].depth);
          lctx.clearRect(0, 0, w, h);
          lctx.fillStyle = lctx.strokeStyle = regionColor(i);
          blob(lctx, shape, pad);
          ctx.globalAlpha = Math.min(1, 0.12 * strength);
          ctx.drawImage(layer, 0, 0, w, h);
          lctx.globalCompositeOperation = "destination-out";
          blob(lctx, shape, pad - 1);
          lctx.globalCompositeOperation = "source-over";
          ctx.globalAlpha = Math.min(1, 0.45 * strength);
          ctx.drawImage(layer, 0, 0, w, h);
        }
        ctx.globalAlpha = 1;
      }

      // Edges.
      for (const e of edges) {
        const on = focus != null && (e.a === focus || e.b === focus);
        if (!showEdges && !on) continue;
        const pa = screen.get(e.a)!,
          pb = screen.get(e.b)!;
        if (!pa.visible || !pb.visible) continue;
        ctx.strokeStyle = on ? "#ededed" : "#6e6e6e";
        ctx.globalAlpha = on ? 0.9 : focus ? 0.08 : 0.12 + Math.max(0, e.sim) * 0.25;
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
        if (on) {
          const label = `${Math.round(Math.max(0, e.sim) * 100)}`;
          const mx = (pa.x + pb.x) / 2,
            my = (pa.y + pb.y) / 2;
          const tw = ctx.measureText(label).width;
          ctx.globalAlpha = 1;
          ctx.fillStyle = "#080808";
          ctx.fillRect(mx - tw / 2 - 3, my - 8, tw + 6, 14);
          ctx.fillStyle = "#ededed";
          ctx.fillText(label, mx - tw / 2, my + 3);
        }
      }

      // Nodes, far to near. Stems to the floor give depth.
      const order = [...screen.entries()].sort((a, b) => b[1].depth - a[1].depth);
      for (const [id, s] of order) {
        if (!s.visible) continue;
        const star = byId.get(id)!;
        const p = positions.get(id)!;
        const isFocus = id === focus || id === sel;
        const dim = (focus != null && !isFocus && !near.has(id)) || (spotted != null && !spotted.has(id));
        const alpha = dim ? 0.25 : fade(s.depth);
        if (!flat) {
          const base = project(new THREE.Vector3(p.x, floor, p.z));
          ctx.globalAlpha = alpha * 0.25;
          ctx.strokeStyle = starColor(star);
          ctx.setLineDash([1, 3]);
          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(base.x, base.y);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.globalAlpha = alpha;
        const size = Math.round((star.kind === "library" ? 9 : 7) * (isFocus ? 1.4 : 1) * (0.75 + 0.25 * fade(s.depth)));
        const x = Math.round(s.x - size / 2) + 0.5,
          y = Math.round(s.y - size / 2) + 0.5;
        ctx.fillStyle = "#080808";
        ctx.fillRect(x, y, size, size);
        ctx.strokeStyle = starColor(star);
        ctx.lineWidth = star.kind === "library" ? 2 : 1;
        if (star.kind === "library") {
          ctx.fillStyle = starColor(star);
          ctx.fillRect(x, y, size, size);
        } else ctx.strokeRect(x, y, size, size);
        if (star.canon?.complete) {
          ctx.fillStyle = starColor(star);
          ctx.fillRect(x + 2, y + 2, size - 4, size - 4);
        }
        ctx.lineWidth = 1;
        if (isFocus) {
          ctx.globalAlpha = 1;
          ctx.strokeStyle = "#ffffff";
          ctx.strokeRect(x - 4, y - 4, size + 8, size + 8);
        }
      }
      ctx.globalAlpha = 1;

      // Region names at their centres; book labels keep clear of them.
      const regionBoxes: [number, number, number, number][] = [];
      if (drawRegions) {
        ctx.font = REGION_FONT;
        regions.forEach((r, i) => {
          const s = project(new THREE.Vector3(...[0, 1, 2].map((d) => (r.centre[d] ?? 0) * SPREAD)));
          if (!s.visible) return;
          const tw = ctx.measureText(r.name).width;
          const x = Math.max(4, Math.min(w - tw - 4, s.x - tw / 2));
          let y = Math.max(70, Math.min(h - 74, s.y));
          const box = (): [number, number, number, number] => [x - 4, y - 12, x + tw + 4, y + 5];
          for (let tries = 0; tries < 4 && regionBoxes.some((b) => box()[0] < b[2] && box()[2] > b[0] && box()[1] < b[3] && box()[3] > b[1]); tries++) y += 17;
          regionBoxes.push(box());
          ctx.globalAlpha = lit == null || lit === i ? 1 : 0.4;
          ctx.fillStyle = "rgba(8, 8, 8, 0.8)";
          ctx.fillRect(x - 4, y - 12, tw + 8, 17);
          ctx.fillStyle = regionColor(i);
          ctx.fillText(r.name, x, y);
        });
        ctx.globalAlpha = 1;
        ctx.font = FONT;
      }

      // Labels: place by priority, skip overlaps.
      const placed: [number, number, number, number][] = [...axisBoxes, ...regionBoxes, [0, 0, w, 56], [0, h - 66, w, h]];
      const priority = (id: string) => (id === focus || id === sel ? 0 : near.has(id) ? 1 : byId.get(id)!.kind === "library" ? 2 : 3 + screen.get(id)!.depth / 1000);
      const ids = [...screen.keys()].sort((a, b) => priority(a) - priority(b));
      const els = new Map<string, HTMLElement>();
      overlay.current?.querySelectorAll<HTMLElement>("[data-node]").forEach((n) => els.set(n.dataset.node!, n));
      for (const id of ids) {
        const node = els.get(id);
        const s = screen.get(id)!;
        if (!node) continue;
        node.style.transform = `translate(${Math.round(s.x)}px, ${Math.round(s.y)}px)`;
        node.style.visibility = s.visible ? "visible" : "hidden";
        const title = byId.get(id)!.title;
        const bw = Math.min(28, title.length) * 6.6 + 10,
          bx = s.x + 9,
          by = s.y - 8;
        const box: [number, number, number, number] = [bx, by, bx + bw, by + 16];
        const important = priority(id) < 2;
        const free = !placed.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1]);
        const show = s.visible && (important || allLabels || free);
        node.classList.toggle("shown", show);
        node.classList.toggle("focus", id === focus || id === sel);
        node.classList.toggle("near", near.has(id));
        node.classList.toggle("dim", !!focus && !important);
        if (show) placed.push(box);
      }

      // Picking.
      let best: { id: string; d: number; x: number; y: number } | null = null;
      if (v.pointer && !v.drag)
        for (const [id, s] of screen) {
          if (!s.visible) continue;
          const d = Math.hypot(s.x - v.pointer.x, s.y - v.pointer.y);
          if (d < 14 && (!best || d < best.d)) best = { id, d, x: s.x, y: s.y };
        }
      const next = best?.id ?? null;
      if (next !== v.hover) {
        v.hover = next;
        v.dirty = true;
        setHover(best ? { id: best.id, x: best.x, y: best.y } : null);
        el.style.cursor = next ? "pointer" : "grab";
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [positions, edges, axisNames, byId, regions]);

  // Mouse and keyboard.
  useEffect(() => {
    const el = canvas.current!;
    const v = view.current;
    const pointers = new Map<number, { x: number; y: number }>();
    let pinch: { span: number; distance: number } | null = null;
    const span = () => {
      const [a, b] = [...pointers.values()];
      return Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
    };
    const local = (e: PointerEvent | WheelEvent) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const down = (e: PointerEvent) => {
      pointers.set(e.pointerId, local(e));
      if (pointers.size === 2) {
        pinch = { span: span(), distance: v.distance };
        v.drag = null;
      } else if (!pinch) {
        v.drag = {
          ...local(e),
          yaw: v.yaw,
          pitch: v.pitch,
          target: v.target.clone(),
          moved: false,
        };
      }
      el.setPointerCapture(e.pointerId);
      wrap.current?.focus({ preventScroll: true });
    };
    const move = (e: PointerEvent) => {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, local(e));
      if (pinch && pointers.size >= 2) {
        v.distance = Math.max(6, Math.min(90, (pinch.distance * pinch.span) / span()));
        v.dirty = true;
        return;
      }
      v.pointer = local(e);
      v.dirty = true;
      if (!v.drag) return;
      const dx = v.pointer.x - v.drag.x,
        dy = v.pointer.y - v.drag.y;
      if (Math.hypot(dx, dy) > 4) v.drag.moved = true;
      if (live.current.mode === "2d") {
        const unit = (2 * v.distance * Math.tan((45 * Math.PI) / 360)) / Math.max(1, el.clientHeight);
        v.target.set(v.drag.target.x - dx * unit, v.drag.target.y + dy * unit, 0);
        v.goal = null;
        return;
      }
      v.yaw = v.drag.yaw - dx * 0.006;
      v.pitch = Math.max(-1.2, Math.min(1.35, v.drag.pitch + dy * 0.006));
    };
    const up = (e: PointerEvent) => {
      if (v.drag && !v.drag.moved && !pinch) {
        const point = local(e);
        let best: { id: string; distance: number } | null = null;
        for (const [id, s] of projected.current) {
          const distance = Math.hypot(s.x - point.x, s.y - point.y);
          if (s.visible && distance < (e.pointerType === "touch" ? 24 : 14) && (!best || distance < best.distance)) best = { id, distance };
        }
        live.current.onSelect(best?.id ?? null);
      }
      pointers.delete(e.pointerId);
      if (!pointers.size) pinch = null;
      v.drag = null;
      v.dirty = true;
    };
    const leave = () => {
      v.pointer = null;
      v.dirty = true;
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      v.distance = Math.max(6, Math.min(90, v.distance * Math.exp(e.deltaY * 0.0012)));
      v.dirty = true;
    };
    const keyDown = (e: KeyboardEvent) => {
      if (typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if ("wasdqe".includes(k) && k.length === 1) {
        v.keys.add(k);
        e.preventDefault();
      } else if (k === "r") {
        Object.assign(v, live.current.mode === "2d" ? HOME_2D : HOME);
        v.goal = new THREE.Vector3();
        v.dirty = true;
      }
    };
    const keyUp = (e: KeyboardEvent) => v.keys.delete(e.key.toLowerCase());
    const blur = () => v.keys.clear();
    const cancel = () => {
      pointers.clear();
      pinch = null;
      v.drag = null;
      v.pointer = null;
      v.dirty = true;
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", cancel);
    el.addEventListener("pointerleave", leave);
    el.addEventListener("wheel", wheel, { passive: false });
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", blur);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", cancel);
      el.removeEventListener("pointerleave", leave);
      el.removeEventListener("wheel", wheel);
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", blur);
    };
  }, []);

  useEffect(() => setSpot(null), [regions]);
  const glide = (i: number) => {
    view.current.goal = new THREE.Vector3(...[0, 1, 2].map((d) => (regions[i].centre[d] ?? 0) * SPREAD));
    view.current.dirty = true;
  };

  const hovered = hover ? byId.get(hover.id) : undefined;
  const hoveredRegion = hovered && showRegions ? regionOf.get(hovered.id) : undefined;

  return (
    <div className="graph" ref={wrap} tabIndex={-1}>
      <canvas ref={canvas} role="img" aria-label={`${mode === "2d" ? "2D" : "3D"} map of books`} />
      <div className="graph-overlay" ref={overlay}>
        {stars.map((s) => (
          <span key={s.id} data-node={s.id} className={`node-label ${s.kind}`} aria-hidden="true">
            <span>{s.title}</span>
          </span>
        ))}
      </div>
      {hovered && hover && (
        <div
          className="node-card"
          style={{
            left: Math.min(hover.x + 18, (wrap.current?.clientWidth ?? 800) - 330),
            top: Math.max(8, hover.y - 20),
          }}
        >
          <div className="node-card-title">
            <b>{hovered.title}</b>
            <span className="dim"> · {hovered.author}</span>
          </div>
          <div className="node-card-meta">
            {hovered.kind === "library" ? "your book" : hovered.canon?.complete ? `canon · jev read all ${hovered.canon.pages} pages` : `atlas · jev read ${hovered.pagesRead ?? "?"} sampled pages`} ·
            coverage {Math.round(hovered.fingerprint.coverage * 100)}%
            {hoveredRegion != null && <span style={{ color: regionColor(hoveredRegion) }}> · {regions[hoveredRegion].name.toLowerCase()}</span>}
          </div>
          <PixelStrip values={fingerprintValues(hovered.fingerprint)} size={6} label="fingerprint coordinates" idle="85 coordinates · click to select" />
        </div>
      )}
      <div className="graph-hud">
        <span className="graph-desktop-help">
          <kbd>W</kbd>
          <kbd>A</kbd>
          <kbd>S</kbd>
          <kbd>D</kbd> {mode === "2d" ? "pan" : "move"} <kbd>Q</kbd>
          <kbd>E</kbd> {mode === "2d" ? "zoom" : "down/up"} · drag {mode === "2d" ? "pan" : "orbit"} · scroll zoom · <kbd>R</kbd> reset
        </span>
        <span className="graph-touch-help">Drag to {mode === "2d" ? "pan" : "rotate"} · pinch to zoom · tap a book</span>
        <span className="graph-legend">
          <i className="own" /> your book <i className="canon" /> canon, read in full <i className="ref" /> atlas · colour = leading emotion · edge label = similarity
        </span>
      </div>
      <div className="graph-controls" role="group" aria-label="Map camera">
        <button
          aria-label="Zoom in"
          onClick={() => {
            view.current.distance = Math.max(6, view.current.distance / 1.25);
            view.current.dirty = true;
          }}
        >
          +
        </button>
        <button
          aria-label="Zoom out"
          onClick={() => {
            view.current.distance = Math.min(90, view.current.distance * 1.25);
            view.current.dirty = true;
          }}
        >
          −
        </button>
        <button
          aria-label="Reset map view"
          onClick={() => {
            Object.assign(view.current, mode === "2d" ? HOME_2D : HOME, {
              goal: new THREE.Vector3(),
              dirty: true,
            });
          }}
        >
          Reset
        </button>
      </div>
      {showRegions && regions.length > 0 && (
        <div className="graph-regions" role="group" aria-label="Regions">
          <span className="eyebrow">regions · books close on this view</span>
          {regions.map((r, i) => (
            <button
              key={r.name}
              className={spot === i ? "on" : ""}
              title={`${r.traits.join(" · ")} · click to fly there`}
              onMouseEnter={() => setSpot(i)}
              onMouseLeave={() => setSpot(null)}
              onFocus={() => setSpot(i)}
              onBlur={() => setSpot(null)}
              onClick={() => glide(i)}
            >
              <i style={{ background: regionColor(i) }} />
              <span>{r.name}</span>
              <em>{r.members.length}</em>
            </button>
          ))}
        </div>
      )}
      <div className="graph-axes">
        {axisNames.map((a, i) => (
          <span key={i}>
            <b style={{ color: AXIS_COLORS[i] }}>{"xyz"[i]}</b> {a.legend}
          </span>
        ))}
      </div>
    </div>
  );
}
