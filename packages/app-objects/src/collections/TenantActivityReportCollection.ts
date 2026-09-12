import { SmrtReportCollection } from "@happyvertical/smrt-reports";
import { TenantActivityReport } from "../models/TenantActivityReport.js";

export class TenantActivityReportCollection extends SmrtReportCollection<TenantActivityReport> {
  static readonly _itemClass = TenantActivityReport;
}
