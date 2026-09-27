import { OpenPanel } from "@openpanel/web";

/** Group private local books together and omit search/filter/page parameters. */
export function analyticsPath(hash: string): string {
  const path = hash.replace(/^#/, "").split("?")[0];
  if (/^\/book\/(?:pg-\d+|pv-[a-z0-9-]+)$/.test(path)) return path;
  if (path.startsWith("/book/")) return "/book/local";
  if (path === "/map" || path === "/library") return path;
  return "/";
}

export async function startAnalytics() {
  try {
    const response = await fetch("/api/analytics-config");
    if (!response.ok) return;
    const config = await response.json();
    if (!config.clientId) return;
    const op = new OpenPanel({
      clientId: config.clientId,
      apiUrl: config.apiUrl,
      trackScreenViews: false,
      trackOutgoingLinks: false,
      trackAttributes: false,
    });
    // Keep the referring site, without forwarding its query string or fragment.
    op.setGlobalProperties({
      __referrer: document.referrer ? new URL(document.referrer).origin : "",
    });
    const track = () => op.screenView(`${location.origin}${analyticsPath(location.hash)}`);
    track();
    window.addEventListener("hashchange", track);
  } catch {
    // Analytics must never prevent reading, including when blocked by the browser.
  }
}
