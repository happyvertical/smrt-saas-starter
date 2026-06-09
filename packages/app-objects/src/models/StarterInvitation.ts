import type { SmrtObjectOptions } from "@happyvertical/smrt-core";
import { crossPackageRef, field, SmrtObject, smrt } from "@happyvertical/smrt-core";

export type StarterInvitationType = "email" | "link";
export type StarterInvitationPurpose = "tenant-owner" | "tenant-membership";
export type StarterInvitationStatus = "pending" | "accepted" | "revoked";

export interface StarterInvitationOptions extends SmrtObjectOptions {
  tokenHash?: string;
  email?: string;
  type?: StarterInvitationType;
  purpose?: StarterInvitationPurpose;
  status?: StarterInvitationStatus;
  invitedByUserId?: string | null;
  targetTenantId?: string | null;
  roleId?: string | null;
  maxUses?: number;
  useCount?: number;
  expiresAt?: Date;
  acceptedAt?: Date | null;
  acceptedByUserId?: string | null;
  metadata?: string;
}

@smrt({
  tableName: "starter_invitations",
  conflictColumns: ["token_hash"],
  api: false,
  mcp: false,
  cli: false,
})
export class StarterInvitation extends SmrtObject {
  @field({ required: true, unique: true })
  tokenHash = "";

  @field()
  email = "";

  @field({ required: true, default: "email" })
  type: StarterInvitationType = "email";

  @field({ required: true, default: "tenant-owner" })
  purpose: StarterInvitationPurpose = "tenant-owner";

  @field({ required: true, default: "pending" })
  status: StarterInvitationStatus = "pending";

  @crossPackageRef("@happyvertical/smrt-users:User", { nullable: true })
  invitedByUserId: string | null = null;

  @crossPackageRef("@happyvertical/smrt-users:Tenant", { nullable: true })
  targetTenantId: string | null = null;

  @crossPackageRef("@happyvertical/smrt-users:Role", { nullable: true })
  roleId: string | null = null;

  @field({ type: "integer", required: true, default: 1 })
  maxUses = 1;

  @field({ type: "integer", required: true, default: 0 })
  useCount = 0;

  @field({ type: "datetime", required: true })
  expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  @field({ type: "datetime", nullable: true })
  acceptedAt: Date | null = null;

  @crossPackageRef("@happyvertical/smrt-users:User", { nullable: true })
  acceptedByUserId: string | null = null;

  @field({ type: "json" })
  metadata = "{}";

  constructor(options: StarterInvitationOptions = {}) {
    super(options);
    if (options.tokenHash !== undefined) this.tokenHash = options.tokenHash;
    if (options.email !== undefined) this.email = options.email;
    if (options.type !== undefined) this.type = options.type;
    if (options.purpose !== undefined) this.purpose = options.purpose;
    if (options.status !== undefined) this.status = options.status;
    if (options.invitedByUserId !== undefined) this.invitedByUserId = options.invitedByUserId;
    if (options.targetTenantId !== undefined) this.targetTenantId = options.targetTenantId;
    if (options.roleId !== undefined) this.roleId = options.roleId;
    if (options.maxUses !== undefined) this.maxUses = options.maxUses;
    if (options.useCount !== undefined) this.useCount = options.useCount;
    if (options.expiresAt !== undefined) this.expiresAt = options.expiresAt;
    if (options.acceptedAt !== undefined) this.acceptedAt = options.acceptedAt;
    if (options.acceptedByUserId !== undefined) this.acceptedByUserId = options.acceptedByUserId;
    if (options.metadata !== undefined) this.metadata = options.metadata;
  }

  isExpired(now = new Date()): boolean {
    return now > this.expiresAt;
  }

  isFullyUsed(): boolean {
    return this.maxUses > 0 && this.useCount >= this.maxUses;
  }

  isPending(): boolean {
    return this.status === "pending";
  }

  canBeRedeemed(now = new Date()): boolean {
    return this.isPending() && !this.isExpired(now) && !this.isFullyUsed();
  }

  requiresEmailMatch(): boolean {
    return this.type === "email" && this.email.trim().length > 0;
  }

  matchesEmail(email: string | null | undefined): boolean {
    if (!this.requiresEmailMatch()) {
      return true;
    }

    return normalizeEmailInput(email) === normalizeEmailInput(this.email);
  }

  getMetadata(): Record<string, unknown> {
    return parseJsonObject(this.metadata);
  }

  setMetadata(metadata: Record<string, unknown>): void {
    this.metadata = JSON.stringify(metadata);
  }
}

function normalizeEmailInput(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
