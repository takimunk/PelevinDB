import { useEffect, useState } from "react";
import type { BookBrief, BookProfile, BriefDossier, BriefLang, CorpusBook, CorpusEntry, CorpusStats, SegmentAnalysis } from "../../shared/types.ts";

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
  brief: (dossier: BriefDossier, lang: BriefLang, signal?: AbortSignal) => request<BookBrief>("/api/brief", post({ dossier, lang }, signal)),
  corpus: () => request<{ available: boolean; books: CorpusEntry[] }>("/api/corpus"),
  corpusBook: (id: string) => request<CorpusBook>(`/api/corpus/${encodeURIComponent(id)}`),
  corpusStats: () => request<CorpusStats>("/api/corpus-stats"),
};

/** Local mode (uploads allowed) and which server-side keys are present: Jev for analysis, OpenRouter for the brief. */
export type ServerStatus = { localMode?: boolean; configured: boolean; brief: boolean };

let status: Promise<ServerStatus> | null = null;
export const serverStatus = () => (status ??= api.status().catch(() => ({ localMode: false, configured: false, brief: false })));

export function useServerStatus() {
  const [value, setValue] = useState<ServerStatus | null>(null);
  useEffect(() => void serverStatus().then(setValue), []);
  return value;
}
