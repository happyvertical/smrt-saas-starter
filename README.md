# SMRT SaaS Starter

Canonical HappyVertical reference app for a multi-tenant SaaS built on SMRT.

This repo is intended to be used as:

- a jump-off point for future HappyVertical SaaS projects
- a reference app tested against the SMRT upstream pipeline
- a demo site for SMRT packages, SDK packages, agentic development, subscriptions, tenant metrics, prompt management, and language overrides

## Stack

- SvelteKit web app with SMRT tenant/session hooks
- SMRT objects for tenants, subscription plans, thresholds, usage, prompts, and demo modules
- `smrt-svelte` workspace shell and tools dock
- right-dock chat through `smrt-chat` and runtime MCP routes
- Stripe-backed subscription seams through SDK `@happyvertical/accounting`
- KMP mobile shell following the Amaru strategy
- Kubernetes manifests with dev, staging, and production overlays
- SOPS-managed deploy secrets

## Local Setup

```sh
token="$(gh auth token)"
GH_PACKAGES_TOKEN="$token" GITHUB_PACKAGES_TOKEN="$token" NODE_AUTH_TOKEN="$token" pnpm install
cp .env.example .env
pnpm services:up
pnpm db:migrate
pnpm db:smoke
pnpm check
pnpm --filter @happyvertical/smrt-saas-web dev
```

The web app defaults to `http://localhost:5173` and uses local Postgres at
`postgresql://smrt_saas:localdev@127.0.0.1:5432/smrt_saas`.
The local service stack starts with a Docker Compose Postgres service named
`postgres`; later dependencies should be added to the same compose file and
made available through the `services:*` scripts.
`pnpm check` includes `pnpm db:smoke`, so keep Postgres running before local
full-repo validation.

## Repository Shape

| Path | Purpose |
| --- | --- |
| `apps/web` | SvelteKit app, public site, admin UI, billing UI, MCP routes |
| `apps/worker` | Background jobs for usage rollups and subscription reconciliation |
| `apps/mobile` | Kotlin Multiplatform shared shell plus Android/iOS clients |
| `packages/app-objects` | Starter SMRT objects and pure subscription/usage services |
| `packages/app-ui` | Generic SaaS UI components built on SMRT Svelte primitives |
| `packages/mobile-contract` | Generated contract source for mobile clients |
| `manifests` | Kubernetes base and environment overlays |
| `docs` | Architecture, upstream work, operations, and agent setup |

## Upstream Rubicon

Anything generic enough to improve SMRT or SDK must be moved upstream from an isolated worktree before the first release:

- SDK Stripe billing support in `@happyvertical/accounting`
- SMRT tenant-aware metering
- SMRT subscriptions/entitlements package
- reusable SMRT Svelte dock/chat helpers
