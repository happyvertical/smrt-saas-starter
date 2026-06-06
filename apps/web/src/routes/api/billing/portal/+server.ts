import { error, type RequestHandler, redirect } from "@sveltejs/kit";
import { createCustomerPortalSession } from "$lib/server/billing";

export const GET: RequestHandler = async ({ url }) => {
  const stripeCustomerId = "cus_demo_replace_with_subscription_row";
  const session = await createCustomerPortalSession({
    stripeCustomerId,
    returnUrl: `${url.origin}/app/billing`,
  });

  if (!session.url) {
    throw error(502, "Stripe portal did not return a URL");
  }

  throw redirect(303, session.url);
};
