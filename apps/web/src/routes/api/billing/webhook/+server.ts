import { json, type RequestHandler } from "@sveltejs/kit";
import { verifyBillingWebhook } from "$lib/server/billing";

export const POST: RequestHandler = async ({ request }) => {
  const payload = await request.text();
  const signature = request.headers.get("stripe-signature") ?? "";
  const event = await verifyBillingWebhook(payload, signature);

  return json({
    received: true,
    eventId: event.id,
    eventType: event.type,
  });
};
