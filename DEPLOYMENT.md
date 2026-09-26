# xbook on Coolify

## Application

Use a Coolify **Docker Image** application with image `ghcr.io/takimunk/xbook`,
tag `latest`, exposed port `5173`. A separate preview application uses tag `preview`
and its own domain and volume. Configure GHCR read access on the Coolify server if
the package is private. CircleCI publishes images; Coolify only pulls and runs them.
Set the domain to `https://xbookx.xyz`. Do not publish port 5173 on the host.
The image binds to `0.0.0.0` and runs as the unprivileged `node` user.
Set the Coolify health check to Container command: `node /app/server/healthcheck.ts`.
It checks GET `/api/health` and uses the Node runtime already in the image.

Runtime environment:

- `APP_ORIGIN=https://xbookx.xyz`
- `OPENPANEL_CLIENT_ID`: public client ID from the OpenPanel xbook project
- `OPENPANEL_API_URL`: API URL shown by your OpenPanel installation (cloud default: `https://api.openpanel.dev`)
- `XBOOK_DB=/app/data/xbook.db` (image default)

Mount persistent storage at `/app/data`. Import the corpus with a SQLite backup or
checkpointed copy into `xbook.db`; the container user (UID 1000) needs read access.
The app starts without the corpus, but the canon will be empty. The bundled atlas
remains available. Never place the database in `public/` or the Docker image.

Set `TYPESAFE_API_KEY` and `OPENROUTER_API_KEY` only in Coolify runtime variables.
Each provider has a separate, application-wide **$10 lifetime budget**. The paid
endpoints are public: visitors share this allowance. Search, reading, maps and saved
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

CircleCI runs TypeScript/build, unit and browser tests on each branch. On `codex/`
branches it builds and deploys a preview; on `main` it deploys production. The deploy
job builds a production image and checks its health before publishing to GHCR.
GitHub Actions is removed to avoid duplicate checks and account billing failures.

Add these **project environment variables** in CircleCI (never commit secrets):

- `GHCR_USERNAME`, `GHCR_TOKEN`: a publisher with package write permission
- `COOLIFY_TOKEN`: a Coolify token with deploy permission
- `COOLIFY_WEBHOOK`: production authenticated deploy URL, including `uuid`
- `COOLIFY_WEBHOOK_PREVIEW`: deploy URL for a different preview application
- `DEPLOY_URL=https://xbookx.xyz`
- `DEPLOY_URL_PREVIEW`: HTTPS URL of the preview application

The Coolify origin is restricted to `https://flcl.stickies.fun`. Keep secrets limited
to trusted project branches; do not enable passing secrets to forked PRs. Disable
Coolify's independent Git auto-deployments. Merging a PR to main enables production
publishing, so review and authorize the merge first.

Like Sticky, images have immutable commit tags and a moving `preview`/`latest` tag.
CircleCI serializes deployment jobs per target, covering publishing and deployment
together. After Coolify accepts the request, CI waits up to ten minutes for the
public health endpoint to return the **expected commit SHA**, so an old healthy
container cannot make a failed rollout pass. Missing credentials, shared preview
and production UUIDs, or a production run from a PR fail before publishing.

## Domain

At the domain's DNS provider, point the apex (`@`) A record at the **application
server's** public IPv4 address from Coolify. A control-panel address may refer to a
different server. Add AAAA only if that server has working IPv6. Once DNS resolves,
Coolify can issue the Let's Encrypt certificate for `https://xbookx.xyz`.

## OpenPanel

Create an xbook project and a web client allowing `https://xbookx.xyz`. Copy its public
client ID into Coolify's runtime environment; do not expose a client secret. For a
self-hosted installation use its API endpoint in `OPENPANEL_API_URL` and ensure its
HTTPS certificate works. Restart xbook after changing runtime values; no rebuild is
needed. If no client ID is configured, no analytics events are sent.

The SDK tracks initial visits and hash navigation, including browser back/forward.
It groups local books at `/book/local`, strips search/page parameters, and retains
public Gutenberg book IDs. Referrers retain the origin only. It sends no book text,
search text, user identities or session recordings. Visitor/device/location metrics
are resolved by OpenPanel. Verify a live `screen_view` in the project after opening
xbook, then check library → map navigation appears.

References: [Coolify CI](https://coolify.io/docs/applications/sources/github/actions),
[OpenPanel web SDK](https://openpanel.dev/docs/sdks/web).
