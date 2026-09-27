import { useEffect, useState } from "react";
import { serverStatus } from "./api.ts";

/**
 * Local mode (the server decides: LOCAL_MODE, or any non-production run) offers uploading and analysing your own
 * books. The public site shows only the Pelevin corpus. False until /api/status answers, so upload UI never flashes.
 */
let known: boolean | null = null;
export const localModeReady = () => serverStatus().then((s) => (known = !!s.localMode));
export const isLocalMode = () => known === true;

export function useLocalMode() {
  const [value, setValue] = useState(known === true);
  useEffect(() => {
    let alive = true;
    void localModeReady().then((v) => alive && setValue(v));
    return () => {
      alive = false;
    };
  }, []);
  return value;
}
