import { useEffect, useState } from "react";
import { loadAtlas, type AtlasBook } from "../domain/atlas.ts";

let atlasPromise: Promise<AtlasBook[]> | null = null;

export function useAtlas() {
  const [atlas, setAtlas] = useState<AtlasBook[]>([]);
  useEffect(() => {
    let alive = true;
    atlasPromise ??= loadAtlas();
    void atlasPromise.then((a) => alive && setAtlas(a));
    return () => {
      alive = false;
    };
  }, []);
  return atlas;
}
