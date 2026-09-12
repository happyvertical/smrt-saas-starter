# Changelog

## Unreleased

### Changed

- Advance the SMRT and SDK families together to SMRT **0.49.2**, the coordinated
  HappyVertical SDK family at **0.89.8**, and independently versioned
  `@happyvertical/ocr` at **0.61.6**. The published SQL artifact no longer needs
  the starter's DuckDB SSR externalization, so the consumer workaround is removed.
- Pin pnpm to **11.13.1** because the previously pinned 11.13.0 release cannot
  run its published executable.

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
