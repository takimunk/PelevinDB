import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

type Env = Record<string, string | undefined>;
export function deploymentConfig(target: string, env: Env) {
  const required = (key: string) => {
    const value = env[key];
    if (!value) throw new Error(`${key} is required`);
    return value;
  };
  if (env.CIRCLECI !== "true" || env.CIRCLE_PROJECT_USERNAME !== "takimunk" || env.CIRCLE_PROJECT_REPONAME !== "xbook") throw new Error("Only the xbook CircleCI project may deploy");
  const sha = required("CIRCLE_SHA1");
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error("Invalid commit SHA");
  if (target !== "preview" && target !== "production") throw new Error("Invalid target");
  if (target === "production" && (env.CIRCLE_BRANCH !== "main" || env.CIRCLE_PULL_REQUEST || env.CIRCLE_PULL_REQUESTS)) throw new Error("Production requires a main branch push");
  if (target === "preview" && !env.CIRCLE_BRANCH?.startsWith("codex/")) throw new Error("Preview requires a codex/ branch");
  const suffix = target === "preview" ? "_PREVIEW" : "";
  const webhook = new URL(required(`COOLIFY_WEBHOOK${suffix}`));
  if (webhook.origin !== "https://flcl.stickies.fun" || webhook.pathname !== "/api/v1/deploy" || webhook.username || webhook.password || webhook.hash) throw new Error("Unexpected Coolify webhook");
  const uuid = webhook.searchParams.get("uuid");
  if (!uuid || !/^[a-z0-9]+$/.test(uuid) || [...webhook.searchParams.keys()].some(k => !["uuid", "force"].includes(k))) throw new Error("Invalid application UUID or webhook parameters");
  if (target === "preview" && uuid === new URL(required("COOLIFY_WEBHOOK")).searchParams.get("uuid")) throw new Error("Preview must use a separate application");
  const site = new URL(required(`DEPLOY_URL${suffix}`));
  if (site.protocol !== "https:" || site.username || site.password || site.search || site.hash) throw new Error("Deployment URL must use HTTPS");
  return { sha, uuid, webhook, site, image: "ghcr.io/takimunk/xbook", tag: target === "production" ? "latest" : "preview", username: required("GHCR_USERNAME"), registryToken: required("GHCR_TOKEN"), token: required("COOLIFY_TOKEN") };
}

async function deploy(target: string) {
  const c = deploymentConfig(target, process.env);
  const docker = (args: string[], input?: string) => {
    const result = spawnSync("docker", args, { stdio: input ? ["pipe", "inherit", "inherit"] : "inherit", input });
    if (result.error || result.status !== 0) throw new Error(`Docker ${args[0]} failed`);
  };
  const immutable = `${c.image}:${c.sha}`;
  docker(["build", "--build-arg", `APP_REVISION=${c.sha}`, "-t", immutable, "."]);
  const container = `xbook-check-${c.sha.slice(0, 12)}`;
  try {
    docker(["run", "-d", "--name", container, "-p", "127.0.0.1:5173:5173", immutable]);
    await waitForRevision(new URL("http://127.0.0.1:5173"), c.sha, 30);
  } finally {
    spawnSync("docker", ["logs", container], { stdio: "inherit" });
    spawnSync("docker", ["rm", "-f", container], { stdio: "inherit" });
  }
  try {
    docker(["login", "ghcr.io", "-u", c.username, "--password-stdin"], c.registryToken);
    docker(["push", immutable]);
    docker(["tag", immutable, `${c.image}:${c.tag}`]);
    docker(["push", `${c.image}:${c.tag}`]);
  } finally {
    spawnSync("docker", ["logout", "ghcr.io"], { stdio: "inherit" });
  }
  const response = await fetch(c.webhook, { method: "POST", headers: { Authorization: `Bearer ${c.token}` }, signal: AbortSignal.timeout(60_000), redirect: "error" });
  if (!response.ok) throw new Error(`Coolify deploy request failed: HTTP ${response.status}`);
  const queued = await response.json() as { deployments?: { resource_uuid: string; deployment_uuid: string }[] };
  const id = queued.deployments?.find(d => d.resource_uuid === c.uuid)?.deployment_uuid;
  if (!id || !/^[a-z0-9]+$/.test(id)) throw new Error("Coolify did not queue the expected application");
  console.log(`Coolify queued deployment ${id}; waiting for revision ${c.sha}`);
  await waitForRevision(c.site, c.sha, 120);
  console.log(`Verified ${target} deployment: ${c.site.origin}, revision ${c.sha}`);
}

async function waitForRevision(site: URL, sha: string, attempts: number) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetch(new URL("/api/health", site), { signal: AbortSignal.timeout(5000), cache: "no-store", redirect: "error" });
      const health = await response.json() as { status?: string; revision?: string };
      if (response.ok && health.status === "ok" && health.revision === sha) return;
    } catch { /* Allow startup and proxy propagation; never log secrets or response bodies. */ }
    if (attempt % 6 === 0) console.log("Waiting for the expected healthy revision…");
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  throw new Error("The expected revision did not become healthy before the deployment deadline");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  deploy(process.argv[2]).catch(error => { console.error(error.message); process.exitCode = 1; });
}
