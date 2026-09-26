import { useSyncExternalStore } from "react";
import type { CatalogHit } from "../../shared/types.ts";
import { normalize } from "../domain/text.ts";
import { importBook, MAX_TEXT } from "../io/import.ts";
import { api } from "../services/api.ts";
import { addBook } from "../storage/library.ts";
import { navigate } from "./router.ts";

type ImportState = { busy: string | null; error: string | null };
let state: ImportState = { busy: null, error: null };
const listeners = new Set<() => void>();
const set = (next: ImportState) => {
  state = next;
  listeners.forEach((l) => l());
};

export function useImportState() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

export const clearImportError = () => set({ ...state, error: null });

let picker: HTMLInputElement | null = null;
export const registerPicker = (input: HTMLInputElement | null) => void (picker = input);
export const openFilePicker = () => picker?.click();

export async function importFile(file: File | undefined) {
  if (!file || state.busy) return;
  set({ busy: `reading ${file.name}`, error: null });
  try {
    const book = await importBook(file);
    const id = await addBook(book, "upload");
    set({ busy: null, error: null });
    navigate(`/book/${id}`);
  } catch (error) {
    set({ busy: null, error: error instanceof Error ? error.message : "Could not open the book." });
  }
}

export async function importCatalog(hit: CatalogHit) {
  if (state.busy) return;
  set({ busy: `fetching "${hit.title}" from Project Gutenberg`, error: null });
  try {
    const data = await api.catalogText(hit.id);
    const text = normalize(data.text);
    if (!text) throw new Error("No text found in the book.");
    if (text.length > MAX_TEXT) throw new Error(`Book too long: limit is ${MAX_TEXT / 1e6}M chars.`);
    const id = await addBook(
      { title: data.title || hit.title, author: data.author || hit.author, text, format: "GUTENBERG" },
      "gutenberg",
      hit.id,
    );
    set({ busy: null, error: null });
    navigate(`/book/${id}`);
  } catch (error) {
    set({ busy: null, error: error instanceof Error ? error.message : "Could not download the book." });
  }
}
