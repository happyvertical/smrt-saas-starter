import type { SmrtObjectOptions } from "@happyvertical/smrt-core";
import { crossPackageRef, field, SmrtObject, smrt } from "@happyvertical/smrt-core";
import { getCurrentTenant } from "@happyvertical/smrt-tenancy";

export interface StarterAppSettingOptions extends SmrtObjectOptions {
  key?: string;
  value?: string;
  updatedByUserId?: string | null;
  metadata?: string;
}

@smrt({
  tableName: "starter_app_settings",
  conflictColumns: ["key"],
  // This is the one deliberately browser-managed starter object. Keep the
  // generated surface narrow: settings may be read and upserted by the admin
  // UI, but are never deleted through REST.
  api: {
    include: ["list", "get", "create", "update"],
    principalContext: true,
    writable: ["key", "value", "metadata"],
  },
  mcp: false,
  cli: false,
})
export class StarterAppSetting extends SmrtObject {
  @field({
    required: true,
    unique: true,
    description: "Stable application setting identifier.",
    ui: { basic: true, order: 1 },
  })
  key = "";

  @field({
    required: true,
    description: "Value applied by the starter application for this setting.",
    ui: { basic: true, order: 2 },
  })
  value = "";

  @crossPackageRef("@happyvertical/smrt-users:User", {
    nullable: true,
    readonly: true,
    description: "User who last changed this setting.",
    ui: { basic: false, order: 4 },
  })
  updatedByUserId: string | null = null;

  @field({
    type: "json",
    description: "Optional structured configuration for this setting.",
    ui: { basic: false, order: 3 },
  })
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

  protected stampUpdatedByFromAmbientContext(): void {
    const context = getCurrentTenant();
    if (context) this.updatedByUserId = context.userId ?? null;
  }

  override async save(): Promise<this> {
    this.stampUpdatedByFromAmbientContext();
    return await super.save();
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
