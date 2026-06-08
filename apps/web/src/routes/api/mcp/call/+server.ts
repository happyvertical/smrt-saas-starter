import { error, isHttpError, json, type RequestHandler } from "@sveltejs/kit";
import { executeRuntimeToolForTenant, RuntimeToolExecutionError } from "$lib/server/mcp";
import { getActiveTenantId } from "$lib/server/starter-data";

export const POST: RequestHandler = async ({ locals, request }) => {
  const body = await readJsonObject(request);
  if (typeof body.name !== "string" || body.name.trim().length === 0) {
    throw error(400, "Missing tool name");
  }

  const tenantId = getActiveTenantId(locals.tenantId);
  const execution = await executeRuntimeToolForTenant(body.name.trim(), body.input, tenantId).catch(
    (executionError: unknown) => {
      if (executionError instanceof RuntimeToolExecutionError) {
        throw error(executionError.status, executionError.message);
      }
      throw executionError;
    },
  );

  return json(execution.response);
};

async function readJsonObject(request: Request): Promise<{ name?: unknown; input?: unknown }> {
  try {
    const body = (await request.json()) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw error(400, "Expected JSON object");
    }
    return body as { name?: unknown; input?: unknown };
  } catch (jsonError) {
    if (isHttpError(jsonError)) {
      throw jsonError;
    }
    throw error(400, "Invalid JSON body");
  }
}
