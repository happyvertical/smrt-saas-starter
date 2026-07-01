# @happyvertical/smrt-saas-web

SvelteKit (adapter-node) web app: tenant UI, auth flows, billing, usage,
settings, admin, mobile auth/session endpoints, and the runtime MCP surface.

## Rules

- Every `/app/*` load/action and `/api/*` handler must authorize through
  `requirePermission` or `requireTenantMembership` from `$lib/server/authz`.
  Selecting a tenant (cookie, subdomain, header) never grants access by itself.
- The `x-tenant-id` header is ignored unless `SMRT_STARTER_TRUST_TENANT_HEADER=true`;
  browser flows use the membership-gated switch cookie or tenant subdomains.
- Server-only logic lives in `src/lib/server`; never import it into client code.
- Raw SQL uses `?` placeholders. `@happyvertical/sql` normalizes them to `$N`
  for Postgres — do not rewrite them.
- Mobile auth redirect URIs are scheme-restricted and allow-listed in
  `$lib/server/mobile-auth.ts`; extend the allow list, never bypass it.
- The dev-auth fallback (`SMRT_STARTER_DEV_AUTH`, non-production only) signs in
  the demo Owner. Keep new auth paths working with it off.
- Access requests (SMRT `AccessRequest`) go through `$lib/server/access-requests.ts`:
  `submitAccessRequest` is public (the `/request-access` form); operator triage
  (list/approve/decline/graduate) is gated on the super-user tier, not tenant roles.
- Use `.claude/skills/run-web` to launch and preview the app locally.

## Validation

```sh
pnpm --filter @happyvertical/smrt-saas-web test
pnpm --filter @happyvertical/smrt-saas-web typecheck
pnpm db:smoke        # needs Docker Compose Postgres
pnpm --filter @happyvertical/smrt-saas-web test:e2e   # Playwright, see docs/testing.md
```
