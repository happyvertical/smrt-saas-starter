# @happyvertical/smrt-saas-objects

This package owns starter-local SMRT objects and pure subscription/usage services.

## Rules

- Keep reusable behavior generic enough to upstream into SMRT.
- Do not call Stripe directly from models. Use service interfaces so SDK `@happyvertical/accounting` can supply the provider.
- Use `smrt-users` memberships only for tenant access. Subscription models represent billing and entitlements.
- Store JSON fields as strings and expose parse/stringify helpers.

## Validation

```sh
pnpm --filter @happyvertical/smrt-saas-objects test
pnpm --filter @happyvertical/smrt-saas-objects typecheck
```
