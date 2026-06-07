import { getActiveTenantId, starterData } from "$lib/server/starter-data";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ locals, url }) => {
  return {
    tenantId: getActiveTenantId(locals.tenantId),
    tenantLabel: starterData.demoTenant.name,
    userLabel: "Demo Owner",
    activePath: url.pathname,
  };
};
