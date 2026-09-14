import { json } from "@sveltejs/kit";
import { cancelReportOperation } from "$lib/server/report-operations";
import type { RequestHandler } from "./$types";
export const POST: RequestHandler = async ({ locals, params }) =>
  json({ operation: await cancelReportOperation(locals, params.id) });
