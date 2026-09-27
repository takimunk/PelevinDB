// Vite replaces `import.meta.env.DEV` at build time; the project does not load vite/client types,
// so declare the one flag the blog uses (compatible with vite/client if it is added later).
interface ImportMetaEnv {
  readonly DEV: boolean;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
