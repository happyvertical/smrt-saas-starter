import { error, json, type RequestHandler } from "@sveltejs/kit";
import { createFieldPolicy, parseFieldPolicyMutation } from "$lib/server/field-policy";

export const POST: RequestHandler = async ({ locals, request }) => {
  const body = await readJson(request);
  return json(await createFieldPolicy(locals, parseFieldPolicyMutation(body)), { status: 201 });
};

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw error(400, "Request body must be valid JSON.");
  }
}
