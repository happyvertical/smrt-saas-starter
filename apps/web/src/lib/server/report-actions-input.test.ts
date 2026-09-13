import { describe, expect, it } from "vitest";
import { parseActivityReportActionInput, ReportActionInputError } from "./report-actions";

describe("parseActivityReportActionInput", () => {
  it.each([
    ["top-level tenant selector", { phase: "apply", tenantId: "other-tenant" }],
    ["query tenant selector", { phase: "apply", query: { tenantId: "other-tenant" } }],
    ["query projection", { phase: "apply", query: { projection: ["id"] } }],
    ["query fields", { phase: "apply", query: { fields: ["id"] } }],
  ])("rejects a %s", (_label, input) => {
    expect(() => parseActivityReportActionInput(input)).toThrow(ReportActionInputError);
  });

  it("accepts only the supported report query fields", () => {
    expect(
      parseActivityReportActionInput({
        phase: "apply",
        format: "csv",
        query: {
          page: 2,
          pageSize: 50,
          sort: "quantity",
          direction: "desc",
          metricKey: " api.calls ",
        },
      }),
    ).toEqual({
      phase: "apply",
      format: "csv",
      query: {
        page: 2,
        pageSize: 50,
        sort: "quantity",
        direction: "desc",
        metricKey: "api.calls",
      },
    });
  });
});
