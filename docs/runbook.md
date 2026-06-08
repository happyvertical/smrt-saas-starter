# Runbook

## Local

```sh
pnpm install
pnpm services:up
pnpm db:migrate
pnpm db:seed
pnpm db:smoke
pnpm --filter @happyvertical/smrt-saas-web dev
```

`pnpm db:migrate` loads the canonical SMRT runtime package list from
`apps/web/smrt-packages.mjs` before schema generation, so local Postgres is
prepared for the same SMRT surface used by the web app.

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

The worker runs one cycle per process start. Use `WORKER_JOB` to select the
operational slice:

```sh
WORKER_JOB=all pnpm --filter @happyvertical/smrt-saas-worker dev
WORKER_JOB=subscriptions.reconcile pnpm --filter @happyvertical/smrt-saas-worker dev
WORKER_JOB=usage.audit pnpm --filter @happyvertical/smrt-saas-worker dev
```

`subscriptions.reconcile` reads Stripe-backed tenant subscriptions from
Postgres and asks `@happyvertical/accounting` for current subscription status.
When `STRIPE_SECRET_KEY` is unset, the job skips reconciliation and reports the
number of local Stripe subscriptions it did not process. `usage.audit` resolves
subscribed tenant entitlements through `@happyvertical/smrt-subscriptions`,
including tenant metrics and AI usage summaries, then logs ok, warning,
blocked, and observed threshold counts.

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

`pnpm db:seed` idempotently creates the demo tenant, owner membership,
subscription plans, active Growth subscription, starter app settings, usage
metrics, and demo prompt/language overrides.
`pnpm check` runs the Postgres migration, seed, and smoke path. Start local
services first with `pnpm services:up`; CI workflows provide an isolated
Postgres service.

`pnpm runtime:check` runs `pnpm build`, creates `.runtime/web` and
`.runtime/worker` with `pnpm deploy --prod --legacy`, builds local Docker
images, smoke-tests web and worker startup imports, and renders every kustomize
overlay with `kubectl kustomize`.

## Local Auth

The web app uses `smrt-users` sessions when a `sid` cookie is present. In
non-production environments, requests without a session fall back to the seeded
demo owner so the reference app remains explorable after `pnpm db:seed`.

Set `SMRT_STARTER_DEV_AUTH=false` to disable that fallback and require a real
session identity locally. Tenant switching writes the
`smrt_starter_tenant_id` cookie and updates the SMRT session tenant when a
session exists.

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
