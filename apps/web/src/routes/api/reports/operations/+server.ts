import { json } from "@sveltejs/kit";
import { createReportOperation, listReportOperations } from "$lib/server/report-operations";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals }) =>
  json({ operations: await listReportOperations(locals) });

export const POST: RequestHandler = async ({ locals, request }) => {
  try {
    const body = await request.json();
    return json({ operation: await createReportOperation(locals, body) });
  } catch (cause) {
    if (cause instanceof SyntaxError)
      return json({ error: "Operation request is invalid" }, { status: 400 });
    throw cause;
  }
};
