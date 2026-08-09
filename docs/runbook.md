# Runbook

## Local

```sh
pnpm install
pnpm services:up
pnpm db:migrate
pnpm db:profiles:backfill
pnpm db:seed
pnpm db:smoke
pnpm --filter @happyvertical/smrt-saas-web dev
```

`pnpm db:migrate` loads the canonical SMRT runtime package list from
`apps/web/smrt-packages.mjs` before schema generation, so local Postgres is
prepared for the same SMRT surface used by the web app. After schema migration,
the command transactionally backfills SMRT's durable normalized Profile email
keys and then User email keys. The backfills are idempotent and record readiness
markers required by OIDC; run this from one deploy process before starting the
new web replicas.

## Local Services

The starter uses Docker Compose for local dependencies. The initial service is
Postgres and matches the default app connection string:
`postgresql://smrt_saas:localdev@127.0.0.1:5432/smrt_saas`.

```sh
pnpm services:up
pnpm services:ps
pnpm services:logs
pnpm services:down
```

## Local Worker

The worker runs starter maintenance through `@happyvertical/smrt-jobs`.
`WORKER_MODE` controls how it interacts with the queue:

```sh
WORKER_MODE=smrt-once WORKER_JOB=all pnpm --filter @happyvertical/smrt-saas-worker dev
WORKER_MODE=enqueue WORKER_JOB=subscriptions.reconcile pnpm --filter @happyvertical/smrt-saas-worker dev
WORKER_MODE=runner pnpm --filter @happyvertical/smrt-saas-worker dev
WORKER_MODE=direct WORKER_JOB=usage.audit pnpm --filter @happyvertical/smrt-saas-worker dev
```

`smrt-once` is the local default: it enqueues the selected job into
`_smrt_jobs`, starts a `TaskRunner`, waits for those jobs to finish, and exits.
`enqueue` only creates pending `_smrt_jobs` rows. `runner` is the deployment
mode: it runs `TaskRunner` for the `starter-maintenance` and `agents` queues,
starts `ScheduleRunner`, and idempotently ensures global
`_smrt_agent_schedules` rows for subscription reconciliation and usage audits.
`direct` keeps the old in-process path available for focused debugging.

`WORKER_JOB` accepts `all`, `subscriptions.reconcile`, and `usage.audit`.
`WORKER_JOB_LIMIT` limits batch size. The default deployment config sets
`WORKER_MODE=runner`, `WORKER_RUN_SCHEDULER=true`, and
`WORKER_ENSURE_MAINTENANCE_SCHEDULES=true`. Scheduler-enabled workers always
listen on SMRT's `agents` queue because `ScheduleRunner` emits scheduled jobs
there.

`subscriptions.reconcile` reads Stripe-backed tenant subscriptions from
Postgres and asks `@happyvertical/accounting` for current subscription status.
When `STRIPE_SECRET_KEY` is unset, the job skips reconciliation and reports the
number of local Stripe subscriptions it did not process. `usage.audit` resolves
subscribed tenant entitlements through `@happyvertical/smrt-subscriptions`,
including tenant metrics and AI usage summaries, then logs ok, warning,
blocked, and observed threshold counts.

The recurring starter schedules use `AgentSchedule` because the current SMRT
schedule runner stores cron schedules in `_smrt_agent_schedules`, but the target
object is the starter worker's `StarterMaintenanceJob`. A future upstream SMRT
improvement can rename or generalize that scheduler surface without changing the
queued job methods in this app.

## Validation

```sh
pnpm deps:check
pnpm workflows:check
pnpm manifests:check
pnpm manifests:render
pnpm sops:check
pnpm validate
pnpm check
pnpm runtime:check
```

`pnpm db:seed` idempotently creates the demo tenant, Profile-backed owner identity,
subscription plans, active Growth subscription, starter app settings, usage
metrics, and demo prompt/language overrides.
`pnpm check` runs the Postgres migration, seed, and smoke path. Start local
services first with `pnpm services:up`; CI workflows provide an isolated
Postgres service.

`pnpm runtime:check` runs `pnpm build`, creates `.runtime/web` and
`.runtime/worker` with `pnpm deploy --prod --legacy`, builds local Docker
images, smoke-tests web and worker startup imports, and renders every kustomize
overlay with `kubectl kustomize`.

## Field-policy walkthrough

Use an owner or admin identity to manage organization policy and a member or
viewer identity to verify personal policy behavior.

1. As the owner, open any `/app` page, open the AdminShell **Tools** region,
   select **Field settings**, then **Configure application settings**. Use the
   Organization tab to set a default, move the field between Basic and
   Advanced, and lock the organization policy. Save each change.
2. As the member, use the same **Field settings** focus tool. The Organization
   tab and control-panel navigation are unavailable; **Just me** remains
   available only for fields the organization has not locked.
3. As the owner, unlock the field. As the member, set a personal label or help
   message and save it, then reopen the form to verify the override persists.
4. Use **Reset to inherited** as the member to return to the organization
   policy. Then use it as the owner to return the organization layer to the app
   definition.
5. As the owner, open **Field settings** from the AdminShell navigation and
   verify the control panel reports the organization customization and personal
   override count without exposing another user's values.

The `/app/admin` signup-access form is intentionally restricted to separately
configured application super users. A super user can use that ObjectForm to
visually verify the resulting Basic/Advanced placement, label, help, default,
and lock behavior; tenant owner/admin status alone does not grant this route.

Field policies are sparse overrides. A reset deletes only the selected layer;
the form immediately inherits the next app, organization, or personal value
instead of writing a copied default.

## Local Auth

The web app uses `smrt-users` sessions when a `sid` cookie is present. In
non-production environments, requests without a session fall back to the seeded
demo owner so the reference app remains explorable after `pnpm db:seed`.

Set `SMRT_STARTER_DEV_AUTH=false` to disable that fallback and require a real
session identity locally. Tenant switching writes the
`smrt_starter_tenant_id` cookie and updates the SMRT session tenant when a
session exists.

Every starter login/account path requires a canonical `smrt-profiles` identity.
Signup, member invites, access-request graduation, magic-link/mobile login,
bearer/session requests, E2E auth, and the dev fallback use the starter
reconciler. Upstream OIDC provisioning creates the same identity. Before
deploying 0.1.1 over an existing database, stop or upgrade old Profile/User
writers and check for duplicate ownership links before migration:

```sql
SELECT profile_id, COUNT(*) AS user_count
FROM users
WHERE profile_id IS NOT NULL
GROUP BY profile_id
HAVING COUNT(*) > 1;
```

Reconcile every result and normalize legacy empty-string placeholders to
`NULL`; the 0.39.15 schema adds a unique constraint for non-null Profile
ownership. Also reconcile duplicate normalized User emails: the User email-key
backfill fails transactionally without changing rows while they remain.

Then run the controlled, idempotent `pnpm db:profiles:backfill` command from one
deploy process before starting web replicas or enabling OIDC. It runs the
schema/email-key migration first, then reconciles the complete active-User set
in one transaction. The operator-owned backfill may reuse exactly one unowned
global Person matching a User email and creates one with a stable User-specific
slug when absent. Any non-Person, tenant-scoped, already-owned, email-mismatched,
or ambiguous match rolls back the whole starter Profile backfill. Repair the
conflicts explicitly and rerun the command. Do not trigger a whole-user repair
from a public auth request.

A backfilled local User already owns its Person. SMRT 0.39.15 therefore does
not implicitly attach a new OIDC issuer/subject to that Person by email, even
when `email_verified: true`; the secure default rejects the first cross-provider
attempt as `profile_owned`. Existing exact issuer/subject links remain
idempotent. Before enabling a new provider for legacy accounts, create an
explicit administrator-owned identity mapping or implement a separately
verified account-link flow. An explicitly false `email_verified` claim is
rejected; provider integrations remain responsible for a trusted token/claim
boundary when the claim is absent.

Tenant authorization returns `membership.profileId`. Load that global Person
through `ProfileCollection`, then pass the loaded `profile` object to
`AuditLogCollection.record({ profile, ... })` inside the tenant context.
`membership.userId` remains the account/membership key and is not a valid
substitute for a Profile UUID. `pnpm db:smoke` proves both a reconciled legacy
User and the seeded demo owner can write a canonical tenant-scoped AuditLog with
this mapping.

The 0.1.0 starter keyed every agent-chat session to the shared demo User UUID.
Version 0.1.1 starts a separate session under each caller's Person UUID. That
old shared history cannot be assigned to individual users safely: export it if
retention is required, then archive or delete the affected `agent_sessions` and
rooms through the supported chat service before cutover. Do not bulk rewrite
`participant_profile_id`; new sessions are created automatically on first use.

`/signup` creates a tenant, owner user, owner membership, and active Starter
subscription, then starts a SMRT session for that owner. `/login` uses
`MagicLinkService` from `smrt-users`; local development shows the generated
single-use link inline when `SMRT_STARTER_AUTH_INLINE_LINKS` is not `false`.
Production does not expose inline links and should use HappyVertical IDP or a
configured email delivery adapter before enabling magic-link login. `/logout`
destroys the SMRT session and clears the local tenant switch cookie.

Mobile clients use the same `smrt-users` session store with bearer tokens.
`/api/mobile/auth/providers` lists configured `@happyvertical/auth` providers,
`/api/mobile/auth/start` creates the OAuth/OIDC authorization URL, and
`/api/mobile/auth/complete` exchanges the authorization code for a SMRT session
id returned as `tokenType: "Bearer"`. Send that token as
`Authorization: Bearer <token>` to `/api/mobile/session` and tenant API routes.
The default provider is HappyVertical IDP through `MOBILE_OIDC_CLIENT_ID` /
`MOBILE_OIDC_CLIENT_SECRET` with `MOBILE_AUTH_HAPPYVERTICAL_TYPE=kanidm`; add
Google, GitHub, Keycloak, Cognito, or other SDK OAuth/OIDC providers with
`MOBILE_AUTH_PROVIDERS_JSON`.

Super users are configured with `SMRT_STARTER_SUPERUSER_EMAILS`. In
non-production, the seeded demo owner is also treated as a super user when the
dev auth fallback is enabled. `/app/admin` lets super users switch signup
between public and invite-only mode and create tenant-owner invitation links.
Invitation tokens are stored only as hashes; the plain link is shown when the
invite is created and should be delivered by email once a transactional mail
adapter is added.

The settings page includes a starter invite flow for tenant admins. It creates
or reactivates an active membership immediately, which is useful for the
reference app but should be replaced with email acceptance if a downstream
product needs invitation approval semantics.

The seeded demo subscription does not include a Stripe customer id. The billing
portal action appears only after checkout/webhook handling stores a real Stripe
customer for the tenant.

For local Stripe testing, set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and
the plan price ids such as `STRIPE_PRICE_GROWTH`. Forward Stripe webhook events
to `/api/billing/webhook`; `checkout.session.completed` and
`customer.subscription.*` events update `_smrt_tenant_subscriptions`
idempotently.

## Branch Flow

1. Feature branches target `dev`.
2. Pull requests run `pnpm check`, native mobile shell validation, local Docker
   image smoke checks, and manifest rendering.
3. `dev` builds and pushes web/worker images, writes dev image digests to the
   dev overlay, and leaves the overlay ready for the dev GitOps controller.
4. `promote-dev.yml` opens a `dev -> staging` PR after rendering manifests.
5. `staging` builds and pushes staging images, writes staging image digests,
   leaves staging manifests GitOps-ready, and opens a `staging -> main` PR.
6. `main` builds and pushes production images, writes production image digests,
   leaves production manifests GitOps-ready, and opens a `main -> dev` sync PR.

The committed overlay digests start as bootstrap placeholders. The first deploy
for each branch replaces them with the immutable digest returned by GHCR.

## Deployment Secrets

Before applying manifests, replace placeholder values in
`manifests/base/app.secret.yaml` with real values and encrypt them with SOPS.
Do not commit decrypted secret values. Use Warden for human-readable source
secrets and SOPS only for encrypted deploy material.
