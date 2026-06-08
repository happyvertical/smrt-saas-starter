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

## Validation

```sh
pnpm deps:check
pnpm workflows:check
pnpm manifests:check
pnpm sops:check
pnpm validate
pnpm check
```

`pnpm db:seed` idempotently creates the demo tenant, owner membership,
subscription plans, active Growth subscription, starter usage metrics, and
demo prompt/language overrides.
`pnpm check` runs the Postgres migration, seed, and smoke path. Start local
services first with `pnpm services:up`; CI workflows provide an isolated
Postgres service.

## Local Auth

The web app uses `smrt-users` sessions when a `sid` cookie is present. In
non-production environments, requests without a session fall back to the seeded
demo owner so the reference app remains explorable after `pnpm db:seed`.

Set `SMRT_STARTER_DEV_AUTH=false` to disable that fallback and require a real
session identity locally. Tenant switching writes the
`smrt_starter_tenant_id` cookie and updates the SMRT session tenant when a
session exists.

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
2. `dev` deploys to the dev environment.
3. `promote-dev.yml` opens a `dev -> staging` PR.
4. `staging` deploys to staging and opens a `staging -> main` PR.
5. `main` deploys production and opens a `main -> dev` sync PR.

## Deployment Secrets

Before applying manifests, replace placeholder values in `manifests/base/app.secret.yaml` with real values and encrypt them with SOPS.
