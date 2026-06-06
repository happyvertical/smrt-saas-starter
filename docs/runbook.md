# Runbook

## Local

```sh
pnpm install
pnpm --filter @happyvertical/smrt-saas-web dev
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

## Branch Flow

1. Feature branches target `dev`.
2. `dev` deploys to the dev environment.
3. `promote-dev.yml` opens a `dev -> staging` PR.
4. `staging` deploys to staging and opens a `staging -> main` PR.
5. `main` deploys production and opens a `main -> dev` sync PR.

## Deployment Secrets

Before applying manifests, replace placeholder values in `manifests/base/app.secret.yaml` with real values and encrypt them with SOPS.
