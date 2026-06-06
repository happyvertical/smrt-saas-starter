import {
  createSvelteKitHandle,
  enableTenancy,
  getCurrentTenant,
} from "@happyvertical/smrt-tenancy";
import { createSessionHandler } from "@happyvertical/smrt-users/sveltekit";
import type { Handle, RequestEvent } from "@sveltejs/kit";
import { sequence } from "@sveltejs/kit/hooks";
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

const reconcileTenantLocals: Handle = async ({ event, resolve }) => {
  const activeContext = getCurrentTenant();
  if (activeContext) {
    event.locals.tenantId = activeContext.tenantId;
    event.locals.tenantContext = activeContext;
  }

  return resolve(event);
};

export const handle: Handle = sequence(tenancyHandle, sessionHandle, reconcileTenantLocals);
