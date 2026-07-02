# Upstream Work

Reusable starter functionality should continue to move upstream from isolated worktrees. Completed items are kept here so future starter work can see which package now owns each surface.

## Consumed Versions

- SMRT (`@happyvertical/smrt-*`): **0.37.5**
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
[smrt#1573](https://github.com/happyvertical/smrt/issues/1573) (`loadEntitlementContext`,
`EntitlementResolutionContext`, `TenantUsageMeter`) is adopted in `getBillingOverview`: it
loads the subscription/plan context once and passes the batching `TenantUsageMeter`
(`summarizeBatch`) to the resolver so all thresholds are evaluated per window in a single
query. Passing the meter directly required
[smrt#1722](https://github.com/happyvertical/smrt/issues/1722) — the meter now guards the
optional `_smrt_ai_usage` table (a missing table counts AI usage as zero instead of
throwing) — which shipped in `smrt-subscriptions@0.37.3`, so the local single-metric
`summarizeUsageMetric` safe-reader workaround was removed from `apps/web/src/lib/server/usage.ts`.
The bump migrates cleanly (`db:smoke`) and passes `pnpm check` and e2e.

The 0.37.2 bump adds the **`AccessRequest`** primitive
([smrt#1713](https://github.com/happyvertical/smrt/pull/1713), `@happyvertical/smrt-users`):
a "request access / waitlist" flow. The starter adopts it in
`apps/web/src/lib/server/access-requests.ts` (a wrapper over `AccessRequestService`) — a
public `/request-access` form (rate-limited per-IP/per-email by
`apps/web/src/lib/server/rate-limit.ts`, a per-instance in-memory limiter that expects
edge/ingress rate limiting in multi-replica deploys), a third `request-access` signup mode,
and super-user triage (approve / decline / graduate into a new tenant+owner, an existing
tenant, or user-only) on `/app/admin`. Graduation sends the new user a best-effort welcome
magic link (reusing the `MagicLinkService` flow in `accounts.ts`). The model registers
automatically, so `access_requests` migrates with the normal flow.

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

## Resolved

### `@happyvertical/*` packages now publish to public npm

Was: SMRT/SDK packages published only to GitHub Packages (`npm.pkg.github.com`), which
requires a token for every read, so a public `pnpm install` needed `gh auth token`.
Filed as [smrt#1563](https://github.com/happyvertical/smrt/issues/1563) /
[sdk#1046](https://github.com/happyvertical/sdk/issues/1046); the incomplete-migration
strays were caught in [sdk#1051](https://github.com/happyvertical/sdk/issues/1051)
(missing `documents`) and [sdk#1055](https://github.com/happyvertical/sdk/issues/1055)
(a release gate so a package can't ship with dependency ranges that don't resolve on npm).

Now: the packages publish to `registry.npmjs.org`, `.npmrc` routes the `@happyvertical`
scope there, and the token is gone — a clean `pnpm install` needs no auth. See
**Consumed Versions** above.

### SMRT: Field metadata lost in vite-bundled production servers

Was: SMRT package dists self-registered field metadata at import time via
`ObjectRegistry.registerPackageManifest(new URL("./manifest.json", import.meta.url))`.
When Vite bundled package code into SvelteKit server chunks, `import.meta.url`
resolved to `build/server/chunks/manifest.json` (nonexistent), so registration
silently no-opped: `create()`/`save()` dropped declared plain fields
(`users.email`, `sessions.expires_at`/`user_agent`/`ip_address` — #1506) and
WHERE validation rejected declared fields (`TenantUsageMetric.metricKey`,
`TenantSubscription.subscriberKind` — #1507). Filed as
[smrt#1506](https://github.com/happyvertical/smrt/issues/1506) /
[smrt#1507](https://github.com/happyvertical/smrt/issues/1507).

Now: fixed in `@happyvertical/smrt-*@0.37.5` via
[smrt#1747](https://github.com/happyvertical/smrt/pull/1747), which inlines each
package manifest into its `__smrt-register__` module at build time
(`registerPackageManifest(JSON.parse(...))`), so the bundled chunk carries its
field metadata inline and no runtime file lookup is needed. The local workaround
(`apps/web/scripts/generate-runtime-manifest.mjs`, its `pnpm build` step, and the
`build/server/manifest.json` guard in `scripts/smoke-runtime-images.mjs`) is removed.

## Open Blockers

_None._

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
