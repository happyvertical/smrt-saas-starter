# @happyvertical/smrt-saas-worker

Background worker for recurring subscription and usage jobs.

## Rules

- Jobs must be idempotent.
- Tenant context is required before tenant-scoped reads or writes.
- Do not log secret values or webhook payloads.
- `WORKER_JOB` accepts `all`, `subscriptions.reconcile`, and `usage.audit`.
- `WORKER_MODE=runner` is the deploy mode and must run SMRT `TaskRunner` plus
  `ScheduleRunner`; `smrt-once`, `enqueue`, and `direct` are local/debug modes.
- Recurring starter maintenance uses `AgentSchedule` rows until SMRT has a more
  generic scheduler table/API.
- `subscriptions.reconcile` must tolerate missing Stripe configuration by
  reporting skipped work instead of failing local development.

## Validation

```sh
pnpm --filter @happyvertical/smrt-saas-worker typecheck
pnpm --filter @happyvertical/smrt-saas-worker test
```
