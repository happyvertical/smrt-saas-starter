import { getBillingOverview } from "$lib/server/subscriptions";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  return getBillingOverview(locals.tenantId ?? "demo");
};
