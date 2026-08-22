# Contributing

Thanks for your interest in `smrt-saas-starter` — the canonical HappyVertical
reference monorepo for building a multi-tenant SaaS on the SMRT framework.

## Development setup

The `@happyvertical/*` packages (SMRT and SDK) are on public npm, so setup is just:

```sh
pnpm install          # resolves @happyvertical/* from public npm — no token needed

cp .env.example .env
pnpm run services:up      # local Postgres via Docker Compose
pnpm run db:migrate
pnpm run db:seed
pnpm --filter @happyvertical/smrt-saas-web dev
```

Full setup, stack overview, and the repository layout are in the
[README](README.md).

## Making changes

1. **Branch off `dev`.** PRs target `dev`; `staging` and `main` are promotion
   branches.
2. **Match the surrounding code.** Formatting and linting are enforced by
   [Biome](https://biomejs.dev/) via lefthook pre-commit/pre-push hooks. Run
   `pnpm format` and `pnpm lint` before pushing.
3. **Conventional Commits.** Commit messages are validated by commitlint
   (e.g. `feat(web): …`, `fix(worker): …`, `docs: …`, `chore: …`).
4. **Keep secrets out of the repo.** Never commit `.env`, tokens, or decrypted
   secrets. Committed deploy secrets use SOPS; runtime tenant secrets use the
   SDK/SMRT secret stores.

## Validation

Run narrow checks while iterating, then the full repo check before opening a PR:

```sh
pnpm check          # full repo validation (lint, typecheck, tests, db:smoke)
```

Targeted checks:

```sh
pnpm run objects:test   # SMRT objects / package changes
pnpm typecheck
pnpm --filter @happyvertical/smrt-saas-web test:e2e   # Playwright (see docs/testing.md)
pnpm run mobile:validate                                  # mobile contract changes
```

The full testing strategy — layers, tools, and when to run what — is in
[docs/testing.md](docs/testing.md).

## Upstream coordination

This repo does **not** duplicate or patch SMRT/SDK framework behavior locally.
If you hit an upstream bug or a missing public API in a `@happyvertical/*`
package:

1. File an issue on the owning repo — `happyvertical/smrt` for `smrt-*`
   packages, `happyvertical/sdk` for the rest — with the package, version, and a
   minimal repro. No secrets or tokens.
2. Record the blocker (with the issue link) in
   [docs/upstream-work.md](docs/upstream-work.md) and continue with unblocked
   work. Do not vendor, fork, or patch `node_modules`.
3. Consume the fix by bumping the released package version in
   `pnpm-workspace.yaml`.

## Reporting bugs and requesting features

Use the GitHub issue templates. For anything security-sensitive, follow
[SECURITY.md](SECURITY.md) instead of opening a public issue.

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE).
