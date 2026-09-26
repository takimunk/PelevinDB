import { useLayoutEffect, useRef, useState } from "react";

export function useSize<T extends HTMLElement>(fallback = { width: 800, height: 300 }) {
  const ref = useRef<T>(null);
  const [size, setSize] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0) setSize({ width: rect.width, height: rect.height || fallback.height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, size] as const;
}
