const NAME = "xbook";
const VERSION = 1;
export type StoreName = "books" | "content";

let opening: Promise<IDBDatabase> | null = null;

function open() {
  opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(NAME, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const store of ["books", "content"])
        if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return opening;
}

async function run<T>(store: StoreName, mode: IDBTransactionMode, action: (s: IDBObjectStore) => IDBRequest<T>) {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const request = action(tx.objectStore(store));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error ?? request.error);
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

export const db = {
  all: <T>(store: StoreName) => run<T[]>(store, "readonly", (s) => s.getAll() as IDBRequest<T[]>),
  get: <T>(store: StoreName, id: string) => run<T | undefined>(store, "readonly", (s) => s.get(id) as IDBRequest<T | undefined>),
  put: <T>(store: StoreName, value: T) => run(store, "readwrite", (s) => s.put(value)),
  delete: (store: StoreName, id: string) => run(store, "readwrite", (s) => s.delete(id)),
};
