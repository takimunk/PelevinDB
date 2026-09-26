import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { EMOTIONS } from "../../../shared/catalog.ts";
import { argmax } from "../../domain/analysis.ts";
import { fingerprintValues } from "../../domain/fingerprint.ts";
import { cosine, type Embedding } from "../../domain/pca.ts";
import { PixelStrip } from "../../ui/PixelStrip.tsx";
import type { GraphAxis } from "./axes.ts";
import type { Star } from "./corpus.ts";

const SPREAD = 10;
const K = 3;
const AXIS_COLORS = ["#ff4538", "#3ddc84", "#4d7cff"];
const FONT = `11px "JetBrains Mono", ui-monospace, monospace`;
const HOME = { yaw: 0.7, pitch: 0.42, distance: 34 };
const HOME_2D = { yaw: 0, pitch: 0, distance: 30 };

export type GraphMode = "2d" | "3d";
type Props = {
  stars: Star[];
  embedding: Embedding;
  axes: GraphAxis[];
  mode: GraphMode;
  selected: string | null;
  onSelect: (id: string | null) => void;
  labels: boolean;
  threads: boolean;
};
type Screen = { x: number; y: number; depth: number; visible: boolean };

const starColor = (s: Star) => EMOTIONS.find((e) => e.id === argmax(s.fingerprint.emotions))!.color;
const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

/**
 * Books on two or three chosen axes: square nodes, nearest-neighbour edges, named axes.
 * 3D: drag orbits, WASD moves in the ground plane. 2D: a flat chart, drag and WASD pan.
 */
export function BookGraph({ stars, embedding, axes, mode, selected, onSelect, labels, threads }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const view = useRef({
    ...HOME,
    target: new THREE.Vector3(),
    goal: null as THREE.Vector3 | null,
    keys: new Set<string>(),
    drag: null as null | { x: number; y: number; yaw: number; pitch: number; target: THREE.Vector3; moved: boolean },
    pointer: null as null | { x: number; y: number },
    hover: null as string | null,
    dirty: true,
  });
  const live = useRef({ selected, labels, threads, onSelect, mode });
  live.current = { selected, labels, threads, onSelect, mode };

  const byId = useMemo(() => new Map(stars.map((s) => [s.id, s])), [stars]);
  const positions = useMemo(() => {
    const ids = stars.map((s) => s.id);
    const fitters = axes.map((a) => {
      const std = Math.sqrt(ids.reduce((sum, id) => sum + (a.values.get(id) ?? 0) ** 2, 0) / Math.max(1, ids.length)) || 1;
      return (id: string) => Math.tanh((a.values.get(id) ?? 0) / std / 2) * SPREAD;
    });
    return new Map(ids.map((id) => [id, new THREE.Vector3(fitters[0](id), fitters[1](id), mode === "2d" ? 0 : fitters[2](id))]));
  }, [stars, axes, mode]);
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
  }, [labels, threads, edges, axisNames]);
  useEffect(() => {
    Object.assign(view.current, mode === "2d" ? HOME_2D : HOME, { target: new THREE.Vector3(), goal: null, dirty: true });
  }, [mode]);

  // Render loop.
  useEffect(() => {
    const el = canvas.current!;
    const host = wrap.current!;
    const ctx = el.getContext("2d")!;
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
      el.width = w * dpr;
      el.height = h * dpr;
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
      return { x: ((tmp.x + 1) / 2) * w, y: ((1 - tmp.y) / 2) * h, depth: camera.position.distanceTo(p), visible: tmp.z > -1 && tmp.z < 1 };
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

      camera.position.set(
        v.target.x + Math.cos(v.pitch) * Math.sin(v.yaw) * v.distance,
        v.target.y + Math.sin(v.pitch) * v.distance,
        v.target.z + Math.cos(v.pitch) * Math.cos(v.yaw) * v.distance,
      );
      camera.lookAt(v.target);
      camera.updateMatrixWorld();

      const { selected: sel, threads: showEdges, labels: allLabels } = live.current;
      const focus = v.hover ?? sel;
      const near = new Set<string>();
      if (focus) for (const e of edges) if (e.a === focus) near.add(e.b);
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
      const depths = [...screen.values()].map((s) => s.depth);
      const dMin = Math.min(...depths),
        dMax = Math.max(...depths);
      const fade = (d: number) => (flat ? 1 : 1 - 0.55 * ((d - dMin) / Math.max(1e-6, dMax - dMin)));

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
        const dim = focus != null && !isFocus && !near.has(id);
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

      // Labels: place by priority, skip overlaps.
      const placed: [number, number, number, number][] = [...axisBoxes, [0, 0, w, 56], [0, h - 66, w, h]];
      const priority = (id: string) =>
        id === focus || id === sel ? 0 : near.has(id) ? 1 : byId.get(id)!.kind === "library" ? 2 : 3 + screen.get(id)!.depth / 1000;
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
  }, [positions, edges, axisNames, byId]);

  // Mouse and keyboard.
  useEffect(() => {
    const el = canvas.current!;
    const v = view.current;
    const local = (e: PointerEvent | WheelEvent) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const down = (e: PointerEvent) => {
      v.drag = { ...local(e), yaw: v.yaw, pitch: v.pitch, target: v.target.clone(), moved: false };
      el.setPointerCapture(e.pointerId);
      wrap.current?.focus({ preventScroll: true });
    };
    const move = (e: PointerEvent) => {
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
    const up = () => {
      if (v.drag && !v.drag.moved) live.current.onSelect(v.hover);
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
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointerleave", leave);
    el.addEventListener("wheel", wheel, { passive: false });
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", blur);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointerleave", leave);
      el.removeEventListener("wheel", wheel);
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", blur);
    };
  }, []);

  const hovered = hover ? byId.get(hover.id) : undefined;

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
        <div className="node-card" style={{ left: Math.min(hover.x + 18, (wrap.current?.clientWidth ?? 800) - 330), top: Math.max(8, hover.y - 20) }}>
          <div className="node-card-title">
            <b>{hovered.title}</b>
            <span className="dim"> · {hovered.author}</span>
          </div>
          <div className="node-card-meta">
            {hovered.kind === "library" ? "your book" : hovered.canon?.complete ? `canon · jev read all ${hovered.canon.pages} pages` : `atlas · jev read ${hovered.pagesRead ?? "?"} sampled pages`} · coverage {Math.round(hovered.fingerprint.coverage * 100)}%
          </div>
          <PixelStrip values={fingerprintValues(hovered.fingerprint)} size={6} label="fingerprint coordinates" idle="85 coordinates · click to select" />
        </div>
      )}
      <div className="graph-hud">
        <span>
          <kbd>W</kbd>
          <kbd>A</kbd>
          <kbd>S</kbd>
          <kbd>D</kbd> {mode === "2d" ? "pan" : "move"} <kbd>Q</kbd>
          <kbd>E</kbd> {mode === "2d" ? "zoom" : "down/up"} · drag {mode === "2d" ? "pan" : "orbit"} · scroll zoom · <kbd>R</kbd> reset
        </span>
        <span className="graph-legend">
          <i className="own" /> your book <i className="canon" /> canon, read in full <i className="ref" /> atlas · colour = leading emotion · edge label = similarity
        </span>
      </div>
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
