import { useSyncExternalStore } from "react";
import { isParatext } from "../domain/analysis.ts";
import { buildDossier } from "../domain/dossier.ts";
import { DEFAULT_WEIGHTS } from "../domain/fingerprint.ts";
import { embed, neighbours } from "../domain/pca.ts";
import { flush, getBooks, loadContent, segmentsOf, setAnalysis, setBrief, setProfile } from "../storage/library.ts";
import { api, ApiError, serverStatus } from "./api.ts";

const WORKERS = 4;
const PROFILE_EXCERPTS = 6;

export type Job = { status: "running" | "error" | "done" | "stopped"; done: number; total: number; error?: string };

const jobs = new Map<string, Job>();
const controllers = new Map<string, AbortController>();
const listeners = new Set<() => void>();
let version = 0;

function update(id: string, job: Job) {
  jobs.set(id, job);
  version++;
  listeners.forEach((l) => l());
}

export function useJob(id: string) {
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
  );
  return jobs.get(id);
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Analyzes every missing page with bounded concurrency; completed pages are never recomputed. */
export async function startAnalysis(id: string) {
  if (jobs.get(id)?.status === "running") return;
  const content = await loadContent(id);
  if (!content) return;
  const segments = segmentsOf(id, content.text);
  const queue = content.analyses.flatMap((a, i) => (a ? [] : [i]));
  const controller = new AbortController();
  controllers.set(id, controller);
  let done = segments.length - queue.length;
  update(id, { status: "running", done, total: segments.length });
  let next = 0;
  try {
    await Promise.all(
      Array.from({ length: Math.min(WORKERS, queue.length) }, async () => {
        while (next < queue.length && !controller.signal.aborted) {
          const index = queue[next++];
          for (let attempt = 0; ; attempt++) {
            try {
              const analysis = await api.analyze(segments[index].text, controller.signal);
              setAnalysis(id, index, analysis);
              break;
            } catch (error) {
              // The server reports 429 when its own concurrency slots are busy.
              if (error instanceof ApiError && error.status === 429 && attempt < 5) {
                await pause(800 * (attempt + 1));
                continue;
              }
              throw error;
            }
          }
          update(id, { status: "running", done: ++done, total: segments.length });
        }
      }),
    );
    controller.signal.throwIfAborted();
    await ensureProfile(id, controller.signal);
    await flush();
    update(id, { status: "done", done, total: segments.length });
    if (!content.brief && (await serverStatus()).brief) void requestBrief(id);
  } catch (error) {
    controller.abort();
    await flush();
    const stopped = error instanceof DOMException && error.name === "AbortError";
    update(id, {
      status: stopped ? "stopped" : "error",
      done,
      total: segments.length,
      error: stopped ? undefined : error instanceof Error ? error.message : "Analysis failed",
    });
  } finally {
    if (controllers.get(id) === controller) controllers.delete(id);
  }
}

export function stopAnalysis(id: string) {
  controllers.get(id)?.abort();
}

/** Asks the whole-book questions once, over evenly spaced narrative pages. */
async function ensureProfile(id: string, signal: AbortSignal) {
  const content = await loadContent(id);
  if (!content || content.profile) return;
  const segments = segmentsOf(id, content.text);
  const narrative = segments.filter((_, i) => content.analyses[i] && !isParatext(content.analyses[i]));
  if (!narrative.length) return;
  const count = Math.min(PROFILE_EXCERPTS, narrative.length);
  const excerpts = Array.from(
    { length: count },
    (_, k) => narrative[Math.round((k * (narrative.length - 1)) / Math.max(1, count - 1))].text,
  );
  setProfile(id, await api.profile(excerpts, signal));
}

export type BriefJob = { status: "running" | "error"; error?: string };
const briefJobs = new Map<string, BriefJob>();

export function useBriefJob(id: string) {
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
  );
  return briefJobs.get(id);
}

function setBriefJob(id: string, job: BriefJob | null) {
  if (job) briefJobs.set(id, job);
  else briefJobs.delete(id);
  version++;
  listeners.forEach((l) => l());
}

/** Asks the LLM for a reader's brief built only from measured data and a few short quotes. */
export async function requestBrief(id: string) {
  if (briefJobs.get(id)?.status === "running") return;
  const content = await loadContent(id);
  const meta = getBooks().find((b) => b.id === id);
  if (!content || !meta) return;
  setBriefJob(id, { status: "running" });
  try {
    const known = getBooks().filter((b) => b.fingerprint);
    const byId = new Map(known.map((b) => [b.id, b]));
    const near = neighbours(embed(known.map((b) => ({ id: b.id, fingerprint: b.fingerprint! })), DEFAULT_WEIGHTS).rows, id, 5).map((n) => ({
      title: byId.get(n.id)!.title,
      author: byId.get(n.id)!.author,
      similarity: n.similarity,
    }));
    const dossier = buildDossier(meta, segmentsOf(id, content.text), content.analyses, content.profile, near);
    setBrief(id, await api.brief(dossier));
    setBriefJob(id, null);
  } catch (error) {
    setBriefJob(id, { status: "error", error: error instanceof Error ? error.message : "The brief could not be written." });
  }
}
