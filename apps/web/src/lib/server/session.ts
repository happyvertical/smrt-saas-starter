import { createSessionCookie, destroySessionCookie } from "@happyvertical/smrt-users/sveltekit";
import type { RequestEvent } from "@sveltejs/kit";
import type { AccountSessionTarget } from "$lib/server/accounts";
import { getSmrtConfig } from "$lib/server/smrt";
import { TENANT_SWITCH_COOKIE } from "$lib/server/tenancy";

const maxTenantCookieAge = 60 * 60 * 24 * 365;

export async function startAccountSession(event: RequestEvent, target: AccountSessionTarget) {
  await createSessionCookie(
    event as unknown as Parameters<typeof createSessionCookie>[0],
    target.userId,
    target.tenantId,
    {
      ...getSmrtConfig("Session"),
      userAgent: event.request.headers.get("user-agent") ?? undefined,
      ipAddress: event.getClientAddress(),
      cookieSecure: event.url.protocol === "https:",
    },
  );

  event.cookies.set(TENANT_SWITCH_COOKIE, target.tenantId, {
    path: "/",
    httpOnly: true,
    secure: event.url.protocol === "https:",
    sameSite: "lax",
    maxAge: maxTenantCookieAge,
  });
}

export async function clearAccountSession(event: RequestEvent) {
  await destroySessionCookie(
    event as unknown as Parameters<typeof destroySessionCookie>[0],
    getSmrtConfig("Session"),
  );
  event.cookies.delete(TENANT_SWITCH_COOKIE, { path: "/" });
}
