import { fail, redirect } from "@sveltejs/kit";
import { getBillingOverview, getPlanCards } from "$lib/server/subscriptions";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  const overview = getBillingOverview(locals.tenantId ?? "demo");
  return {
    ...overview,
    plans: getPlanCards(overview.currentPlan.id),
  };
};

export const actions: Actions = {
  checkout: async ({ request }) => {
    const form = await request.formData();
    const planId = String(form.get("planId") ?? "");
    if (!planId) {
      return fail(400, { message: "Missing plan id" });
    }

    throw redirect(303, `/api/billing/checkout?planId=${encodeURIComponent(planId)}`);
  },
  portal: async () => {
    throw redirect(303, "/api/billing/portal");
  },
};
