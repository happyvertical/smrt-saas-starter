import { error, type RequestHandler, redirect } from "@sveltejs/kit";
import { createCustomerPortalSession, isStripeBillingConfigured } from "$lib/server/billing";
import { getActiveTenantId } from "$lib/server/starter-data";
import { getStripeCustomerId } from "$lib/server/subscriptions";

export const GET: RequestHandler = async ({ locals, url }) => {
  if (!isStripeBillingConfigured()) {
    throw error(503, "Stripe billing provider is not configured");
  }

  const tenantId = getActiveTenantId(locals.tenantId);
  const stripeCustomerId = await getStripeCustomerId(tenantId);
  if (!stripeCustomerId) {
    throw error(503, "Stripe customer id is not configured for this tenant");
  }

  const session = await createCustomerPortalSession({
    stripeCustomerId,
    returnUrl: `${url.origin}/app/billing`,
  });

  if (!session.url) {
    throw error(502, "Stripe portal did not return a URL");
  }

  throw redirect(303, session.url);
};
