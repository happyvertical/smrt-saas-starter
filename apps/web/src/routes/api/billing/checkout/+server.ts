import { error, json, type RequestHandler, redirect } from "@sveltejs/kit";
import { createCheckoutSession } from "$lib/server/billing";
import { DEMO_OWNER_EMAIL, getActiveTenantId } from "$lib/server/starter-data";
import { getStripePriceId } from "$lib/server/subscriptions";

export const GET: RequestHandler = async ({ locals, url }) => {
  const planId = url.searchParams.get("planId");
  if (!planId) {
    throw error(400, "Missing planId");
  }

  const stripePriceId = await getStripePriceId(planId);
  if (!stripePriceId) {
    throw error(503, "Stripe price id is not configured for this plan");
  }

  const tenantId = getActiveTenantId(locals.tenantId);
  const session = await createCheckoutSession({
    tenantId,
    planId,
    stripePriceId,
    customerEmail: DEMO_OWNER_EMAIL,
    successUrl: `${url.origin}/app/billing?checkout=success`,
    cancelUrl: `${url.origin}/app/billing?checkout=cancelled`,
  });

  if (session.url) {
    throw redirect(303, session.url);
  }

  return json(session);
};
