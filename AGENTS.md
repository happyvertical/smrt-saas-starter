# SMRT SaaS Starter Agent Context

## Project

`smrt-saas-starter` is the canonical HappyVertical reference monorepo for building a multi-tenant SaaS on SMRT. It is also a demo site for the SMRT ecosystem and a proving ground for upstream package improvements.

## Architecture Rules

- Keep reusable domain behavior in `packages/app-objects` until it is stable enough to upstream into SMRT.
- Keep UI that is generic across SaaS projects in `packages/app-ui`; prefer `@happyvertical/smrt-svelte` primitives over custom widgets.
- Do not duplicate SMRT framework behavior locally. If the public API is missing, document the upstream change in `docs/upstream-work.md` and implement it in an isolated SMRT or SDK worktree.
- Use `smrt-users` memberships for tenant access and roles. Use subscription plans for billing, entitlements, features, and thresholds.
- UUID columns stay UUID. Do not fix invalid IDs by changing schema columns to text.
- Use SOPS for committed deploy secrets and SDK/SMRT secret stores for runtime tenant secrets. Never commit decrypted values.

## Validation

Run narrow checks first, then the full repo check before shipping:

```sh
pnpm install
pnpm check
```

For object/package changes:

```sh
pnpm objects:test
pnpm typecheck
```

For mobile contract changes:

```sh
pnpm mobile:generate
pnpm mobile:validate
```

## Upstream Coordination

- SDK payment work belongs in a separate SDK worktree and starts with `@happyvertical/accounting` Stripe support.
- SMRT subscription, metering, and reusable dock helpers belong in separate SMRT worktrees.
- Merge upstream work before cutting the first public starter release.
