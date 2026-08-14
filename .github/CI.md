# Hosted CI

Starter pull requests run on GitHub-hosted `ubuntu-latest` runners. The shared
setup action installs Node `24.18.0`, then lets Corepack activate the single
pnpm pin from `package.json#packageManager`. Do not copy the pnpm version into
a workflow.

The `check` job installs the workspace once and reports format, lint,
typecheck, tests, build, and PostgreSQL smoke as separate steps. The metadata
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
