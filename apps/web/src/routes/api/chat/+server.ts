import { error, json, type RequestHandler } from "@sveltejs/kit";
import {
  getTenantChatState,
  resolveChatTenantId,
  sendTenantChatMessage,
  TenantChatError,
} from "$lib/server/agent-chat";

export const GET: RequestHandler = async ({ locals }) => {
  const tenantId = resolveChatTenantId(locals.tenantId);
  return json(await getTenantChatState(tenantId));
};

export const POST: RequestHandler = async ({ locals, request }) => {
  const body = (await request.json()) as { message?: unknown };
  const tenantId = resolveChatTenantId(locals.tenantId);
  const message = typeof body.message === "string" ? body.message : "";

  const result = await sendTenantChatMessage(tenantId, message).catch((chatError: unknown) => {
    if (chatError instanceof TenantChatError) {
      throw error(chatError.status, chatError.message);
    }
    throw chatError;
  });

  return json(result);
};
