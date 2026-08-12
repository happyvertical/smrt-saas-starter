# Continuous integration architecture

The starter separates fast hosted checks from build, database, browser, mobile,
and container work. `pnpm check` remains the convenient local aggregate, while
CI exposes each validation family as a named job or step and finishes with one
stable `Required CI` status.

## Toolchain and setup

Node `24.18.0` and pnpm `11.11.0` are the tested baseline. The shared setup
action reads pnpm from `package.json#packageManager`; do not duplicate that pin
in workflows. Metadata, workflow, manifest, SOPS, template, format, lint, and
result-only jobs run on GitHub-hosted runners without a workspace install.

Use `ubuntu-latest` for static or short portable work. Use
`arc-happyvertical-node` for trusted Node workloads that benefit from the
node-local pnpm store and shared PostgreSQL client. Use `arc-happyvertical`
only for Docker, Android, kubectl, or other compatibility tooling. Fork code
never runs on a HappyVertical runner.

The internal Turbo service is optional. Configure `TURBO_API`, `TURBO_TEAM`,
and `TURBO_TOKEN` to use it. Turbo cache errors must degrade to a cold build;
validation never depends on a cache hit and no `.turbo` Actions cache archive
is transferred between jobs.

## Pull requests and merge groups

Pull requests use affected path and Turbo dependency-closure selection when
`CI_MERGE_QUEUE_ENABLED=true`. Until then they run the historical full suite so
existing required statuses remain trustworthy during observation. Merge groups
always run the complete static, build, typecheck, SQLite, PostgreSQL, E2E,
mobile, manifest, template, runtime, and deployment-candidate suite.

Superseded pull-request runs are cancelled. Merge-group runs are not. The
`Required CI` aggregator uses `if: always()` and rejects failed, cancelled, or
unexpectedly skipped jobs.

To install the required check in a generated repository:

1. Merge the workflow with existing required checks unchanged.
2. Observe ten successful representative `Required CI` pull-request runs.
3. Enable `CI_NODE_RUNNER_ENABLED`, then `CI_POSTGRES_ENABLED`, observing ten
   successful runs after each change.
4. Enable `CI_MERGE_QUEUE_ENABLED` and observe one queued merge and deployment.
5. Change the ruleset to require only `Required CI`.

Rollback by clearing those three variables, disabling the merge queue, and
restoring the previous required-status list. This restores exhaustive PR
validation without changing the local command or SQLite coverage.

## Generated context

`pnpm ci:context:prepare` builds once, generates the mobile contract, and writes
`.ci/generated-context/provenance.json`. It hashes the source/config inputs and
all reusable `.smrt`, route, contract, and build outputs. Consumer jobs download
that artifact and run `pnpm ci:context:verify` before using it. A hash mismatch
fails closed instead of mixing generated files from another source tree.

## PostgreSQL isolation

SQLite remains the fast portability default (`pnpm test:sqlite`). The registered
PostgreSQL command (`pnpm test:postgres`) creates a database named with the CI
epoch, run, attempt, suite, and process; exports `DATABASE_URL`, SMRT test URL,
and standard libpq `PG*` variables; then force-drops the database in `finally`.
The scheduled janitor removes abandoned `smrt_ci_*` databases older than six
hours.

The shared credential exposed through `/var/run/ci-services/postgres/url` must
be a CI-only role with no production network route or credentials. Set
`CI_POSTGRES_ENABLED=true` only after that role and mount are verified. When it
is unset, workflows use an ephemeral PostgreSQL service container; SQLite jobs
are unchanged. PostgreSQL work is uncached and the registry concurrency is
limited. Configure `CI_POSTGRES_EXPECTED_HOST` and
`CI_POSTGRES_EXPECTED_USER` before enabling the scheduled janitor; cleanup
fails closed unless the mounted URL matches both values. Fork pull requests
always use the ephemeral hosted-runner fallback and never receive the mounted
shared credential.

## Deployment artifacts

Image-affecting validation builds web and worker candidates once, smokes the
exact pushed digests, and uploads a schema-versioned manifest containing the PR
source commit, tested workflow commit and Git tree, image, platforms, digest,
and verification result. Deployment checks out the exact triggering commit and
locates exactly one successful candidate whose tested tree matches it. This
allows a conventional merge commit to promote a PR candidate only when the
resulting source tree is identical, while rejecting stale, ambiguous, or
unverified manifests. Promotion retags the immutable digests and updates the
environment overlay without rebuilding or repeating `pnpm check`.

`Emergency Recovery Build` is explicitly gated by the `EMERGENCY_BUILD`
confirmation. Its run ID can be supplied to a manual deployment. Keep this path
for the first two successful candidate promotions, then remove it or retain it
only under an audited emergency environment approval.

Record ten successful before/after runs for setup time, wall time, cache hit or
cold-build behavior, retries, and failures. Stop rollout if setup p95 exceeds
45 seconds, a required status disappears, or retry/failure rates increase. The
target is setup p50 below 30 seconds and at least 30% less repeated setup/build
work.
