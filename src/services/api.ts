import { useEffect, useState } from "react";
import type { BookBrief, BookProfile, BriefDossier, CatalogHit, CorpusBook, CorpusEntry, CorpusStats, SegmentAnalysis } from "../../shared/types.ts";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(body.error || `HTTP ${response.status}`, response.status);
  return body as T;
}

const post = (body: unknown, signal?: AbortSignal): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
  signal,
});

export const api = {
  status: () => request<ServerStatus>("/api/status"),
  analyze: (text: string, signal?: AbortSignal) => request<SegmentAnalysis>("/api/analyze", post({ text }, signal)),
  profile: (excerpts: string[], signal?: AbortSignal) => request<BookProfile>("/api/profile", post({ excerpts }, signal)),
  brief: (dossier: BriefDossier, signal?: AbortSignal) => request<BookBrief>("/api/brief", post({ dossier }, signal)),
  search: (q: string, signal?: AbortSignal) =>
    request<{ hits: CatalogHit[] }>(`/api/catalog/search?q=${encodeURIComponent(q)}`, { signal }),
  catalogText: (id: string) => request<{ title: string; author: string; text: string }>(`/api/catalog/${id}`),
  corpus: () => request<{ available: boolean; books: CorpusEntry[] }>("/api/corpus"),
  corpusBook: (id: string) => request<CorpusBook>(`/api/corpus/${encodeURIComponent(id)}`),
  corpusStats: () => request<CorpusStats>("/api/corpus-stats"),
};

/** Which server-side keys are present: Jev for analysis, OpenRouter for the brief. */
export type ServerStatus = { configured: boolean; brief: boolean };

let status: Promise<ServerStatus> | null = null;
export const serverStatus = () => (status ??= api.status().catch(() => ({ configured: false, brief: false })));

export function useServerStatus() {
  const [value, setValue] = useState<ServerStatus | null>(null);
  useEffect(() => void serverStatus().then(setValue), []);
  return value;
}
