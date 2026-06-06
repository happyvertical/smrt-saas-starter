# Upstream Work

Do not patch around these gaps locally. Implement them in isolated upstream worktrees and merge them before the first public starter release.

## SDK: Stripe In `@happyvertical/accounting`

Current finding: the SDK has a typed Stripe provider stub under `@happyvertical/accounting`, while QuickBooks is implemented.

Required work:

- customers: create, retrieve, list, sync
- invoices: create, retrieve, list, send, void, sync
- payments: retrieve and list
- checkout sessions: create subscription checkout sessions
- customer portal sessions: create portal sessions
- webhooks: verify signatures and parse events
- subscription status retrieval: normalize Stripe subscription state for SMRT subscription rows

Worktree:

```sh
cd /Users/will/Work/happyvertical/repos/sdk
git worktree add ../sdk-stripe-billing codex/sdk-stripe-billing
```

Validation:

```sh
pnpm --filter @happyvertical/accounting test
pnpm --filter @happyvertical/accounting typecheck
pnpm build
```

## SMRT: Tenant Metering

Required work:

- persist tenant-aware signal metrics
- expose public APIs for recording and summarizing metric windows
- include `_smrt_ai_usage` in the same usage query surface
- support threshold windows used by subscription plans

Worktree:

```sh
cd /Users/will/Work/happyvertical/repos/smrt
git worktree add ../smrt-tenant-metering codex/smrt-tenant-metering
```

## SMRT: Subscriptions

Required work:

- add `@happyvertical/smrt-subscriptions`
- models: subscription plan, plan feature, plan threshold, tenant subscription
- services: entitlement resolver, threshold evaluator, billing provider adapter
- Svelte components: plan picker, current plan summary, usage meters, admin threshold editor
- generated REST/CLI/MCP surfaces

Worktree:

```sh
cd /Users/will/Work/happyvertical/repos/smrt
git worktree add ../smrt-subscriptions codex/smrt-subscriptions
```

## SMRT Svelte: Right-Dock Chat Helpers

The starter uses `ToolsDock` directly. If more than one app repeats the same chat/MCP dock wiring, upstream a generic helper into `@happyvertical/smrt-svelte` or `@happyvertical/smrt-chat/svelte`.
