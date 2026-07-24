# Changelog

## Unreleased

### Changed

- Advance the whole SMRT family to **0.40.20** and the HappyVertical SDK family
  to **0.84.0**, moving `smrt-svelte`/`smrt-ui` off the legacy `0.37.5` shell that
  the 0.1.1 identity patch held back so the starter tracks the current coordinated
  release.
- Migrate the tenant workspace from the first-generation `RoleShell` (removed from
  `@happyvertical/smrt-svelte/workspace` in 0.40) to the `AdminShell` four-edge
  shell + `TenantNav` in `apps/web/src/routes/app/+layout.svelte`; the nav lives in
  the collapsible tenant edge and the tenant switcher/sign-out move to
  `tenantFooter`. The AssistantDock keeps the `ToolsDock` API by importing it from
  the compatibility subpath `@happyvertical/smrt-svelte/workspace/legacy`.
- Externalize `@duckdb/*` in `apps/web/vite.config.ts` so the SSR build no longer
  tries to bundle the optional (Postgres-unused) DuckDB native adapter that
  `@happyvertical/sql@0.84` now reaches through a statically-analyzable dynamic
  import. See `docs/upstream-work.md`.

## 0.1.1 - 2026-07-14

### Fixed

- Bootstrap the starter SMRT package configuration before production auth
  handlers resolve OIDC providers, with process-wide HMR idempotency.
- Provision or bind a global Person profile for every starter account creation
  and login path, including a controlled, idempotent backfill command for
  existing active Users.
- Consume SMRT 0.39.15's owner-aware OIDC provisioning and durable Profile/User
  email keys, including ordered deploy-time backfills and a fail-closed
  Profile-only collision regression.
- Align tenant subscription onboarding, Stripe webhook sync, reconciliation,
  and usage audits with SMRT's polymorphic subscriber identity so fresh-schema
  PostgreSQL writes remain idempotent and external subscribers stay isolated.
- Move the required HappyVertical SDK family to 0.78.1 while retaining
  `smrt-svelte`/`smrt-ui` 0.37.5 so this identity patch does not also migrate the
  application shell. Raise Svelte to ^5.56.4 to satisfy the published SMRT peer
  contract.
- Expose the canonical `profileId` in membership context and use it for chat
  attribution so downstream apps can replace narrow audit workarounds with
  `@happyvertical/smrt-profiles` `AuditLog`.

Agent-chat history created by 0.1.0 used a shared demo User UUID and is not
automatically reassigned. Export and archive/delete those shared sessions before
cutover if retention matters; 0.1.1 creates per-Person sessions.

This coordinated patch closes
[#35](https://github.com/happyvertical/smrt-saas-starter/issues/35) and
[#36](https://github.com/happyvertical/smrt-saas-starter/issues/36).
