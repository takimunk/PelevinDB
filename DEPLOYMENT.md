# PelevinDB on Coolify

## Application

Use a Coolify **Docker Image** application with image `ghcr.io/takimunk/pelevindb`,
tag `latest`, exposed port `5173`. A separate preview application uses tag `preview`
and its own domain and volume. Configure GHCR read access on the Coolify server if
the package is private. GitHub Actions publishes images; Coolify only pulls and runs them.
Set the domain to `https://pelevindb.xyz`. Do not publish port 5173 on the host.
The image binds to `0.0.0.0` and runs as the unprivileged `node` user.
Set the Coolify health check to Container command: `node /app/server/healthcheck.ts`.
It checks GET `/api/health` and uses the Node runtime already in the image.

Runtime environment:

- `APP_ORIGIN=https://pelevindb.xyz`
- `OPENPANEL_CLIENT_ID`: public client ID from the OpenPanel PelevinDB project
- `OPENPANEL_API_URL`: API URL shown by your OpenPanel installation (cloud default: `https://api.openpanel.dev`)
- `XBOOK_DB=/app/data/xbook.db` (image default)
- `LOCAL_MODE`: leave unset on the public site. Local mode (uploading and analysing your own
  books, and the paid `/api/analyze`, `/api/profile` and `/api/brief` routes) is on by default
  only when `NODE_ENV` is not `production`, so `npm run dev` has it and the container does not.
  `LOCAL_MODE=1` turns it on in production (private use only); `LOCAL_MODE=0` turns it off in development.
- `CORPUS_FULL_TEXT`: leave unset. The corpus is copyrighted: the book payload carries only short
  excerpts, and `/api/corpus/:id/page/:n` serves one page at a time (60 pages a minute per client,
  `CORPUS_PAGES_PER_MINUTE`). `CORPUS_FULL_TEXT=1` sends whole books, for local use only.

Mount persistent storage at `/app/data`. Import the corpus with a SQLite backup or
checkpointed copy into `xbook.db`; the container user (UID 1000) needs read access.
The app starts without the corpus, but the library will be empty. The bundled atlas
remains available. Never place the database in `public/` or the Docker image.

Set `TYPESAFE_API_KEY` and `OPENROUTER_API_KEY` only in Coolify runtime variables, and only if
the deployment runs in local mode; the public site never calls them (the paid routes answer 404
unless `LOCAL_MODE=1`). Each provider has a separate, application-wide **$10 lifetime budget**.
In local mode the paid endpoints are open to anyone who can reach the server, sharing this allowance. Search, reading, maps and saved
results continue to work when the allowance is exhausted.

Set `XBOOK_BUDGET_DB=/app/data/spending.db` on the persistent volume and keep
`XBOOK_BUDGET_PERIOD=lifetime`. The directory must be writable by UID 1000.
Never delete or replace this ledger during deployments. Every HTTP attempt reserves
its maximum cost atomically before contacting the provider; successful responses
refund unused reservations from reported usage. Failed or interrupted requests keep
their reservation because their billing is uncertain. Consequently, analysis may
stop before actual charges reach $10. Concurrent workers share the same SQLite
ledger. A missing/unwritable ledger fails closed. `/api/status` reports used,
reserved and remaining amounts without exposing keys or book text.

TypeSafe uses pinned `jev-1.13.0` at $0.042 per million input tokens and free output,
reserving its full 64K context. OpenRouter verifies the model catalog and enforces
provider price ceilings of $1/M input and $10/M output, zero per-request fees,
and 2,000 output tokens. It reserves the model's entire context plus output.
Unknown models/pricing and unexpectedly excessive reported charges block spending.
These bounds cover requests made by this deployment after activation; historical
usage and other applications using the same keys are outside this ledger.

There is no public reset endpoint. To reset deliberately: stop the application,
back up `spending.db` together with its SQLite journal, archive the ledger, then
restart with a new ledger at the same path. This grants a new $10 allowance for
both providers; do it only with the owner's explicit authorization. Keep paid keys
unset in previews, or give previews an independently approved allowance.

## CI and deployment

GitHub Actions runs TypeScript/build, unit tests and Chromium/WebKit browser tests.
Trusted pushes to `codex/` branches deploy the shared preview; `main` deploys
production after checks pass. Pull requests run checks without deployment secrets.
CircleCI is removed. Actions run on standard `ubuntu-24.04` hosted runners.

Workflow: `.github/workflows/ci.yml`. Deploy script: `scripts/github-deploy.ts`.
Actions are pinned to verified release commit SHAs. The deployment job alone gets
`packages: write` and publishes with its short-lived `GITHUB_TOKEN`; no GHCR PAT is
needed. Coolify only pulls and runs the image. Disable independent Git auto-deploys.

Configured **GitHub Actions repository variables**:

- `COOLIFY_WEBHOOK=https://flcl.stickies.fun/api/v1/deploy?uuid=mdthw5l4cnhjz8dygwlz3mh3`
- `COOLIFY_WEBHOOK_PREVIEW=https://flcl.stickies.fun/api/v1/deploy?uuid=sia2wmarhmkvfyzgqkebpdgl`
- `DEPLOY_URL=https://pelevindb.xyz`
- `DEPLOY_URL_PREVIEW=https://sia2wmarhmkvfyzgqkebpdgl.179.61.227.96.sslip.io`

Repository **secret**: `COOLIFY_TOKEN`, a token with deploy permission only.
The registry credentials are provided automatically by the workflow.
Never commit credentials or enable deployment secrets for untrusted pull requests.

Coolify applications `PelevinDB` and `PelevinDB-preview` use separate persistent
volumes and `latest`/`preview` image tags. Neither application inherits xbook's paid
provider keys or OpenPanel client ID. Configure these separately when needed;
previews should keep paid keys unset. Existing corpus analyses may be copied via
SQLite's backup API, without copying the spending ledger or private credentials.

Images have immutable commit tags plus a moving `latest` or `preview` tag. GitHub
Actions serializes the publish/deploy jobs per target. The script builds an image,
starts it locally and verifies its health before publishing it. After Coolify queues
the rollout, it waits up to ten minutes for the public `/api/health` endpoint to
return the expected commit SHA, preventing an old healthy container from passing.
Missing credentials, shared preview/production UUIDs and untrusted events fail
before publication. Initial deployment is authorized for this new application;
subsequent production releases follow reviewed merges into `main`.

## Domain

At the domain's DNS provider, point the apex (`@`) A record at the **application
server's** public IPv4 address from Coolify. A control-panel address may refer to a
different server. Add AAAA only if that server has working IPv6. Once DNS resolves,
Coolify can issue the Let's Encrypt certificate for `https://pelevindb.xyz`.

## OpenPanel

Create a PelevinDB project and a web client allowing `https://pelevindb.xyz`. Copy its public
client ID into Coolify's runtime environment; do not expose a client secret. For a
self-hosted installation use its API endpoint in `OPENPANEL_API_URL` and ensure its
HTTPS certificate works. Restart xbook after changing runtime values; no rebuild is
needed. If no client ID is configured, no analytics events are sent.

The SDK tracks initial visits and hash navigation, including browser back/forward.
It groups local books at `/book/local`, strips search/page parameters, and retains
public corpus book IDs (`pv-…`). Referrers retain the origin only. It sends no book text,
search text, user identities or session recordings. Visitor/device/location metrics
are resolved by OpenPanel. Verify a live `screen_view` in the project after opening
xbook, then check library → map navigation appears.

References: [Coolify CI](https://coolify.io/docs/applications/sources/github/actions),
[OpenPanel web SDK](https://openpanel.dev/docs/sdks/web).
