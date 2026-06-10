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
import { getSmrtConfig } from "$lib/server/smrt";
import { resolveTenant } from "$lib/server/tenancy";

enableTenancy();

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

export const handle: Handle = sequence(
  tenancyHandle,
  sessionHandle,
  bearerSessionHandle,
  reconcileTenantLocals,
);

function shouldResolveMembership(pathname: string): boolean {
  return (
    pathname === "/app" ||
    pathname.startsWith("/app/") ||
    (pathname.startsWith("/api/") &&
      !pathname.startsWith("/api/billing/webhook") &&
      !pathname.startsWith("/api/health") &&
      !pathname.startsWith("/api/mobile/auth/") &&
      !pathname.startsWith("/api/generated/"))
  );
}
