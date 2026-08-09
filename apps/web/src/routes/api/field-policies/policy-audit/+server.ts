import { error, json, type RequestHandler } from "@sveltejs/kit";
import { loadFieldPolicyAudit } from "$lib/server/field-policy";

export const POST: RequestHandler = async ({ locals, request }) => {
  const body = await readObject(request);
  return json(
    await loadFieldPolicyAudit(locals, {
      objectRefs: readStringArray(body.objectRefs, "objectRefs"),
      countObjectRefs: readStringArray(body.countObjectRefs, "countObjectRefs"),
      includeDrift: readBoolean(body.includeDrift, "includeDrift"),
    }),
  );
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

function readStringArray(value: unknown, name: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw error(400, `${name} must be a string array.`);
  }
  return value as string[];
}

function readBoolean(value: unknown, name: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw error(400, `${name} must be a boolean.`);
  return value;
}
