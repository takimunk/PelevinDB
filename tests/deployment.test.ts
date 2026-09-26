import test from "node:test";
import assert from "node:assert/strict";
import { deploymentConfig } from "../scripts/circleci-deploy.ts";
const env = {
  CIRCLECI: "true", CIRCLE_PROJECT_USERNAME: "takimunk", CIRCLE_PROJECT_REPONAME: "xbook",
  CIRCLE_SHA1: "a".repeat(40), CIRCLE_BRANCH: "main",
  COOLIFY_WEBHOOK: "https://flcl.stickies.fun/api/v1/deploy?uuid=production",
  COOLIFY_WEBHOOK_PREVIEW: "https://flcl.stickies.fun/api/v1/deploy?uuid=preview",
  DEPLOY_URL: "https://xbookx.xyz", DEPLOY_URL_PREVIEW: "https://preview.xbookx.xyz",
  GHCR_USERNAME: "test", GHCR_TOKEN: "test", COOLIFY_TOKEN: "test",
};
test("main deploys production; feature branches deploy a distinct preview", () => {
  assert.equal(deploymentConfig("production", env).tag, "latest");
  assert.equal(deploymentConfig("preview", { ...env, CIRCLE_BRANCH: "codex/test" }).uuid, "preview");
});
test("production rejects PRs, wrong branches, projects and missing credentials", () => {
  for (const patch of [{ CIRCLE_BRANCH: "codex/test" }, { CIRCLE_PULL_REQUEST: "https://github.com/takimunk/xbook/pull/2" }, { CIRCLE_PULL_REQUESTS: "pr" }, { CIRCLE_PROJECT_REPONAME: "sticky" }, { CIRCLECI: "false" }, { CIRCLE_SHA1: "latest" }, { GHCR_TOKEN: "" }]) {
    assert.throws(() => deploymentConfig("production", { ...env, ...patch }));
  }
});
test("preview cannot target production or trigger from main", () => {
  assert.throws(() => deploymentConfig("preview", env));
  assert.throws(() => deploymentConfig("preview", { ...env, CIRCLE_BRANCH: "codex/test", COOLIFY_WEBHOOK_PREVIEW: env.COOLIFY_WEBHOOK }));
});
test("rejects credential redirects, extra deploy targets and insecure health URLs", () => {
  for (const webhook of ["http://flcl.stickies.fun/api/v1/deploy?uuid=x", "https://evil.test/api/v1/deploy?uuid=x", "https://flcl.stickies.fun/api/v1/deploy?uuid=x&tag=all", "https://user:pass@flcl.stickies.fun/api/v1/deploy?uuid=x"]) {
    assert.throws(() => deploymentConfig("production", { ...env, COOLIFY_WEBHOOK: webhook }));
  }
  assert.throws(() => deploymentConfig("production", { ...env, DEPLOY_URL: "http://xbookx.xyz" }));
});
