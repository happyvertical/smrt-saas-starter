# Architecture

`smrt-saas-starter` is a separate reference monorepo. It is intentionally heavier than a package template because it demonstrates deploy manifests, CI promotion, a public site, a web app, a worker, and mobile clients.

## Runtime

- `apps/web`: SvelteKit app with SMRT tenant/session hooks.
- `apps/worker`: scheduled and queued jobs for subscription reconciliation and usage rollups.
- `apps/mobile`: KMP shared code with Android and iOS shells.
- Postgres is the runtime database. SQLite is reserved for isolated package tests.

## SMRT Surface

The starter consumes SMRT packages for tenancy, users, features, prompts, languages, secrets, jobs, chat, runtime MCP, commerce, ledgers, analytics, assets, content, messages, projects, sites, tags, and Svelte UI.

`packages/app-objects` exists because subscriptions and tenant-aware metering are not yet first-class SMRT packages. The code there is deliberately generic and should be upstreamed after the reference app proves the interfaces.

## SDK Surface

SDK packages provide provider and infrastructure adapters beneath the SMRT app surface:

- `@happyvertical/logger` for structured SMRT signal logging.
- `@happyvertical/accounting` for Stripe billing and accounting provider seams.
- `@happyvertical/secrets` for envelope encryption.
- `@happyvertical/jobs`, `cache`, `files`, `ai`, `analytics`, `auth`, `messages`, `projects`, `repos`, `github-actions`, and `translator` for external services and operational glue.

## Subscription Flow

1. Tenant chooses a plan in `/app/billing`.
2. Web creates a Stripe checkout session through the injected billing provider.
3. Stripe webhook updates the tenant subscription.
4. The entitlement resolver maps plan features to `smrt-features` keys.
5. Thresholds compare plan limits to tenant usage summaries.
6. Runtime MCP and UI actions check features and thresholds before execution.

## Usage Metrics

The starter tracks two sources:

- persisted SMRT AI usage from `_smrt_ai_usage`
- tenant-aware generic usage records from SMRT signal metrics and app MCP calls

The current scaffold includes pure usage rollup logic. Production wiring belongs in the upstream SMRT metering work.
