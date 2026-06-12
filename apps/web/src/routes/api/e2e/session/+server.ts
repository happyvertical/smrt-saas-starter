import { timingSafeEqual } from "node:crypto";
import { error, json, type RequestHandler } from "@sveltejs/kit";
import { AccountFlowError, signInWithEmail } from "$lib/server/accounts";
import { startAccountSession } from "$lib/server/session";

// Test-only authentication shortcut for end-to-end tests against DEPLOYED
// environments, where the dev-auth fallback is off. It mints a REAL smrt-users
// session for a single pre-seeded e2e identity, bypassing only the
// OIDC/magic-link verification step — every downstream authz check runs as
// normal.
//
// Fail-closed gating: the route is invisible (404) unless E2E_AUTH_SECRET is
// set, and callers must present that secret. Production never sets the secret,
// so the route never exists there. Note the gate is the secret, NOT NODE_ENV:
// deployed images (staging included) run NODE_ENV=production, so a NODE_ENV
// check would wrongly disable this on staging where it is needed.
export const POST: RequestHandler = async (event) => {
  const secret = process.env.E2E_AUTH_SECRET?.trim();
  if (!secret) {
    throw error(404, "Not found");
  }

  const provided = event.request.headers.get("x-e2e-auth") ?? "";
  if (!constantTimeEquals(provided, secret)) {
    throw error(401, "Invalid e2e auth secret");
  }

  // The identity comes ONLY from server config, never the request body, so the
  // endpoint can mint a session for exactly one known e2e user.
  const email = process.env.E2E_USER_EMAIL?.trim();
  if (!email) {
    throw error(500, "E2E_USER_EMAIL is not configured");
  }

  try {
    const target = await signInWithEmail(email);
    await startAccountSession(event, target);
    return json({ authenticated: true, tenantId: target.tenantId });
  } catch (caught) {
    if (caught instanceof AccountFlowError) {
      throw error(caught.status, caught.message);
    }
    throw caught;
  }
};

function constantTimeEquals(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) {
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}
