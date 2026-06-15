import {
  createSvelteKitHandle,
  enableTenancy,
  getCurrentTenant,
} from "@happyvertical/smrt-tenancy";
import {
  createSessionHandler,
  loadBearerSessionContext,
  parseBearerToken,
} from "@happyvertical/smrt-users/sveltekit";
import type { Handle, RequestEvent } from "@sveltejs/kit";
import { sequence } from "@sveltejs/kit/hooks";
import { resolveMembershipContext } from "$lib/server/authz";
import { loadStarterExperienceConfig } from "$lib/server/experience";
import { getSmrtConfig } from "$lib/server/smrt";
import { resolveTenant } from "$lib/server/tenancy";

enableTenancy();

// Defense-in-depth: the /api/e2e/session auth-bypass route is enabled whenever
// E2E_AUTH_SECRET is set (it can't gate on NODE_ENV — staging runs
// production). It must never be set on a real production deployment, so make a
// misconfiguration loud at startup rather than silent.
if (process.env.E2E_AUTH_SECRET?.trim() && process.env.NODE_ENV === "production") {
  console.warn(
    "[security] E2E_AUTH_SECRET is set with NODE_ENV=production — the /api/e2e/session " +
      "auth-bypass route is ENABLED. Expected on staging; never set this on real production.",
  );
}

// The smrt config must be registered before any request handler runs;
// without this, routes that do not cross the MCP/chat modules (e.g. OIDC
// login) resolve an empty package config in the production build.
await loadStarterExperienceConfig();

const tenancyHandle = createSvelteKitHandle({
  resolveTenantId: async (event) => {
    const result = await resolveTenant(event as unknown as RequestEvent);
    return result.tenantId;
  },
}) as unknown as Handle;

const sessionHandle = createSessionHandler({
  ...getSmrtConfig("Session"),
  enterTenantContext: true,
}) as unknown as Handle;

const bearerSessionHandle: Handle = async ({ event, resolve }) => {
  if (event.locals.user) {
    return resolve(event);
  }

  const token = parseBearerToken(event.request.headers.get("authorization"));
  if (!token) {
    return resolve(event);
  }

  const context = await loadBearerSessionContext(token, {
    ...getSmrtConfig("Session"),
    sessionCookieName: "sid",
  });
  if (!context) {
    return new Response("Invalid bearer token", { status: 401 });
  }

  event.locals.user = context.user;
  event.locals.permissions = context.permissions;
  event.locals.tenantId = context.tenantId;
  event.locals.sessionId = context.sessionId;

  return resolve(event);
};

const reconcileTenantLocals: Handle = async ({ event, resolve }) => {
  const activeContext = getCurrentTenant();
  if (activeContext) {
    event.locals.tenantId = activeContext.tenantId;
    event.locals.tenantContext = activeContext;
  }

  if (shouldResolveMembership(event.url.pathname)) {
    const membership = await resolveMembershipContext(event.locals);
    event.locals.membership = membership;
    if (membership) {
      event.locals.tenantId = membership.tenantId;
      event.locals.permissions = membership.permissions;
    }
  }

  return resolve(event);
};

const appHandle: Handle = sequence(
  tenancyHandle,
  sessionHandle,
  bearerSessionHandle,
  reconcileTenantLocals,
);

export const handle: Handle = async ({ event, resolve }) => {
  // The health probe must stay dependency-free: deploy pipelines poll it before
  // Postgres is ready, and `tenancyHandle` -> `resolveTenant()` can hit the DB
  // for tenant-slug hosts. Skip the entire tenancy/session chain and render the
  // route directly so /api/health never touches tenancy, session, or the DB.
  if (event.url.pathname === "/api/health") {
    return resolve(event);
  }
  return appHandle({ event, resolve });
};

function shouldResolveMembership(pathname: string): boolean {
  return (
    pathname === "/app" ||
    pathname.startsWith("/app/") ||
    (pathname.startsWith("/api/") &&
      !pathname.startsWith("/api/billing/webhook") &&
      !pathname.startsWith("/api/mobile/auth/") &&
      // /api/e2e/* skip membership resolution; any future route added under
      // this prefix must do its own requirePermission/requireTenantMembership.
      !pathname.startsWith("/api/e2e/") &&
      !pathname.startsWith("/api/generated/"))
  );
}
