import { error, isHttpError, json, type RequestHandler } from "@sveltejs/kit";
import { getTenantChatState, sendTenantChatMessage, TenantChatError } from "$lib/server/agent-chat";
import { requirePermission, starterPermissions } from "$lib/server/authz";

export const GET: RequestHandler = async ({ locals }) => {
  const membership = await requirePermission(locals, starterPermissions.chatUse);
  const tenantId = membership.tenantId;
  const state = await getTenantChatState(tenantId).catch(mapTenantChatError);
  return json(state);
};

export const POST: RequestHandler = async ({ locals, request }) => {
  const body = await readJsonObject(request);
  const membership = await requirePermission(locals, starterPermissions.chatUse);
  const tenantId = membership.tenantId;
  const message = typeof body.message === "string" ? body.message : "";

  const result = await sendTenantChatMessage(tenantId, message).catch(mapTenantChatError);

  return json(result);
};

async function readJsonObject(request: Request): Promise<{ message?: unknown }> {
  try {
    const body = (await request.json()) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw error(400, "Expected JSON object");
    }
    return body as { message?: unknown };
  } catch (jsonError) {
    if (isHttpError(jsonError)) {
      throw jsonError;
    }
    throw error(400, "Invalid JSON body");
  }
}

function mapTenantChatError(chatError: unknown): never {
  if (chatError instanceof TenantChatError) {
    throw error(chatError.status, chatError.message);
  }
  throw chatError;
}
