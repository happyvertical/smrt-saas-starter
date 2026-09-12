import { json } from "@sveltejs/kit";
import {
  executeActivityReportExport,
  parseActivityReportActionInput,
  ReportActionInputError,
} from "$lib/server/report-actions";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ locals, request }) => {
  try {
    const input = parseActivityReportActionInput(await request.json());
    return json(await executeActivityReportExport(locals, input));
  } catch (cause) {
    if (cause instanceof ReportActionInputError || cause instanceof SyntaxError) {
      return json({ error: cause.message }, { status: 400 });
    }
    throw cause;
  }
};
