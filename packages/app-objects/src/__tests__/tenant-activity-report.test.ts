import { ObjectRegistry } from "@happyvertical/smrt-core";
import { describe, expect, it } from "vitest";
import { TenantActivityReport } from "../models/TenantActivityReport.js";

describe("TenantActivityReport", () => {
  it("materializes usage totals as decimals", () => {
    const quantity = ObjectRegistry.getFieldDecorator(TenantActivityReport.name, "quantity");

    expect(quantity?.type).toBe("decimal");
  });
});
