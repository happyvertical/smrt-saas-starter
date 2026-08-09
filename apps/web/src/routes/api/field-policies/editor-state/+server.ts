import { error, type RequestHandler } from "@sveltejs/kit";
import { fieldPolicyActionResponse, loadFieldPolicyEditorState } from "$lib/server/field-policy";

export const POST: RequestHandler = async ({ locals, request }) => {
  const body = await readObject(request);
  if (typeof body.objectRef !== "string" || !body.objectRef.trim()) {
    throw error(400, "objectRef must be a non-empty string.");
  }
  return fieldPolicyActionResponse(await loadFieldPolicyEditorState(locals, body.objectRef));
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
