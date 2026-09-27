import test from "node:test";
import assert from "node:assert/strict";
import { deploymentConfig } from "../scripts/github-deploy.ts";
const env = {
  GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: "takimunk/PelevinDB", GITHUB_EVENT_NAME: "push",
  GITHUB_SHA: "a".repeat(40), GITHUB_REF: "refs/heads/main",
  COOLIFY_WEBHOOK: "https://flcl.stickies.fun/api/v1/deploy?uuid=production",
  COOLIFY_WEBHOOK_PREVIEW: "https://flcl.stickies.fun/api/v1/deploy?uuid=preview",
  DEPLOY_URL: "https://pelevindb.xyz", DEPLOY_URL_PREVIEW: "https://preview.pelevindb.xyz",
  GHCR_USERNAME: "test", GHCR_TOKEN: "test", COOLIFY_TOKEN: "test",
};
test("main deploys production; feature branches deploy a distinct preview", () => {
  assert.equal(deploymentConfig("production", env).tag, "latest");
  assert.equal(deploymentConfig("production", env).image, "ghcr.io/takimunk/pelevindb");
  assert.equal(deploymentConfig("preview", { ...env, GITHUB_REF: "refs/heads/codex/test" }).uuid, "preview");
});
test("production rejects PRs, wrong branches, projects and missing credentials", () => {
  for (const patch of [{ GITHUB_REF: "refs/heads/codex/test" }, { GITHUB_EVENT_NAME: "pull_request" }, { GITHUB_EVENT_NAME: "pull_request_target" }, { GITHUB_REPOSITORY: "takimunk/xbook" }, { GITHUB_ACTIONS: "false" }, { GITHUB_SHA: "latest" }, { GHCR_TOKEN: "" }]) {
    assert.throws(() => deploymentConfig("production", { ...env, ...patch }));
  }
});
test("preview cannot target production or trigger from main", () => {
  assert.throws(() => deploymentConfig("preview", env));
  assert.throws(() => deploymentConfig("preview", { ...env, GITHUB_REF: "refs/heads/codex/test", COOLIFY_WEBHOOK_PREVIEW: env.COOLIFY_WEBHOOK }));
});
test("rejects credential redirects, extra deploy targets and insecure health URLs", () => {
  for (const webhook of ["http://flcl.stickies.fun/api/v1/deploy?uuid=x", "https://evil.test/api/v1/deploy?uuid=x", "https://flcl.stickies.fun/api/v1/deploy?uuid=x&tag=all", "https://user:pass@flcl.stickies.fun/api/v1/deploy?uuid=x"]) {
    assert.throws(() => deploymentConfig("production", { ...env, COOLIFY_WEBHOOK: webhook }));
  }
  assert.throws(() => deploymentConfig("production", { ...env, DEPLOY_URL: "http://pelevindb.xyz" }));
});
