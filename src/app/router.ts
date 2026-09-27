import { useSyncExternalStore } from "react";

export type LibraryTab = "canon" | "pages" | "lines" | "mine";

export type Route =
  | { name: "home" }
  | { name: "library"; tab: LibraryTab; params: Record<string, string> }
  | { name: "map"; focus?: string }
  | { name: "book"; id: string; page?: number }
  | { name: "blog"; slug?: string }
  | { name: "about" };

export function parseRoute(hash: string): Route {
  const [path, query = ""] = hash.replace(/^#/, "").split("?");
  const params = new URLSearchParams(query);
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "library") {
    const tab = params.get("tab");
    return { name: "library", tab: tab === "mine" || tab === "pages" || tab === "lines" ? tab : "canon", params: Object.fromEntries(params) };
  }
  if (parts[0] === "blog") return { name: "blog", slug: parts[1] ? decodeURIComponent(parts[1]) : undefined };
  if (parts[0] === "about") return { name: "about" };
  if (parts[0] === "map") return { name: "map", focus: params.get("focus") ?? undefined };
  if (parts[0] === "book" && parts[1]) {
    const page = Number(params.get("page"));
    return { name: "book", id: decodeURIComponent(parts[1]), page: Number.isInteger(page) && page > 0 ? page : undefined };
  }
  return { name: "home" };
}

const subscribe = (listener: () => void) => {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
};

export function useRoute() {
  const hash = useSyncExternalStore(subscribe, () => location.hash);
  return parseRoute(hash);
}

export function navigate(path: string, { replace = false } = {}) {
  const next = `#${path}`;
  if (replace) history.replaceState(null, "", next);
  else if (location.hash !== next) location.hash = next;
  if (replace) window.dispatchEvent(new HashChangeEvent("hashchange"));
}

export const href = (path: string) => `#${path}`;
