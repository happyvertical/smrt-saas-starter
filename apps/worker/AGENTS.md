# @happyvertical/smrt-saas-worker

Background worker for recurring subscription and usage jobs.

## Rules

- Jobs must be idempotent.
- Tenant context is required before tenant-scoped reads or writes.
- Do not log secret values or webhook payloads.

## Validation

```sh
pnpm --filter @happyvertical/smrt-saas-worker typecheck
pnpm --filter @happyvertical/smrt-saas-worker test
```
