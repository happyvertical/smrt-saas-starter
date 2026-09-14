import { describe, expect, it } from "vitest";
import { normalizeActivityReportOperationQuery } from "./report-operations.js";

describe("immutable report proposal input", () => {
  it("normalizes the default bounded report view", () => {
    expect(normalizeActivityReportOperationQuery()).toEqual({
      page: 1,
      pageSize: 25,
      sort: "window_start",
      direction: "desc",
      metricKey: "",
    });
  });
  it.each([
    { tenantId: "foreign" },
    { projection: ["secret"] },
    { page: -1 },
    { page: 1.5 },
    { page: 10001 },
    { pageSize: 101 },
    { pageSize: "10" },
    { sort: "tenant_id" },
    { direction: "sideways" },
    { metricKey: "x".repeat(201) },
    null,
    [],
  ])("rejects malformed or authority-bearing query %j", (query) => {
    expect(() => normalizeActivityReportOperationQuery(query as never)).toThrow();
  });
});
