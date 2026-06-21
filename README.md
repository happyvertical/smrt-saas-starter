# SMRT SaaS Starter

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A production-shaped starter for building a **multi-tenant SaaS** with the SMRT
framework: tenants, authentication, Stripe subscriptions, usage metering,
background jobs, an AI/MCP surface, a Kotlin Multiplatform mobile shell, and
Kubernetes deployment — wired together and ready to fork.

> **What is SMRT?** SMRT is HappyVertical's TypeScript framework for building
> applications from declarative domain objects ("SMRT objects"). You define an
> object's fields and behavior once, and SMRT generates its database
> persistence plus **REST, CLI, and MCP** (Model Context Protocol) interfaces —
> so the same domain model is usable by people, scripts, and AI agents. This
> repo is a reference app built on top of SMRT and the HappyVertical SDK.

## Who this is for

- **Teams starting a multi-tenant SaaS** who want a worked example instead of a
  blank page — tenancy, billing, and auth already integrated.
- **Developers evaluating the SMRT ecosystem** who want a running demo of SMRT
  objects, generated interfaces, subscriptions, and agentic/MCP development.

## Features

- **Multi-tenancy** — tenant isolation via `smrt-users` memberships; tenant
  resolution by subdomain, switch cookie, or (opt-in) trusted header. Selecting
  a tenant never grants access on its own — every handler authorizes explicitly.
- **Authentication** — OIDC through `@happyvertical/auth` (HappyVertical IDP /
  Kanidm), plus a local dev-auth fallback so you can sign in immediately.
- **Subscriptions & billing** — Stripe-backed checkout, customer portal, and
  webhook sync via `@happyvertical/accounting`; plans, features, and thresholds
  via `@happyvertical/smrt-subscriptions`.
- **Usage metering** — tenant-aware usage metrics with threshold windows and a
  worker that audits usage against plan entitlements.
- **Background jobs** — a SMRT `TaskRunner` / `ScheduleRunner` worker for
  subscription reconciliation and scheduled maintenance.
- **AI & MCP** — a right-dock chat experience and runtime MCP routes generated
  from your SMRT objects.
- **Mobile** — a Kotlin Multiplatform shared shell with Android and iOS clients,
  driven by a generated contract.
- **Deployment** — Kubernetes manifests (base + dev/staging/production overlays)
  with digest-pinned images and SOPS-managed secrets.

## Tech stack

SvelteKit (Svelte 5, adapter-node) · SMRT objects & `smrt-svelte` · Stripe ·
PostgreSQL 18 · pnpm workspaces + Turborepo · Kotlin Multiplatform · Kubernetes
+ Kustomize · Biome · Playwright · Vitest.

## Prerequisites

- **Node.js ≥ 24** and **pnpm ≥ 10** (`packageManager` is pinned in `package.json`)
- **Docker** (for the local Postgres service)

## Installing the `@happyvertical/*` packages

The starter depends on `@happyvertical/*` packages (SMRT and SDK). They're published to
**public npm**, so there's nothing special to do — a plain install resolves everything
with **no token or registry setup**:

```sh
pnpm install
```

## Quick start

```sh
# 1. Install (from public npm — no token needed)
pnpm install

# 2. Configure
cp .env.example .env            # sensible local defaults; edit as needed

# 3. Database (local Docker Compose Postgres)
pnpm services:up                # start the Postgres container
pnpm db:migrate
pnpm db:seed                    # demo tenant, plans, an active subscription, sample usage

# 4. Run the web app
pnpm --filter @happyvertical/smrt-saas-web dev
```

The app serves at **http://localhost:5173** and uses local Postgres at
`postgresql://smrt_saas:localdev@127.0.0.1:5432/smrt_saas`.

`.env.example` ships with `SMRT_STARTER_DEV_AUTH=true`, so locally you can sign
in as the seeded demo **Owner** without configuring an external identity
provider. Turn it off (and configure OIDC) for anything deployed.

To stop the database: `pnpm services:down`.

## Configuration

All configuration is environment-based. `.env.example` is the documented
reference — every variable has an inline comment explaining what it does and its
default. Key groups:

- **Database** — `DATABASE_URL` and the `POSTGRES_*` service settings.
- **Identity** — `HAPPYVERTICAL_IDP_ISSUER`, `OIDC_CLIENT_ID/SECRET`, and the
  `MOBILE_*` auth settings.
- **Local auth shortcuts** — `SMRT_STARTER_DEV_AUTH`,
  `SMRT_STARTER_AUTH_INLINE_LINKS` (non-production only).
- **Billing** — `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and the
  `STRIPE_PRICE_*` plan price IDs.
- **Tenancy** — `SMRT_STARTER_TRUST_TENANT_HEADER` (default off; enable only
  behind a trusted proxy).

Never commit a real `.env`. Committed deploy secrets use SOPS; runtime tenant
secrets use the SDK/SMRT secret stores.

## Repository layout

| Path | Purpose |
| --- | --- |
| `apps/web` | SvelteKit app: public site, admin UI, billing UI, auth, MCP routes |
| `apps/worker` | SMRT queued/scheduled jobs (subscription reconciliation, usage audits) |
| `apps/mobile` | Kotlin Multiplatform shared shell plus Android/iOS clients |
| `packages/app-objects` | Starter SMRT objects and pure subscription/usage services |
| `packages/app-ui` | Generic SaaS UI components built on SMRT Svelte primitives |
| `packages/mobile-contract` | Generated contract source for mobile clients |
| `manifests` | Kubernetes base and environment overlays |
| `docs` | Architecture, testing, operations, subscriptions, agent setup |

## Testing

Run the full repository check before opening a PR:

```sh
pnpm check          # lint, typecheck, tests, build, db smoke, manifests, secrets
```

Targeted checks:

```sh
pnpm objects:test                                     # SMRT objects / packages
pnpm typecheck
pnpm --filter @happyvertical/smrt-saas-web test:e2e   # Playwright
pnpm mobile:validate                                  # mobile contract
```

The full testing strategy — layers, tools, and when to run what — is in
[docs/testing.md](docs/testing.md).

## Deployment

Production runtime artifacts (built trees, Docker images, rendered manifests)
are validated by:

```sh
pnpm runtime:check
```

Kubernetes manifests live in `manifests/` (Kustomize base + dev/staging/
production overlays, digest-pinned images, SOPS secrets). Operational procedures
are in [docs/runbook.md](docs/runbook.md).

## Documentation

| Doc | Contents |
| --- | --- |
| [docs/architecture.md](docs/architecture.md) | System design, tenancy, request flow |
| [docs/subscriptions.md](docs/subscriptions.md) | Plans, entitlements, metering, Stripe |
| [docs/testing.md](docs/testing.md) | Testing layers and how to run them |
| [docs/runbook.md](docs/runbook.md) | Deployment and operations |
| [docs/agentic-development.md](docs/agentic-development.md) | Building with SMRT + AI agents |
| [docs/upstream-work.md](docs/upstream-work.md) | Upstream coordination and open blockers |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, conventions, validation, and
the upstream-coordination rule. Please also read our
[Code of Conduct](CODE_OF_CONDUCT.md). For security issues, follow
[SECURITY.md](SECURITY.md) — do not open a public issue.

## Project status

This is also the **canonical HappyVertical reference monorepo** and a proving
ground for the SMRT ecosystem: reusable behavior discovered here is upstreamed
into SMRT or the SDK rather than kept local. Progress and open upstream blockers
are tracked in [docs/upstream-work.md](docs/upstream-work.md).

## License

[MIT](LICENSE) © HappyVertical
