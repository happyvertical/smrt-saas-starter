import { error, json } from "@sveltejs/kit";
import { decideReportOperation } from "$lib/server/report-operations";
import type { RequestHandler } from "./$types";

/** This endpoint deliberately accepts only same-origin browser form submissions. */
export const POST: RequestHandler = async ({ locals, params, request, url }) => {
  const origin = request.headers.get("origin");
  if (!origin || origin !== url.origin)
    throw error(403, "Approval requires a same-origin browser form");
  const form = await request.formData();
  const decision = form.get("decision");
  const payloadFingerprint = form.get("payloadFingerprint");
  if ((decision !== "approve" && decision !== "decline") || typeof payloadFingerprint !== "string")
    throw error(400, "Approval form is invalid");
  return json({
    operation: await decideReportOperation(
      locals,
      params.id,
      decision,
      payloadFingerprint,
      locals.sessionId,
    ),
  });
};
