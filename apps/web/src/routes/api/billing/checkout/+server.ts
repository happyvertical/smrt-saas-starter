import { error, json, type RequestHandler, redirect } from "@sveltejs/kit";
import { requirePermission, starterPermissions } from "$lib/server/authz";
import { createCheckoutSession, isStripeBillingConfigured } from "$lib/server/billing";
import { getStripeCustomerId, getStripePriceId } from "$lib/server/subscriptions";

export const GET: RequestHandler = async ({ locals, url }) => {
  const membership = await requirePermission(locals, starterPermissions.billingManage);
  const planId = url.searchParams.get("planId");
  if (!planId) {
    throw error(400, "Missing planId");
  }

  if (!isStripeBillingConfigured()) {
    throw error(503, "Stripe billing provider is not configured");
  }

  const stripePriceId = await getStripePriceId(planId);
  if (!stripePriceId) {
    throw error(503, "Stripe price id is not configured for this plan");
  }

  const tenantId = membership.tenantId;
  const stripeCustomerId = await getStripeCustomerId(tenantId);
  const session = await createCheckoutSession({
    tenantId,
    planId,
    stripePriceId,
    customerEmail: membership.userEmail,
    customerExternalId: stripeCustomerId ?? undefined,
    successUrl: `${url.origin}/app/billing?checkout=success`,
    cancelUrl: `${url.origin}/app/billing?checkout=cancelled`,
  });

  if (session.url) {
    throw redirect(303, session.url);
  }

  return json(session);
};
