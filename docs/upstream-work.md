# Upstream Work

Reusable starter functionality should continue to move upstream from isolated worktrees. Completed items are kept here so future starter work can see which package now owns each surface.

## Consumed Versions

- SMRT packages (`@happyvertical/smrt-*`): **0.40.63**
- SDK (`@happyvertical/*`): **0.86.1**
- Svelte: **5.56.4 or newer in the 5.x line** (SMRT peer requirement)

The SMRT and SDK families are advanced together: `@happyvertical/smrt-core@0.40.63`
depends on the SDK line at `^0.86.1`, so the catalog/`overrides` pin the SDK family
to `0.86.1` to match. (A prior state pinned SMRT `0.40.61` while `overrides` still
forced the SDK to `0.78.1`; pnpm silently resolved SMRT's own SDK deps down to the
older line — this bump realigns them.)

### SDK DuckDB bundling (consumer-side mitigation, still required at 0.86.1)

`@happyvertical/sql` reaches its optional DuckDB adapter through a
statically-analyzable `import("@duckdb/node-api")` in the package entry, which the
SvelteKit SSR rollup pass tries to bundle — it hits the native `@duckdb/*` `.node`
binding and fails the production `vite build`. This app runs on Postgres, so the
adapter is never executed; `apps/web/vite.config.ts` externalizes `@duckdb/*`
(SSR + rollup `external` + `optimizeDeps.exclude`) so the bundler leaves it as a
runtime import that is never taken. Standard native-addon build config, not a
framework workaround. **Follow-up:** file an SDK issue so `@happyvertical/sql`
keeps the DuckDB import un-analyzable (or ships a browser/edge-safe entry) and
consumers need no such config.

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

The 0.39.15 line also adds the durable normalized identity keys, Profile/User
ownership constraints, and safe default OIDC provisioning from
[smrt#1998](https://github.com/happyvertical/smrt/issues/1998). See the resolved
entry below for the starter integration and required deployment order.

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

### SMRT Fields: field-policy adoption surfaces

[smrt#2263](https://github.com/happyvertical/smrt/issues/2263) was implemented by
[smrt#2264](https://github.com/happyvertical/smrt/pull/2264) and released in
`@happyvertical/smrt-fields@0.40.61`. `ObjectForm` now accepts an `actions`
snippet inside its owned native form, so the starter supplies an ordinary
submit button without querying or depending on private form markup. The same
coordinated release includes the #2048–#2050 provider, policy gear, and control
panel surfaces used by the starter.

The #2052 adoption covers all three slices:

- **Slice 3 — Provider/PolicyField:** no additional upstream gap found. The
  signup-access `ObjectForm` consumes manifest `description`/`ui.basic` metadata
  through its policy-owned provider and basic/advanced mode.
- **Slice 4 — ObjectForm/gear:** the signup-access CRUD screen uses generated
  REST restricted to `StarterAppSetting.api.include`, with policy gear and an
  AdminShell Focus tool.
- **Slice 5 — control panel:** no additional upstream gap found. The starter
  mounts the control-panel destination through AdminShell tenant navigation.

### SMRT: safe Profile selection during verified-email OIDC provisioning

Was: `smrt-users` delegated verified-email OIDC provisioning to a Profile-only
email fallback that could select a tenant-scoped or non-Person Profile before
the starter reconciler saw a User. The SvelteKit callback API did not expose a
safe point for the starter to prevent that collision without duplicating the
OIDC transaction and session boundary. This blocked the coordinated starter
fixes in issues [#35](https://github.com/happyvertical/smrt-saas-starter/issues/35)
and [#36](https://github.com/happyvertical/smrt-saas-starter/issues/36).

Now: [smrt#1998](https://github.com/happyvertical/smrt/issues/1998) was fixed by
[smrt#2005](https://github.com/happyvertical/smrt/pull/2005) and released in
`@happyvertical/smrt-users@0.39.15` / `@happyvertical/smrt-profiles@0.39.15`.
The owner-aware default provisions or reuses only one unowned global Person for
a verified email and fails closed for tenant-scoped, non-Person, owned, or
ambiguous candidates. The starter callback delegates system-context and
transaction ownership to that upstream boundary.

The release also adds durable Profile/User normalized-email keys and readiness
markers. `pnpm db:migrate` applies the schema and then runs the public,
transactional `backfillProfileEmailKeys()` and `backfillUserEmailKeys()` helpers
in that order. Both are idempotent; the User backfill fails before writes while
normalized duplicate User emails remain. Before applying the unique Profile
ownership constraint, operators must reconcile duplicate non-null
`users.profile_id` values as documented in `docs/runbook.md`. The starter's
separate `pnpm db:profiles:backfill` step then attaches canonical Persons to
active legacy Users.

After 0.1.1 is published, `projects.happyvertical.com` should adopt it in a
separate downstream change:

1. Advance the downstream SMRT family coherently to 0.39.15—including
   `smrt-svelte`/`smrt-ui`—and SDK packages to 0.78.1. Preserve the downstream
   repository's existing 0.39 `AdminShell` implementation and adapt it only if
   validation identifies a published API change; do not copy this starter's
   temporary legacy-shell compatibility pins.
2. Port the eager config bootstrap plus the complete starter Profile reconciler
   across signup, invitation, access-request graduation, verified login,
   session, worker, and dev/bootstrap account paths. Update every raw Profile or
   User writer to maintain the normalized `email_key` fields.
3. Stop old identity writers; preflight duplicate normalized Profile/User
   emails, duplicate Profile owners, dangling links, tenant-scoped matches, and
   non-Person matches. Then run schema migration, Profile email-key backfill,
   User email-key backfill, and the atomic starter User/Profile backfill—in that
   order—before enabling OIDC.
4. Verify every active User has exactly one unique global Person. Preserve
   existing issuer/subject links; use an administrator-owned mapping or a
   separately verified account-link flow for a new provider because an already
   owned backfilled Person is not implicitly relinked by email.
5. Update project-connection audit writers to load `membership.profileId`
   through `ProfileCollection` and pass that Person to tenant-scoped
   `AuditLogCollection.record`.
6. Export and migrate retained `project_connection_audits` with an explicit,
   verified actor mapping; compare counts and sample records before cutover.
7. Only after verification, remove the downstream `ProjectConnectionAudit`
   model, exports, registration, and obsolete table. That removal advances
   downstream #115 but does not by itself close it; close #115 and #132 only
   after each issue's independent acceptance criteria, blockers, and validation
   are complete. None of those downstream edits are made by this starter
   release.

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
