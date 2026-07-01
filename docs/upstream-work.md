# Upstream Work

Reusable starter functionality should continue to move upstream from isolated worktrees. Completed items are kept here so future starter work can see which package now owns each surface.

## Consumed Versions

- SMRT (`@happyvertical/smrt-*`): **0.37.1**
- SDK (`@happyvertical/*`): **0.74.11**

These are now installed from **public npm** (`registry.npmjs.org`) — `.npmrc` routes the
`@happyvertical` scope to npmjs and **no GitHub token is required** to install. This
completes the publish migration tracked in [smrt#1563](https://github.com/happyvertical/smrt/issues/1563)
/ [sdk#1046](https://github.com/happyvertical/sdk/issues/1046) (and the straggler fixes
[sdk#1051](https://github.com/happyvertical/sdk/issues/1051) / [sdk#1055](https://github.com/happyvertical/sdk/issues/1055)).

The 0.29 → 0.37 SMRT line introduced two breaking changes the starter had to absorb:

- The Svelte UI runtime was extracted into a new **`@happyvertical/smrt-ui`** package;
  `ThemeProvider` now lives at `@happyvertical/smrt-ui/theme` (was `@happyvertical/smrt-svelte`).
  `smrt-ui` is added as a direct dependency.
- The collection `db` option tightened to require the full `DatabaseInterface`; the
  starter's invitation flow re-widens its narrowed `DbLike` at the boundary
  (`apps/web/src/lib/server/accounts.ts`).

The batched/reusable entitlement resolver from
[smrt#1573](https://github.com/happyvertical/smrt/issues/1573) (`SubscriptionResolver.create`,
`loadEntitlementContext`, `EntitlementResolutionContext`, `TenantUsageMeter`) is now
available and back-compatible; adopting it in `getBillingOverview` is tracked separately.
The bump migrates cleanly (`db:smoke`) and passes `pnpm check` and e2e.

## Process

When starter work hits an upstream bug or a missing public API in a
`@happyvertical/*` package:

1. File an issue on the owning repo — `happyvertical/smrt` for `smrt-*`
   packages, `happyvertical/sdk` for the rest — with the package, version,
   starter context, and a minimal repro. No secrets or tokens.
2. Add the blocker under **Open Blockers** below with the issue link.
3. Wait for the fix to land upstream; do not work around it locally (no
   vendoring, forking, or patching `node_modules`). Continue with unblocked
   work in the meantime.
4. When the fix is released, bump the package version, validate with
   `pnpm check`, and move the entry to the completed sections below.

## Open Blockers

### SMRT: Field metadata is lost in vite-bundled production servers

Status: open upstream as [happyvertical/smrt#1506](https://github.com/happyvertical/smrt/issues/1506)
and [happyvertical/smrt#1507](https://github.com/happyvertical/smrt/issues/1507).
Discovered downstream in smrtsaas (the first starter-derived app with a real
authenticated production user); reproduced on `@happyvertical/smrt-*@0.28.x`.

Root cause (verified against the built server tree): SMRT package dists
self-register field metadata at import time via
`ObjectRegistry.registerPackageManifest(new URL("./manifest.json", import.meta.url))`.
When Vite bundles package code into SvelteKit server chunks,
`import.meta.url` points at `build/server/chunks/<chunk>.js`, so the lookup
resolves to `build/server/chunks/manifest.json`, which does not exist, and
registration becomes a silent no-op. Plain fields vanish from the registry
while relationship fields (registered through the decorator path) survive.
That one failure explains both production bugs:

- `create()`/`save()` silently drop declared plain-field values
  (`users.email`, `sessions.expires_at`/`user_agent`/`ip_address`) — #1506.
- WHERE validation only knows base fields and rejects declared fields
  (`TenantUsageMetric.metricKey`, `TenantSubscription.subscriberKind`) — #1507.

Script mode (`db:smoke`) and dev mode are unaffected because packages load
unbundled from `node_modules`, where `./manifest.json` resolves correctly.

Workaround in this repo (remove once upstream fixes bundled registration):
`apps/web/scripts/generate-runtime-manifest.mjs` merges every runtime package
manifest plus the app-local manifest into `build/server/manifest.json` during
`pnpm build`. smrt-core's upward-search recovery in `registerPackageManifest`
finds that file from the chunks directory. `scripts/smoke-runtime-images.mjs`
guards the file's presence in the web image.

The proper upstream fix belongs in smrt-core/the package build (for example,
inlining field definitions into the registration call instead of resolving a
file next to `import.meta.url`).

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
