import { error, json, type RequestHandler } from "@sveltejs/kit";
import { verifyBillingWebhook } from "$lib/server/billing";
import { syncStripeBillingEvent } from "$lib/server/subscription-sync";

export const POST: RequestHandler = async ({ request }) => {
  const payload = await request.text();
  const signature = request.headers.get("stripe-signature") ?? "";
  const event = await verifyStripeWebhook(payload, signature);
  const sync = await syncStripeBillingEvent(event);

  return json({
    received: true,
    eventId: event.id,
    eventType: event.type,
    sync,
  });
};

async function verifyStripeWebhook(payload: string, signature: string) {
  try {
    return await verifyBillingWebhook(payload, signature);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Stripe webhook verification failed";
    if (message.includes("not configured")) {
      throw error(503, "Stripe webhook provider is not configured");
    }
    if (message.includes("signature") || message.includes("Invalid Stripe webhook payload")) {
      throw error(400, "Invalid Stripe webhook");
    }

    throw caught;
  }
}
