import { switchSessionTenant } from "@happyvertical/smrt-users/sveltekit";
import { error, isHttpError, json, type RequestHandler, redirect } from "@sveltejs/kit";
import { requireTenantMembership } from "$lib/server/authz";
import { getSmrtConfig } from "$lib/server/smrt";
import { isUuid } from "$lib/server/starter-data";
import { TENANT_SWITCH_COOKIE } from "$lib/server/tenancy";

const maxCookieAge = 60 * 60 * 24 * 365;

export const POST: RequestHandler = async (event) => {
  const input = await readSwitchInput(event.request);
  if (!input.tenantId || !isUuid(input.tenantId)) {
    throw error(400, "Missing tenant id");
  }

  const membership = await requireTenantMembership(event.locals, input.tenantId);

  event.cookies.set(TENANT_SWITCH_COOKIE, membership.tenantId, {
    path: "/",
    httpOnly: true,
    secure: event.url.protocol === "https:",
    sameSite: "lax",
    maxAge: maxCookieAge,
  });

  if (event.locals.sessionId) {
    const switched = await switchSessionTenant(
      event as unknown as Parameters<typeof switchSessionTenant>[0],
      membership.tenantId,
      getSmrtConfig("Session"),
    );
    if (!switched) {
      throw error(409, "Unable to switch session tenant");
    }
  }

  if (wantsJson(event.request)) {
    return json({
      tenantId: membership.tenantId,
      tenantLabel: membership.tenantLabel,
      role: membership.roleSlug,
    });
  }

  throw redirect(303, normalizeReturnTo(input.returnTo));
};

async function readSwitchInput(request: Request): Promise<{
  tenantId?: string;
  returnTo?: string;
}> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      const body = (await request.json()) as unknown;
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw error(400, "Expected JSON object");
      }
      return readObjectInput(body as Record<string, unknown>);
    } catch (jsonError) {
      if (isHttpError(jsonError)) {
        throw jsonError;
      }
      throw error(400, "Invalid JSON body");
    }
  }

  const form = await request.formData();
  return {
    tenantId: readFormString(form, "tenantId"),
    returnTo: readFormString(form, "returnTo"),
  };
}

function readObjectInput(body: Record<string, unknown>): { tenantId?: string; returnTo?: string } {
  return {
    tenantId: typeof body.tenantId === "string" ? body.tenantId : undefined,
    returnTo: typeof body.returnTo === "string" ? body.returnTo : undefined,
  };
}

function readFormString(form: FormData, key: string): string | undefined {
  const value = form.get(key);
  return typeof value === "string" ? value : undefined;
}

function wantsJson(request: Request): boolean {
  return request.headers.get("accept")?.includes("application/json") ?? false;
}

function normalizeReturnTo(returnTo: string | undefined): string {
  if (!returnTo?.startsWith("/") || returnTo.startsWith("//")) {
    return "/app";
  }
  return returnTo;
}
