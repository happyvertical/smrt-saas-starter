import { fail, redirect } from "@sveltejs/kit";
import { requirePermission, starterPermissions } from "$lib/server/authz";
import { getBillingOverview, getPlanCards } from "$lib/server/subscriptions";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  const membership = await requirePermission(locals, starterPermissions.billingRead);
  const overview = await getBillingOverview(membership.tenantId);
  return {
    ...overview,
    plans: await getPlanCards(),
  };
};

export const actions: Actions = {
  checkout: async ({ locals, request }) => {
    await requirePermission(locals, starterPermissions.billingManage);
    const form = await request.formData();
    const planId = String(form.get("planId") ?? "");
    if (!planId) {
      return fail(400, { message: "Missing plan id" });
    }

    throw redirect(303, `/api/billing/checkout?planId=${encodeURIComponent(planId)}`);
  },
  portal: async ({ locals }) => {
    await requirePermission(locals, starterPermissions.billingManage);
    throw redirect(303, "/api/billing/portal");
  },
};
