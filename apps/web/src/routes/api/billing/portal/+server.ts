import { error, json, type RequestHandler, redirect } from "@sveltejs/kit";
import { requirePermission, starterPermissions } from "$lib/server/authz";
import { createCustomerPortalSession, isStripeBillingConfigured } from "$lib/server/billing";
import { getStripeCustomerId } from "$lib/server/subscriptions";

export const GET: RequestHandler = async ({ locals, url }) => {
  const membership = await requirePermission(locals, starterPermissions.billingManage);
  if (!isStripeBillingConfigured()) {
    throw error(503, "Stripe billing provider is not configured");
  }

  const tenantId = membership.tenantId;
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

  if (url.searchParams.get("format") === "json") {
    return json({ portalUrl: session.url, continuationRequired: true });
  }

  throw redirect(303, session.url);
};
