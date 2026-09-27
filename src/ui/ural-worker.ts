// Builds the Ural scene's point cloud off the main thread (a few hundred milliseconds of maths).
import { buildScene } from "./ural-scene.ts";

self.onmessage = (e: MessageEvent<{ signFacing: number; riverDensity?: number }>) => {
  const cloud = buildScene(e.data);
  const transfer = [cloud.position.buffer, cloud.normal.buffer, cloud.data.buffer, cloud.seed.buffer, cloud.line.buffer];
  self.postMessage(cloud, { transfer });
};
