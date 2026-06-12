# Testing Strategy

The starter validates in layers. Narrow layers run constantly during
development; the full gate runs before every push (`pnpm check`, enforced by
the pre-push hook and CI). Layers that need heavy local toolchains or a
running browser stay out of `pnpm check` and are listed with their own
triggers below.

## Layers

| Layer | Tool | Command | In `pnpm check` |
| --- | --- | --- | --- |
| Static gates | biome, svelte-check/tsc | `pnpm format:check && pnpm lint && pnpm typecheck` | yes |
| Unit + route tests | vitest per workspace | `pnpm test` | yes |
| Script tests | node:test | `node --test scripts/__tests__/*.test.mjs` (part of `pnpm test`) | yes |
| DB smoke | real Postgres | `pnpm db:smoke` | yes |
| Scaffold/config guards | custom scripts | `pnpm deps:check`, `workflows:check`, `manifests:check`, `sops:check`, `validate` | yes |
| Mobile contract | generator + node:test | `pnpm mobile:generate && pnpm mobile:validate` | shell test via `pnpm test` |
| Browser e2e (local) | Playwright | `pnpm --filter @happyvertical/smrt-saas-web test:e2e` | no (CI `e2e` job on PRs) |
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
- **UI flows (login, signup, tenant switch, billing pages)** — run the
  Playwright smoke: `pnpm --filter @happyvertical/smrt-saas-web test:e2e`.
  Its `webServer` config boots the dev server on 5173 automatically (reuses a
  running one outside CI); it needs seeded Postgres and
  `npx playwright install chromium` once. Extend `apps/web/e2e/` when adding
  user-visible flows. The CI `e2e` job runs this suite on every PR.
- **Dockerfiles, runtime trees, manifests, deploy scripts** —
  `pnpm runtime:check` (build → prepare runtime trees → build images → smoke
  them → render manifests). Needs Docker and `kubectl`.

## E2E: one suite, two targets

The Playwright suite has two run modes, switched by `PLAYWRIGHT_BASE_URL`:

- **Local (default)** — boots the dev server and runs every spec, including
  flows that ride the non-production dev-auth fallback. This is the PR gate.
- **Deployed (`PLAYWRIGHT_BASE_URL` set)** — runs only specs tagged `@public`
  against the given environment. Deployed environments have real auth, so
  `@public` specs must stay unauthenticated, read-only, and free of seed-data
  assumptions (landing page, login form, `/api/health`).

The staging deploy pipeline uses the deployed mode as a promotion gate: it
bakes the commit SHA into the web image (`APP_VERSION`), waits for
`/api/health` on `STAGING_BASE_URL` to report that SHA
(`scripts/wait-for-deploy.mjs`, so the smoke never races the GitOps rollout),
runs the `@public` suite, and only then opens the staging→main promotion PR.
Set the `STAGING_BASE_URL` variable on the `staging` GitHub environment to
enable the gate; when unset it is skipped so fresh starter clones still
deploy.

Authenticated staging e2e is a deliberate follow-up: it needs a test-auth
story (dedicated e2e tenant plus a real OIDC test account or controlled
magic-link path) — do not enable the dev-auth fallback or inline sign-in
links on deployed environments to make tests pass.

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
