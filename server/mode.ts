/**
 * Local mode is the private, single-user setup: upload your own books and spend the TypeSafe/OpenRouter keys on them.
 * On by default in development; the production container is public unless LOCAL_MODE=1. LOCAL_MODE=0 forces it off.
 */
export const localMode = (env: NodeJS.ProcessEnv = process.env) => env.LOCAL_MODE === "1" || (env.NODE_ENV !== "production" && env.LOCAL_MODE !== "0");
