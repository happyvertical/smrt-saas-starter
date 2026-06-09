---
name: run-web
description: Launch and drive the smrt-saas-web SvelteKit dev server (Postgres-backed multi-tenant SaaS) and view it in a browser. Use when asked to run, start, preview, or screenshot the web app.
---

# Run the web app (apps/web)

`apps/web` is a SvelteKit (adapter-node, Vite 7) multi-tenant SaaS that talks to
Postgres through the SMRT framework. "Running it" means: Postgres up and seeded,
the Vite dev server started, then a browser driven against it to a logged-in
page that proves the tenant/subscription surfaces render.

## Prerequisites: Postgres must be up and seeded

The app has no SQLite dev fallback — it needs the Postgres in `docker-compose.yml`.

```bash
docker compose up -d                      # Postgres 18 on 127.0.0.1:5432
pnpm install                              # if node_modules is absent
pnpm db:seed                              # migrate + seed demo tenant/plans/usage
```

`pnpm db:seed` (and `pnpm db:smoke`) target
`postgresql://smrt_saas:localdev@127.0.0.1:5432/smrt_saas` — the same default the
app uses when `DATABASE_URL` is unset. Skip this and `/app/*` loads error on the
missing tables.

## Start the dev server

```bash
SESSION_SECRET=dev-secret \
  pnpm --filter @happyvertical/smrt-saas-web dev
```

This runs `vite dev --host 0.0.0.0` on **port 5173**.

### Port gotcha — reach it on 127.0.0.1, not localhost

`--host 0.0.0.0` binds **IPv4** (`*:5173`). On macOS `localhost` resolves to IPv6
(`::1`) first, so `curl localhost:5173` can miss this server (or hit an unrelated
dev server bound to `[::1]:5173`). Always reach the app at
**`http://127.0.0.1:5173`**.

To sidestep the collision entirely, run Vite directly on a private loopback port:

```bash
SESSION_SECRET=dev-secret \
  pnpm --filter @happyvertical/smrt-saas-web exec vite dev --port 5174 --strictPort
```

Poll the port before driving (first compile can take a few seconds):

```bash
timeout 30 bash -c 'until curl -sf http://127.0.0.1:5173/ >/dev/null; do sleep 1; done'
```

Stop with `pkill -f 'smrt-saas-web.*vite dev'`.

## Auth: dev fallback logs you in as the demo Owner

When `NODE_ENV !== production`, `SMRT_STARTER_DEV_AUTH` defaults to on, so requests
resolve to the seeded demo-tenant **Owner** with full permissions — no login step.
Just open `/app`. To exercise the real magic-link login set `SESSION_SECRET` and
`SMRT_STARTER_AUTH_INLINE_LINKS=true`; to disable the fallback set
`SMRT_STARTER_DEV_AUTH=false`.

## Drive it

```bash
for p in / /app /app/billing /app/usage /app/settings; do
  curl -s -o /dev/null -w "%{http_code}  $p\n" "http://127.0.0.1:5173$p"
done
curl -s -o /dev/null -w "checkout (Stripe unset) -> %{http_code}\n" \
  "http://127.0.0.1:5173/api/billing/checkout?planId=growth"
```

Expected: the pages return `200`; the checkout returns `503` because Stripe is
unconfigured (the `isStripeBillingConfigured()` guard — not a failure). For a
visual check, point a headless browser at `http://127.0.0.1:5173/app` and
screenshot — the dashboard shows the seeded **Growth** plan and live usage meters
(AI tokens, chat messages, MCP calls).

In Claude Code, `.claude/launch.json` defines a `web` preview config (Vite on
5174) so `preview_start` + `preview_screenshot` work directly; it reaches the
server on `localhost:5174`.

## Env vars

| Var | Needed for | Default |
| --- | --- | --- |
| `DATABASE_URL` | DB connection | `postgresql://smrt_saas:localdev@127.0.0.1:5432/smrt_saas` |
| `SMRT_STARTER_DEV_AUTH` | demo-Owner auto-login | on when not production |
| `SESSION_SECRET` | magic-link login (`/login`, signup) | unset → those routes 500 |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | live billing; unset → checkout 503 | unset |
| `SMRT_STARTER_TRUST_TENANT_HEADER` | honor `x-tenant-id` header | `false` (ignored) |

## Gotchas

- **0 SMRT objects / missing tables** on `/app/*` → Postgres isn't up or wasn't
  seeded. Run `docker compose up -d && pnpm db:seed`.
- **Page reachable but blank/500** → check the dev-server log; a load can throw
  while the shell renders. Hit the route with `curl` and read the status.
- **`SESSION_SECRET is required for magic link authentication`** → only blocks the
  login/signup flows; dev-fallback browsing of `/app` still works without it.
