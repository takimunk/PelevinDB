// Vite's `import.meta.glob`, declared here because the project does not load vite/client types.
// Used for optional, lazily loaded modules that may not exist yet (the glob then matches nothing).
interface ImportMeta {
  glob<T = unknown>(pattern: string | string[], options?: { eager?: false; import?: string }): Record<string, () => Promise<T>>;
}
