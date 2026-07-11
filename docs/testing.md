# Testing Strategy

The hosted CI layout, runner selection, rollout gates, PostgreSQL isolation,
generated-context reuse, and required-check installation are documented in
[`.github/CI.md`](../.github/CI.md). The commands below remain the local source
of truth.

The starter validates in layers. Narrow layers run constantly during
development; the full gate runs before every push (`pnpm check`, enforced by
the pre-push hook and CI). Layers that need heavy local toolchains or a
running browser stay out of `pnpm check` and are listed with their own
triggers below.

CI keeps `pnpm check` available but reports format, lint, typecheck, SQLite
tests, build, workflow, manifest, SOPS, template, PostgreSQL, E2E, mobile, and
deployment-candidate confidence separately. Use `pnpm test:sqlite` for the fast
portable suite. Use `CI_POSTGRES_BASE_URL=postgresql://... pnpm test:postgres`
for production-sensitive schema, migration, UUID, relationship, and query
behavior; the wrapper always creates and force-drops a unique database.

## Layers

| Layer | Tool | Command | In `pnpm check` |
| --- | --- | --- | --- |
| Static gates | biome, svelte-check/tsc | `pnpm format:check && pnpm lint && pnpm typecheck` | yes |
| Unit + route tests | vitest per workspace | `pnpm test` | yes |
| Script tests | node:test | `node --test scripts/__tests__/*.test.mjs` (part of `pnpm test`) | yes |
| DB smoke | real Postgres | `pnpm db:smoke` | yes |
| Scaffold/config guards | custom scripts | `pnpm deps:check`, `workflows:check`, `manifests:check`, `sops:check`, `validate` | yes |
| Mobile contract | generator + node:test | `pnpm mobile:generate && pnpm mobile:validate` | shell test via `pnpm test` |
| Production-image e2e | Docker, PostgreSQL, Playwright | `pnpm test:e2e:production` | no (CI `e2e` job on PRs) |
| Browser e2e (deployed) | Playwright `@public` | `PLAYWRIGHT_BASE_URL=https://... test:e2e` | no (staging deploy gate) |
| Native mobile | Gradle / Xcode | `pnpm mobile:validate:native` | no (CI jobs) |
| Runtime images | Docker + kustomize | `pnpm runtime:check` | no (CI `runtime` job) |

## What to run for which change

- **Server/lib code in `apps/web`** — `pnpm --filter @happyvertical/smrt-saas-web test`
  and `typecheck`, then `pnpm check`. Add a vitest file next to the module
  (`foo.test.ts`); route handlers get `server-route.test.ts` siblings.
- **SMRT objects / services (`packages/app-objects`)** — `pnpm objects:test`
  and `pnpm typecheck`. Pure services are tested without a DB; schema-touching
  changes also need `pnpm db:smoke`.
- **Worker jobs (`apps/worker`)** — package test + typecheck. Jobs must stay
  idempotent; test both the direct path and the SMRT-jobs adapter path.
- **Anything touching migrations, seeds, or tenant columns** — `pnpm db:smoke`
  against fresh Docker Compose Postgres (`pnpm services:up`). It migrates,
  seeds, and asserts tenant_id columns are native UUID with no empty-string
  defaults.
- **Mobile contract (`packages/mobile-contract`)** — `pnpm mobile:generate`,
  commit the regenerated Kotlin/Swift, `pnpm mobile:validate`. The contract
  test fails if the committed surface drifts from the generator output.
- **UI flows (login, signup, tenant switch, billing pages)** — use the quick
  dev-server loop with `pnpm --filter @happyvertical/smrt-saas-web test:e2e`,
  then run `pnpm test:e2e:production` before shipping. The production command
  builds the adapter-node output and real web image, starts an isolated empty
  PostgreSQL container, and exercises the image's migrate → seed → server
  entrypoint. It waits on health, verifies required framework/starter tables,
  reruns the same entrypoint against the initialized database, and runs the
  browser suite against the compiled image. CI runs this hermetic gate on every
  PR, including Renovate's lockstep SMRT updates.
- **Dockerfiles, runtime trees, manifests, deploy scripts** —
  `pnpm runtime:check` (build → prepare runtime trees → build images → smoke
  them → render manifests). Needs Docker and `kubectl`.

## E2E: one suite, four execution profiles

The Playwright suite supports four profiles selected by its command and
environment:

- **Local (default)** — boots the dev server and runs every spec, including
  flows that ride the non-production dev-auth fallback. This is the fast local
  feedback path.
- **Deployed (`PLAYWRIGHT_BASE_URL` set)** — runs only specs tagged `@public`
  against the given environment. Deployed environments have real auth, so
  `@public` specs must stay unauthenticated, read-only, and free of seed-data
  assumptions (landing page, login form, `/api/health`).
- **Authenticated (`@authed`)** — exercise tenant surfaces behind login. They
  mint a real `smrt-users` session for a seeded e2e user via
  `POST /api/e2e/session` (see below) instead of relying on the dev-auth
  fallback, so they work on deployed environments. They run only when
  `E2E_AUTH_SECRET` is configured.
- **Production image (`pnpm test:e2e:production`)** — sets a private runner
  mode that runs the full local/demo-auth suite plus `production.spec.ts`
  against the compiled image. The route crawler imports
  the same typed navigation source as `/app/+layout.svelte`, so a new
  destination automatically gains a route and heading contract. Critical signup and
  field-policy tests remain explicit, and the field-policy test performs real
  create/update/read operations only in the ephemeral database.

Production failures retain container logs/inspect output under
`artifacts/production-e2e`, plus Playwright traces, screenshots, videos, and the
HTML report. CI uploads them for 14 days. Container and network names include a
run-specific suffix and are label-checked before cleanup, so concurrent local
runs do not share state. A missing `_smrt_field_policies` table fails before the
browser starts, the second entrypoint must preserve the exact seed snapshot,
and every document navigation must return HTTP 200 without hydration-time
console, request, or server failures.

The staging deploy pipeline uses the deployed mode as a promotion gate: it
bakes the commit SHA into the web image (`APP_VERSION`), waits for
`/api/health` on `STAGING_BASE_URL` to report that SHA
(`scripts/wait-for-deploy.mjs`, so the smoke never races the GitOps rollout),
runs the suite, and only then opens the staging→main promotion PR. Set the
`STAGING_BASE_URL` variable on the `staging` GitHub environment to enable the
gate; when unset it is skipped so fresh starter clones still deploy.

### Authenticated e2e: the session-mint endpoint

Deployed environments have real auth and (correctly) do not enable the
`SMRT_STARTER_DEV_AUTH` fallback or `SMRT_STARTER_AUTH_INLINE_LINKS` — do not
turn those on just to make tests pass. Instead, `@authed` specs authenticate
through a gated test endpoint:

- `POST /api/e2e/session` mints a real session for the configured e2e user,
  bypassing only the OIDC/magic-link step. Identity comes solely from
  `E2E_USER_EMAIL` (a seeded user), never the request.
- The route is **fail-closed**: a 404 unless `E2E_AUTH_SECRET` is set, and the
  caller must present that secret (constant-time check). The gate is the
  secret, not `NODE_ENV` — deployed images run `NODE_ENV=production`, so
  production simply never sets the secret and the route never exists there.
- Enabling it on staging requires the secret/email on **both sides**, because
  the runner sends the header but the deployed web pod reads the env:
  1. **Deployed web pod** — add `E2E_AUTH_SECRET` (staging secret) and
     `E2E_USER_EMAIL` (staging config) to the staging deployment's
     secret/config so `/api/e2e/session` is enabled in the pod. Staging only —
     never the base/production overlays.
  2. **CI runner** — add the same `E2E_AUTH_SECRET` secret and `E2E_USER_EMAIL`
     variable to the `staging` GitHub environment so the smoke step can call the
     endpoint.
  3. Seed a dedicated e2e tenant/user (the `E2E_USER_EMAIL` identity).

  The staging smoke step probes the deployed endpoint first and degrades to
  `@public` (with a warning) if the pod isn't provisioned, so a runner-only
  setup won't block promotion. To run `@authed` locally, export both against a
  seeded user:

  ```sh
  E2E_AUTH_SECRET=dev E2E_USER_EMAIL=demo-owner@example.com \
    pnpm --filter @happyvertical/smrt-saas-web test:e2e
  ```

## Conventions

- Tests live next to the code (`*.test.ts`) except `packages/app-objects`,
  which uses `src/__tests__/`. Playwright specs live in `apps/web/e2e/`
  (`*.spec.ts`, excluded from vitest).
- Mock at the module boundary with `vi.mock` (see
  `apps/web/src/lib/server/mobile-auth.test.ts` for the pattern); don't stand
  up SMRT/DB state in unit tests — DB-backed verification belongs in
  `db:smoke`.
- Raw SQL in tests and fixtures uses `?` placeholders; `@happyvertical/sql`
  normalizes them for Postgres.
- Never put real secrets in tests or fixtures; the dev-auth fallback and seed
  data cover authenticated paths locally.
- Before shipping: narrow checks for what you touched, then the full
  `pnpm check`. CI runs `check`, `mobile-android`, `mobile-ios`, and
  `runtime` on every PR.
