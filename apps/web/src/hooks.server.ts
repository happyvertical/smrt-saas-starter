import {
  createSvelteKitHandle,
  enableTenancy,
  getCurrentTenant,
  withTenant,
} from "@happyvertical/smrt-tenancy";
import {
  createSessionHandler,
  loadBearerSessionContext,
  parseBearerToken,
} from "@happyvertical/smrt-users/sveltekit";
import type { Handle, RequestEvent } from "@sveltejs/kit";
import { sequence } from "@sveltejs/kit/hooks";
import {
  isDevAuthFallbackEnabled,
  requirePermission,
  resolveMembershipContext,
  starterPermissions,
} from "$lib/server/authz";
import { ensureUserProfile } from "$lib/server/profile-identity";
import { getSmrtConfig } from "$lib/server/smrt";
import "$lib/server/smrt-register";
import { loadStarterConfig } from "$lib/server/starter-config";
import { starterData } from "$lib/server/starter-data";
import { requireSuperUser } from "$lib/server/super-users";
import { resolveTenant } from "$lib/server/tenancy";

let demoProfileEnsurePromise: Promise<void> | null = null;

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

if (process.env.SMRT_STARTER_DEMO_AUTH === "true") {
  console.warn(
    "[security] SMRT_STARTER_DEMO_AUTH is enabled — every visitor receives the shared seeded " +
      "demo-owner identity. Use this only for an isolated, non-production demonstration.",
  );
}

// The smrt config must be registered before any request handler runs;
// without this, routes that do not cross the MCP/chat modules (e.g. OIDC
// login) resolve an empty package config in the production build.
await loadStarterConfig();

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
    const user = readAuthenticatedUser(event.locals.user);
    if (user && !user.profileId) {
      await ensureUserProfile(user);
    } else if (isDevFallbackRequest(event.locals.user)) {
      await ensureDemoProfile();
    }

    const membership = await resolveMembershipContext(event.locals);
    event.locals.membership = membership;
    if (membership) {
      event.locals.tenantId = membership.tenantId;
      event.locals.permissions = membership.permissions;
      if (membership.devFallback && !event.locals.user) {
        event.locals.user = {
          id: membership.userId,
          email: membership.userEmail,
          profileId: membership.profileId,
        };
      }
    }
  }

  return resolve(event);
};

const starterAppSettingsApiHandle: Handle = async ({ event, resolve }) => {
  if (
    event.url.pathname === "/api/generated/sync/apply" ||
    event.url.pathname.startsWith("/api/generated/sync/apply/")
  ) {
    return new Response("Not Found", { status: 404 });
  }
  if (isStarterAppSettingsApiRequest(event.url.pathname)) {
    requireSuperUser(event.locals);
    const membership = await requirePermission(event.locals, starterPermissions.settingsManage);
    return withTenant(
      {
        tenantId: membership.tenantId,
        userId: membership.userId,
        permissions: new Set(membership.permissions),
      },
      async () => await resolve(event),
    );
  }
  return resolve(event);
};

function isStarterAppSettingsApiRequest(pathname: string): boolean {
  return (
    pathname === "/api/generated/starterappsettings" ||
    pathname.startsWith("/api/generated/starterappsettings/")
  );
}

function readAuthenticatedUser(
  user: unknown,
): { userId: string; email?: string; profileId?: string } | null {
  if (!user || typeof user !== "object") {
    return null;
  }
  const row = user as Record<string, unknown>;
  const userId = typeof row.id === "string" ? row.id : row.userId;
  const email = typeof row.email === "string" ? row.email : undefined;
  const profileId =
    typeof row.profileId === "string"
      ? row.profileId
      : typeof row.profile_id === "string"
        ? row.profile_id
        : undefined;
  return typeof userId === "string" && userId ? { userId, email, profileId } : null;
}

function ensureDemoProfile(): Promise<void> {
  if (!demoProfileEnsurePromise) {
    demoProfileEnsurePromise = ensureUserProfile({
      userId: starterData.demoTenant.ownerUser.id,
      email: starterData.demoTenant.ownerUser.email,
      name: starterData.demoTenant.ownerProfile.name,
    })
      .then(() => undefined)
      .catch((error) => {
        demoProfileEnsurePromise = null;
        throw error;
      });
  }
  return demoProfileEnsurePromise;
}

function isDevFallbackRequest(user: unknown): boolean {
  return !user && isDevAuthFallbackEnabled();
}

const appHandle: Handle = sequence(
  tenancyHandle,
  sessionHandle,
  bearerSessionHandle,
  reconcileTenantLocals,
  starterAppSettingsApiHandle,
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
      !pathname.startsWith("/api/e2e/"))
  );
}
