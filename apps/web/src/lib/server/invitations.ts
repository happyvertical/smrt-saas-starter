import {
  createStarterInvitation,
  redeemStarterInvitationToken,
  revokeStarterInvitation,
  StarterAppSettingCollection,
  type StarterInvitation,
  StarterInvitationCollection,
  StarterInvitationError,
  validateStarterInvitationToken,
} from "@happyvertical/smrt-saas-objects";
import { withSystemContext } from "@happyvertical/smrt-tenancy";
import { getSmrtConfig } from "$lib/server/smrt";

export type SignupAccessMode = "public" | "invite-only" | "request-access";

export interface SignupAccessSetting {
  id: string | null;
  mode: SignupAccessMode;
  metadata: Record<string, unknown>;
}

export interface TenantOwnerInvitationSummary {
  id: string;
  email: string;
  type: string;
  purpose: string;
  status: string;
  maxUses: number;
  useCount: number;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string | null;
}

export interface CreateTenantOwnerInvitationResult {
  invitation: TenantOwnerInvitationSummary;
  acceptUrl: string;
}

export type DbOverride = NonNullable<
  Parameters<typeof StarterInvitationCollection.create>[0]
>["db"];

const signupAccessModeKey = "signup.access_mode";
const defaultSignupAccessMode: SignupAccessMode = "public";

export async function getSignupAccessMode(): Promise<SignupAccessMode> {
  return (await getSignupAccessSetting()).mode;
}

export async function getSignupAccessSetting(): Promise<SignupAccessSetting> {
  try {
    const settings = await getAppSettingCollection();
    const setting = await withSystemContext(() => settings.findByKey(signupAccessModeKey));
    return {
      id: setting?.id ?? null,
      mode: normalizeSignupAccessMode(setting?.value),
      metadata: normalizeSignupAccessMetadata(setting?.metadata),
    };
  } catch (queryError) {
    if (isMissingStarterTableError(queryError)) {
      return { id: null, mode: defaultSignupAccessMode, metadata: {} };
    }
    throw queryError;
  }
}

export async function setSignupAccessMode(
  modeInput: string,
  updatedByUserId: string,
  metadataInput?: string,
): Promise<SignupAccessMode> {
  const mode = normalizeSignupAccessMode(modeInput);
  const settings = await getAppSettingCollection();
  const now = new Date();

  await withSystemContext(async () => {
    const existing = await settings.findByKey(signupAccessModeKey);
    if (existing) {
      existing.value = mode;
      existing.updatedByUserId = updatedByUserId;
      if (metadataInput !== undefined) existing.metadata = normalizeMetadata(metadataInput);
      existing.updated_at = now;
      await existing.save();
      return;
    }

    await settings.create({
      slug: signupAccessModeKey,
      context: "",
      key: signupAccessModeKey,
      value: mode,
      updatedByUserId,
      metadata:
        metadataInput === undefined
          ? JSON.stringify({ createdBy: "smrt-saas-starter-admin" })
          : normalizeMetadata(metadataInput),
    });
  });

  return mode;
}

export async function createTenantOwnerInvitation(input: {
  email: string;
  invitedByUserId: string;
  origin: string;
}): Promise<CreateTenantOwnerInvitationResult> {
  const invitations = await getInvitationCollection();
  const created = await withSystemContext(() =>
    createStarterInvitation(invitations, {
      email: input.email,
      purpose: "tenant-owner",
      invitedByUserId: input.invitedByUserId,
    }),
  );

  return {
    invitation: serializeInvitation(created.invitation),
    acceptUrl: buildAcceptUrl(input.origin, created.token),
  };
}

export async function listTenantOwnerInvitations(): Promise<TenantOwnerInvitationSummary[]> {
  const invitations = await getInvitationCollection();
  const rows = await withSystemContext(() =>
    invitations.list({ where: { purpose: "tenant-owner" }, limit: 100 }),
  );
  return rows.map(serializeInvitation);
}

export async function revokeTenantOwnerInvitation(
  invitationId: string,
): Promise<TenantOwnerInvitationSummary> {
  const invitations = await getInvitationCollection();
  const invitation = await withSystemContext(() =>
    revokeStarterInvitation(invitations, invitationId),
  );
  return serializeInvitation(invitation);
}

export async function validateTenantOwnerInvitationToken(
  token: string,
  options: { email?: string | null; db?: DbOverride } = {},
): Promise<TenantOwnerInvitationSummary> {
  const invitations = await getInvitationCollection(options.db);
  const invitation = await withSystemContext(() =>
    validateStarterInvitationToken(invitations, token, {
      email: options.email,
      purpose: "tenant-owner",
    }),
  );
  return serializeInvitation(invitation);
}

export async function redeemTenantOwnerInvitationToken(
  token: string,
  options: {
    email: string;
    acceptedByUserId: string;
    db?: DbOverride;
  },
): Promise<TenantOwnerInvitationSummary> {
  const invitations = await getInvitationCollection(options.db);
  const invitation = await withSystemContext(() =>
    redeemStarterInvitationToken(invitations, token, {
      email: options.email,
      acceptedByUserId: options.acceptedByUserId,
      purpose: "tenant-owner",
    }),
  );
  return serializeInvitation(invitation);
}

export function toAccountFlowMessage(error: unknown): string | null {
  return error instanceof StarterInvitationError ? error.message : null;
}

function normalizeSignupAccessMode(value: string | null | undefined): SignupAccessMode {
  if (value === "invite-only") {
    return "invite-only";
  }
  if (value === "request-access") {
    return "request-access";
  }
  return "public";
}

export function normalizeSignupAccessMetadata(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return { ...(value as Record<string, unknown>) };
  }
  if (typeof value !== "string") return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? { ...(parsed as Record<string, unknown>) }
      : {};
  } catch {
    return {};
  }
}

function normalizeMetadata(value: string): string {
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Metadata must be a JSON object.");
    }
    return JSON.stringify(parsed);
  } catch (error) {
    if (error instanceof Error && error.message === "Metadata must be a JSON object.") {
      throw error;
    }
    throw new Error("Metadata must be valid JSON.");
  }
}

async function getAppSettingCollection() {
  return await StarterAppSettingCollection.create(getSmrtConfig("StarterAppSetting"));
}

async function getInvitationCollection(db?: DbOverride) {
  const config = getSmrtConfig("StarterInvitation");
  return await StarterInvitationCollection.create(db ? { ...config, db } : config);
}

function buildAcceptUrl(origin: string, token: string): string {
  const url = new URL(`/invite/${encodeURIComponent(token)}`, origin);
  return url.toString();
}

function serializeInvitation(invitation: StarterInvitation): TenantOwnerInvitationSummary {
  return {
    id: invitation.id ?? "",
    email: invitation.email,
    type: invitation.type,
    purpose: invitation.purpose,
    status: invitation.status,
    maxUses: invitation.maxUses,
    useCount: invitation.useCount,
    expiresAt: invitation.expiresAt.toISOString(),
    acceptedAt: invitation.acceptedAt?.toISOString() ?? null,
    createdAt: invitation.created_at?.toISOString() ?? null,
  };
}

function isMissingStarterTableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const code = (error as Error & { code?: string }).code;
  return (
    code === "42P01" ||
    error.message.includes('relation "starter_app_settings" does not exist') ||
    error.message.includes('relation "starter_invitations" does not exist') ||
    error.message.includes("no such table: starter_app_settings") ||
    error.message.includes("no such table: starter_invitations")
  );
}
