# Architecture

`smrt-saas-starter` is a separate reference monorepo. It is intentionally heavier than a package template because it demonstrates deploy manifests, CI promotion, a public site, a web app, a worker, and mobile clients.

## Runtime

- `apps/web`: SvelteKit app with SMRT tenant/session hooks.
- `apps/worker`: SMRT `TaskRunner` and `ScheduleRunner` runtime for subscription reconciliation and usage threshold audits.
- `apps/mobile`: KMP shared code with Android and iOS shells.
- Postgres is the runtime database. SQLite is reserved for isolated package tests.
- `.runtime/web` and `.runtime/worker` are generated production trees from
  `pnpm deploy --prod --legacy`. Dockerfiles copy only those generated trees,
  so CI proves the same artifacts that are pushed to GHCR.

## Tenancy And Access

Tenant context is resolved from the local `smrt_starter_tenant_id` switch
cookie (set only after the tenant switch endpoint verifies membership) or a
tenant subdomain. The app then resolves active `smrt-users` membership rows and
maps the member role to starter permissions for app, billing, usage, settings,
chat, and MCP routes. Selecting a tenant never grants access on its own —
`requirePermission`/`requireTenantMembership` re-verify the authenticated
user's membership for the resolved tenant on every data path.
Mobile requests can also send `Authorization: Bearer <smrt session id>`; the
hook resolves that session before the same membership resolver runs.

The `x-tenant-id` request header is unauthenticated client input, so it sets
the ambient tenant context before any session/membership check. It is ignored
by default and only honored when `SMRT_STARTER_TRUST_TENANT_HEADER=true` — set
this only behind an authenticating gateway/BFF that injects the header after
its own auth.

Mobile auth redirect URIs are scheme-restricted (https, native loopback http,
or private-use app schemes; `javascript:`/`data:`/`file:` and similar are
rejected) and, when `MOBILE_AUTH_ALLOWED_REDIRECT_URIS` (global) or a provider's
`allowedRedirectUris` is configured, must match the registered allow list.

The non-production demo-owner fallback is intentionally local developer
scaffolding. Production requests require a real SMRT session identity and an
active membership for the selected tenant.

The server loads `apps/web/smrt.config.mjs` through the lightweight
`starter-config.ts` module before constructing any tenancy, session, or OIDC
request handler. A process-global bootstrap marker keeps this eager registration
idempotent across Vite HMR module re-evaluation. Prompt/language definition
registration remains separate in `experience.ts`. The OIDC callback delegates
Profile selection, system context, and transaction ownership to the secure
`smrt-users` provisioning boundary, so a tenant cookie or subdomain cannot scope
canonical identity provisioning.

Starter account creation and login paths reconcile each active `smrt-users` User
to a global `smrt-profiles` Person. New signup, member invitation, access-request
graduation, verified magic-link/mobile login, E2E auth, normal session, and
dev-fallback paths all cross this reconciler. Merely issuing a magic link does
not mutate Profile ownership. Upstream OIDC provisioning creates the same
Person-backed identity. Legacy rows are repaired by the explicit
`pnpm db:profiles:backfill` deployment command rather than an unbounded public
request hook.
Reconciliation locks the User row, uses SMRT's canonical Person lookup and
email-reservation boundary, and creates one Person with a User-specific slug
when absent. Only a verified email boundary or the explicit operator backfill
may adopt an existing unowned Person by email; ordinary signup, invitation, and
graduation fail closed instead. Incompatible, owned, or ambiguous matches are
always rejected.
Schema migration first populates SMRT's durable normalized Profile/User email
keys and readiness markers; all starter raw identity writers populate those
keys after cutover.
Membership lookup also rejects invalid, email-mismatched, competing, or
multiply owned Profile links before
exposing `profileId`, which is the actor id for canonical `AuditLog` and chat
surfaces; a User id must never be substituted for it.

Signup creates the tenant, owner user, owner membership, and Starter
subscription in one transaction-backed onboarding service. A starter app
setting controls whether signup is public or invite-only. Super users, resolved
from `SMRT_STARTER_SUPERUSER_EMAILS` plus the local demo-owner fallback, manage
that setting and create tenant-owner invitations from `/app/admin`.

Tenant-owner invitation records live in `packages/app-objects` as
starter-local SMRT objects. They store hashed tokens, purpose, target email,
expiry, status, and use counts. `/invite/[token]` redirects to signup with the
token, and signup redeems the invite after the tenant owner account is created.
Tenant-member management lives on the settings page and grants active
memberships through starter roles; it is deliberately small until SMRT ships a
richer invitation workflow.

Mobile auth is a thin native-client flow over the same identity model:
`@happyvertical/auth` starts and completes OAuth/OIDC with PKCE-capable
providers, the returned email is matched to an existing active `smrt-users`
user, and `SessionService` mints a tenant-bound bearer session. Mobile signup
is intentionally not duplicated; tenant creation and invite-only acceptance
remain in the web onboarding flow.

## SMRT Surface

The starter consumes SMRT packages for tenancy, users, features, prompts, languages, secrets, jobs, chat, runtime MCP, commerce, ledgers, analytics, assets, content, messages, projects, sites, tags, and Svelte UI.

`apps/web/smrt-packages.mjs` is the canonical runtime SMRT package list. Vite uses it for consumer registration, and database migration/smoke scripts use it before resolving schemas so local and CI Postgres include the declared SMRT surface.

Subscriptions and tenant-aware metering come from `@happyvertical/smrt-subscriptions`. `packages/app-objects` stays thin: it re-exports the upstream subscription surface and holds starter-specific glue such as the SDK Stripe billing adapter, starter app settings, and tenant-owner invitation lifecycle.

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

The worker exposes a starter-local `StarterMaintenanceJob` SMRT object as the
queue target. Local one-shot runs enqueue selected maintenance work into
`_smrt_jobs` and execute it with `TaskRunner`. Deployed workers run `TaskRunner`
for `starter-maintenance` plus SMRT's `agents` queue and run `ScheduleRunner`
against idempotently seeded global `AgentSchedule` rows. The scheduler table is
currently agent-named in SMRT, but it can invoke this app maintenance target
without a persisted target row.

The subscription reconciliation job checks persisted Stripe subscription rows
against `@happyvertical/accounting` subscription status summaries. This catches
missed webhooks and keeps local status, billing periods, cancellation flags, and
Stripe customer ids aligned with the provider.

## Usage Metrics

The starter tracks two sources:

- persisted SMRT AI usage from `_smrt_ai_usage`
- tenant-aware generic usage records from SMRT signal metrics, right-dock chat sends, and app MCP calls

`@happyvertical/smrt-subscriptions` provides the tenant usage metric models, rollups, AI usage summaries, and threshold evaluators used by this starter.

The usage audit job checks subscribed tenants through the same
`SubscriptionResolver`. It logs counts for ok, warning, blocked, and observed
thresholds so operations can route those signals into scheduled jobs or external
alerting without duplicating entitlement logic.

## Prompts And Languages

Starter prompt and language defaults live in `apps/web/src/lib/server/starter-data.json`.
`apps/web/src/lib/server/experience.ts` registers those defaults with
`definePrompt()` and `defineLanguageString()`, then resolves effective tenant
values through SMRT prompt and language override tables. The settings page uses
the same service as the runtime MCP `tenant.prompt.preview` tool.
`apps/web/smrt.config.mjs` defines the default prompt AI profile and language
package options. `starter-config.ts` registers that package config eagerly at
server startup, independently of whether a prompt, chat, or MCP route is used.

The seeded demo tenant includes one prompt override and one `fr-CA` language
override so local smoke checks prove the stored tenant override layers, not only
code defaults.
