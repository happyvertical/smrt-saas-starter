import { error, json, type RequestHandler } from "@sveltejs/kit";
import {
  deleteFieldPolicy,
  parseFieldPolicyMutation,
  updateFieldPolicy,
} from "$lib/server/field-policy";

export const PUT: RequestHandler = async ({ locals, params, request }) => {
  const id = requiredId(params.id);
  const body = await readJson(request);
  return json(await updateFieldPolicy(locals, id, parseFieldPolicyMutation(body)));
};

export const DELETE: RequestHandler = async ({ locals, params }) =>
  json(await deleteFieldPolicy(locals, requiredId(params.id)));

function requiredId(value: string | undefined): string {
  if (!value) throw error(400, "Field-policy id is required.");
  return value;
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw error(400, "Request body must be valid JSON.");
  }
}
