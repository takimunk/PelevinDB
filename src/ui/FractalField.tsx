import { useEffect, useRef } from "react";
import * as THREE from "three";
import { AsciiView, pointCloud } from "./ascii-gl.ts";

const LEDS: [number, number, number, number][] = [
  // r, g, b, weight: neutral white with red, green and blue subpixels
  [0.85, 0.85, 0.85, 0.52],
  [1.0, 0.27, 0.22, 0.16],
  [0.24, 0.86, 0.52, 0.16],
  [0.3, 0.49, 1.0, 0.16],
];

function led(r: number) {
  let acc = 0;
  for (const [cr, cg, cb, w] of LEDS) if (r < (acc += w)) return [cr, cg, cb];
  return LEDS[0].slice(0, 3);
}

/** Sierpinski tetrahedron by the chaos game. */
function tetrahedron(count: number, seed = 7) {
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  const v = [
    [0, 1, 0],
    [-0.943, -0.333, 0],
    [0.471, -0.333, 0.816],
    [0.471, -0.333, -0.816],
  ];
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  let p = [0, 0, 0];
  for (let i = 0; i < count; i++) {
    const t = v[Math.floor(rand() * 4)];
    p = [(p[0] + t[0]) / 2, (p[1] + t[1]) / 2, (p[2] + t[2]) / 2];
    pos.set(p, i * 3);
    const c = led(rand());
    const k = 0.05 + rand() * 0.05;
    col.set([c[0] * k, c[1] * k, c[2] * k], i * 3);
  }
  return pointCloud(pos, col, 1);
}

/** Full-bleed, slowly turning ASCII fractal. Decorative. */
export function FractalField({ className = "" }: { className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!host.current) return;
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
    camera.position.set(0, 0.1, 3.4);
    const view = new AsciiView(host.current, camera, { w: 7, h: 12 }, 1.4);
    const fractal = tetrahedron(90_000);
    const group = new THREE.Group();
    group.add(fractal);
    view.scene.add(group);
    const pointer = { x: 0, y: 0 };
    const move = (e: PointerEvent) => {
      pointer.x = e.clientX / innerWidth - 0.5;
      pointer.y = e.clientY / innerHeight - 0.5;
    };
    window.addEventListener("pointermove", move);
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    view.onFrame = ({ time }) => {
      const t = still ? 0 : time;
      group.rotation.y = t * 0.12 + pointer.x * 0.6;
      group.rotation.x = 0.35 + Math.sin(t * 0.07) * 0.15 + pointer.y * 0.3;
    };
    group.scale.setScalar(1.25);
    return () => {
      window.removeEventListener("pointermove", move);
      view.dispose();
    };
  }, []);
  return <div ref={host} className={`fractal-field ${className}`} aria-hidden="true" />;
}
