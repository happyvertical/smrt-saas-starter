import { error, json, type RequestHandler } from "@sveltejs/kit";
import { executeRuntimeToolForTenant, RuntimeToolExecutionError } from "$lib/server/mcp";
import { getActiveTenantId } from "$lib/server/starter-data";

export const POST: RequestHandler = async ({ locals, request }) => {
  const body = (await request.json()) as { name?: string; input?: unknown };
  if (!body.name) {
    throw error(400, "Missing tool name");
  }

  const tenantId = getActiveTenantId(locals.tenantId);
  const execution = await executeRuntimeToolForTenant(body.name, body.input, tenantId).catch(
    (executionError: unknown) => {
      if (executionError instanceof RuntimeToolExecutionError) {
        throw error(executionError.status, executionError.message);
      }
      throw executionError;
    },
  );

  return json(execution.response);
};
