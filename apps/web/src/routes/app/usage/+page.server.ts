import { getUsageSummaries } from "$lib/server/usage";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  return {
    summaries: getUsageSummaries(locals.tenantId ?? "demo"),
  };
};
