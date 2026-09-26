# xbook on Coolify

## Application

Use this repository as a Coolify Git application, branch `main`, Dockerfile build pack,
Dockerfile `/Dockerfile`, build context `/`, exposed port `5173`.
Set the domain to `https://xbookx.xyz`. Do not publish port 5173 on the host.
The image binds to `0.0.0.0` and runs as the unprivileged `node` user.
Set the Coolify health check to GET `/api/health`, port 5173, expected status 200.

Runtime environment:

- `APP_ORIGIN=https://xbookx.xyz`
- `OPENPANEL_CLIENT_ID`: public client ID from the OpenPanel xbook project
- `OPENPANEL_API_URL`: API URL shown by your OpenPanel installation (cloud default: `https://api.openpanel.dev`)
- `XBOOK_DB=/app/data/xbook.db` (image default)

Mount persistent storage at `/app/data`. Import the corpus with a SQLite backup or
checkpointed copy into `xbook.db`; the container user (UID 1000) needs read access.
The app starts without the corpus, but the canon will be empty. The bundled atlas
remains available. Never place the database in `public/` or the Docker image.

Keep `TYPESAFE_API_KEY` and `OPENROUTER_API_KEY` unset for the public deployment:
the current paid-analysis endpoints have no user authentication or per-user quotas.
Search, import, local reading, maps and the precomputed corpus do not need those keys.

## CI and deployment

The Checks workflow runs TypeScript/build, unit and browser tests, and a production
Docker build/start/HTTP check on every PR and main push. Browser failures retain
artifacts for seven days. PRs build the app but do not trigger production deployment.

For CI-controlled deployments, disable Coolify's independent automatic deployment
for main. In GitHub repository Actions settings add:

- Secret `COOLIFY_WEBHOOK`: the application's authenticated deploy webhook
- Secret `COOLIFY_TOKEN`: a Coolify token with deployment permission
- Variable `COOLIFY_DEPLOY_ENABLED=true`

Only successful main checks call that webhook. Coolify builds the repository's
Dockerfile and handles HTTPS. The workflow reports whether the deployment request
was accepted; confirm the final deployment and container health in Coolify.
Before these settings exist, the deployment job deliberately stays disabled.
Coolify GitHub preview deployments can be enabled separately for PRs; use a distinct
preview domain, no paid API keys, and no production OpenPanel client ID.

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
