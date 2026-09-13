import { json } from "@sveltejs/kit";
import { executeActivityReportRefresh, ReportActionInputError } from "$lib/server/report-actions";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ locals, request }) => {
  try {
    const body = await request.json();
    const phase = body?.phase;
    if (phase !== "preview" && phase !== "apply") {
      throw new ReportActionInputError("Report refresh phase is invalid");
    }
    return json(await executeActivityReportRefresh(locals, phase));
  } catch (cause) {
    if (cause instanceof ReportActionInputError || cause instanceof SyntaxError) {
      return json({ error: cause.message }, { status: 400 });
    }
    throw cause;
  }
};
