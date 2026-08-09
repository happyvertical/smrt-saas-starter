import { error, json, type RequestHandler } from "@sveltejs/kit";
import { resolveFieldPolicyBatch } from "$lib/server/field-policy";

export const POST: RequestHandler = async ({ locals, request }) => {
  const body = await readObject(request);
  if (!Array.isArray(body.objectRefs) || body.objectRefs.some((ref) => typeof ref !== "string")) {
    throw error(400, "objectRefs must be a string array.");
  }
  return json(await resolveFieldPolicyBatch(locals, body.objectRefs as string[]));
};

async function readObject(request: Request): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await request.json();
    if (body && typeof body === "object" && !Array.isArray(body)) {
      return body as Record<string, unknown>;
    }
  } catch {
    // Fall through to the bounded client error below.
  }
  throw error(400, "Request body must be a JSON object.");
}
