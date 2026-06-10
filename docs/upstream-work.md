# Upstream Work

Reusable starter functionality should continue to move upstream from isolated worktrees. Completed items are kept here so future starter work can see which package now owns each surface.

## Consumed Versions

- SMRT (`@happyvertical/smrt-*`): **0.28.0**
- SDK (`@happyvertical/*`): **0.74.5**

The 0.27.12 → 0.28.0 SMRT bump pulled in many upstream fixes (core persisted-object
id-conflict fix, jobs liveness-based recovery, config SSG secret-leak fix, smrt-svelte
design-token migration). The relevant API change for the starter —
[smrt#1454](https://github.com/happyvertical/smrt/pull/1454) polymorphic subscriber
(`subscriberKind` / `subscriberExternalId` on `TenantSubscription` and
`TenantUsageMetric`) — is **additive and back-compatible**: the starter's tenant-only
path (`resolveTenantEntitlements`, `findCurrentForTenant`, `recordUsage`,
`summarizeUsage`) is unchanged, and the new columns default to the tenant shape. No
starter code changes were required; the bump migrates cleanly (`db:smoke`) and passes
`pnpm check` and e2e. SDK 0.74.5 adds `@happyvertical/sql` `acquireSession()` and a
session-release rollback fix — no starter changes.

## SDK: Stripe In `@happyvertical/accounting`

Status: complete in `@happyvertical/accounting@0.74.4` via [happyvertical/sdk#1041](https://github.com/happyvertical/sdk/pull/1041).

Covered surface:

- customers: create, retrieve, list, sync
- invoices: create, retrieve, list, send, void, sync
- payments: retrieve and list
- checkout sessions: create subscription checkout sessions
- customer portal sessions: create portal sessions
- webhooks: verify signatures and parse events
- subscription status retrieval: normalize Stripe subscription state for SMRT subscription rows

Validation:

```sh
pnpm --filter @happyvertical/accounting test
pnpm --filter @happyvertical/accounting typecheck
pnpm build
```

## SMRT: Tenant Metering

Status: initial tenant subscription metering is complete in `@happyvertical/smrt-subscriptions@0.27.12` via [happyvertical/smrt#1435](https://github.com/happyvertical/smrt/pull/1435), with the Postgres UUID migration fix from [happyvertical/smrt#1439](https://github.com/happyvertical/smrt/pull/1439).

Covered surface:

- persist tenant-aware usage metric records
- expose public APIs for recording and summarizing metric windows
- include `_smrt_ai_usage` in the same usage query surface
- support threshold windows used by subscription plans

## SMRT: Subscriptions

Status: complete in `@happyvertical/smrt-subscriptions@0.27.12` via [happyvertical/smrt#1435](https://github.com/happyvertical/smrt/pull/1435), with the Postgres UUID migration fix from [happyvertical/smrt#1439](https://github.com/happyvertical/smrt/pull/1439).

Covered surface:

- add `@happyvertical/smrt-subscriptions`
- models: subscription plan, plan feature, plan threshold, tenant subscription
- services: entitlement resolver, threshold evaluator, usage meter
- Svelte components: plan picker, current plan summary, usage thresholds
- generated REST/CLI/MCP surfaces

## SMRT Svelte: Right-Dock Chat Helpers

The starter uses `ToolsDock` directly. If more than one app repeats the same chat/MCP dock wiring, upstream a generic helper into `@happyvertical/smrt-svelte` or `@happyvertical/smrt-chat/svelte`.
