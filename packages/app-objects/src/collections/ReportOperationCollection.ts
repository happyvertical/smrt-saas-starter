import { SmrtCollection } from "@happyvertical/smrt-core";
import { ReportOperation } from "../models/ReportOperation.js";

export class ReportOperationCollection extends SmrtCollection<ReportOperation> {
  static readonly _itemClass = ReportOperation;
}
