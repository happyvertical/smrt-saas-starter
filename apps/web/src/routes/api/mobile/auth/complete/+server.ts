import { error as httpError, isHttpError, json, type RequestHandler } from "@sveltejs/kit";
import {
  completeMobileAuth,
  type MobileAuthCompleteRequest,
  MobileAuthError,
} from "$lib/server/mobile-auth";

export const POST: RequestHandler = async (event) => {
  try {
    const body = await readJsonObject(event.request);
    return json(
      await completeMobileAuth({
        request: body,
        userAgent: event.request.headers.get("user-agent") ?? undefined,
        ipAddress: event.getClientAddress(),
      }),
    );
  } catch (error) {
    throw asHttpError(error);
  }
};

async function readJsonObject(request: Request): Promise<MobileAuthCompleteRequest> {
  try {
    const body = (await request.json()) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw httpError(400, "Expected JSON object");
    }
    return body as MobileAuthCompleteRequest;
  } catch (error) {
    if (isHttpError(error)) {
      throw error;
    }
    throw httpError(400, "Invalid JSON body");
  }
}

function asHttpError(error: unknown): never {
  if (error instanceof MobileAuthError) {
    throw httpError(error.status, error.message);
  }
  throw error;
}
