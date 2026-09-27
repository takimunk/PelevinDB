import { useSyncExternalStore } from "react";
import { tr } from "../i18n/index.ts";
import { importBook } from "../io/import.ts";
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
  set({ busy: tr({ en: `Reading ${file.name}`, ru: `Читаем ${file.name}` }), error: null });
  try {
    const book = await importBook(file);
    const id = await addBook(book, "upload");
    set({ busy: null, error: null });
    navigate(`/book/${id}`);
  } catch (error) {
    set({ busy: null, error: error instanceof Error ? error.message : tr({ en: "Could not open the book.", ru: "Не удалось открыть книгу." }) });
  }
}
