import type { SmrtObjectOptions } from "@happyvertical/smrt-core";
import { crossPackageRef, field, SmrtObject, smrt } from "@happyvertical/smrt-core";

export interface StarterAppSettingOptions extends SmrtObjectOptions {
  key?: string;
  value?: string;
  updatedByUserId?: string | null;
  metadata?: string;
}

@smrt({
  tableName: "starter_app_settings",
  conflictColumns: ["key"],
  api: false,
  mcp: false,
  cli: false,
})
export class StarterAppSetting extends SmrtObject {
  @field({ required: true, unique: true })
  key = "";

  @field({ required: true })
  value = "";

  @crossPackageRef("@happyvertical/smrt-users:User", { nullable: true })
  updatedByUserId: string | null = null;

  @field({ type: "json" })
  metadata = "{}";

  constructor(options: StarterAppSettingOptions = {}) {
    super(options);
    if (options.key !== undefined) this.key = options.key;
    if (options.value !== undefined) this.value = options.value;
    if (options.updatedByUserId !== undefined) this.updatedByUserId = options.updatedByUserId;
    if (options.metadata !== undefined) this.metadata = options.metadata;
  }

  getMetadata(): Record<string, unknown> {
    return parseJsonObject(this.metadata);
  }

  setMetadata(metadata: Record<string, unknown>): void {
    this.metadata = JSON.stringify(metadata);
  }
}

function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
