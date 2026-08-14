# Hosted CI

Starter pull requests run on GitHub-hosted `ubuntu-latest` runners. The shared
setup action installs Node `24.18.0`, then lets Corepack activate the single
pnpm pin from `package.json#packageManager`. Do not copy the pnpm version into
a workflow.

The `check` job installs the workspace once and reports format, lint,
typecheck, tests, and build as separate steps. An isolated PostgreSQL smoke
job creates its own disposable database. The metadata
job performs workflow, manifest, SOPS, and deployment-scaffold checks without
installing workspace dependencies. Production-image E2E, Android, and runtime
jobs retain their own dependencies because they execute their own environments.
`pnpm check` remains the local aggregate command.

Turbo remote cache is optional: set `TURBO_TEAM` and `TURBO_TOKEN` (and
`TURBO_API` for a self-hosted endpoint). Without the credentials, Turbo uses
its local cold cache, and every validation must pass without a remote hit.

Each run uploads a `ci-metrics-<run>-<attempt>` artifact and writes a workflow
summary with setup seconds, job wall time, pnpm cache status, remote-cache
mode, and the GitHub run attempt. Keep a before/after sample of these artifacts
for the #28 rollout; the attempt number is the retry/noise signal.

## PostgreSQL confidence lane

`pnpm test` remains the fast unit/SQLite-compatible coverage path. The
PostgreSQL-only contract is `pnpm test:postgres`: it creates a database named
with the epoch, run, attempt, suite, and process; exports `DATABASE_URL`,
`TEST_DB_URL`, and normal libpq variables; and force-drops that database in a
`finally` cleanup. Run it locally after `pnpm services:up`; it targets only the
local Docker service by default. If host PostgreSQL client binaries are absent,
the runner executes `createdb`, `dropdb`, and janitor commands inside the local
Compose service. Hosted service and shared CI lanes remain explicit and fail
closed rather than falling back to a developer's Docker daemon.

The `PostgreSQL Confidence` workflow runs the registry on every pull request
and has a daily scheduled confidence run. It disables Turbo task caching and
serializes the registry with a repository-scoped concurrency group. It uploads
one `postgres-ci-metrics-<run>-<attempt>-*` artifact per run with lane type,
result, and wall time. Keep ten representative fallback/shared-run samples to
compare setup cost, wall time, and retry/noise before changing rollout policy.

The default is a GitHub-hosted PostgreSQL service container. To opt into a
shared lane, set the repository variable `CI_POSTGRES_SHARED_ENABLED=true`,
then provide its dedicated `CI_POSTGRES_BASE_URL` secret plus exact
`CI_POSTGRES_EXPECTED_HOST` and `CI_POSTGRES_EXPECTED_USER` variables in the
`ci-postgres` environment. The enablement flag must be a repository variable
because job `if` conditions are evaluated before environment-level variables
are available.
The runner rejects every non-loopback URL unless all three shared-lane guards
match. The dedicated role must have `CREATEDB`/drop authority only on the
non-production CI cluster and must have no network route or credentials for
production. Setting `CI_POSTGRES_SHARED_ENABLED` back to anything other than
`true` immediately restores the service-container fallback without changing
the fast coverage lane. The shared-lane janitor force-drops only
`smrt_ci_*` databases older than six hours after validating that same host/user
allowlist.
