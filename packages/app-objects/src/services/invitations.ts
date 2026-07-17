import { createHash, randomBytes } from "node:crypto";
import type {
  StarterInvitation,
  StarterInvitationOptions,
  StarterInvitationPurpose,
  StarterInvitationType,
} from "../models/StarterInvitation.js";

const defaultEmailInviteExpiryDays = 7;
const defaultLinkInviteExpiryDays = 30;

export class StarterInvitationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StarterInvitationError";
  }
}

export interface StarterInvitationStore {
  create(options: StarterInvitationOptions): Promise<StarterInvitation>;
  findByTokenHash(tokenHash: string): Promise<StarterInvitation | null>;
  get(criteria: { id: string }): Promise<StarterInvitation | null>;
  list(options?: { where?: Record<string, unknown>; limit?: number }): Promise<StarterInvitation[]>;
}

export interface CreateStarterInvitationOptions {
  email?: string | null;
  type?: StarterInvitationType;
  purpose: StarterInvitationPurpose;
  invitedByUserId?: string | null;
  targetTenantId?: string | null;
  roleId?: string | null;
  maxUses?: number;
  expiresInDays?: number;
  metadata?: Record<string, unknown>;
}

export interface CreatedStarterInvitation {
  token: string;
  invitation: StarterInvitation;
}

export interface ValidateStarterInvitationOptions {
  email?: string | null;
  purpose?: StarterInvitationPurpose;
  now?: Date;
}

export interface RedeemStarterInvitationOptions extends ValidateStarterInvitationOptions {
  acceptedByUserId: string;
}

export function createInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token.trim()).digest("hex");
}

export async function createStarterInvitation(
  store: StarterInvitationStore,
  options: CreateStarterInvitationOptions,
): Promise<CreatedStarterInvitation> {
  const type = options.type ?? "email";
  const token = createInvitationToken();
  const tokenHash = hashInvitationToken(token);
  const expiresInDays =
    options.expiresInDays ??
    (type === "link" ? defaultLinkInviteExpiryDays : defaultEmailInviteExpiryDays);
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
  const email = normalizeInviteEmail(options.email, { required: type === "email" });

  if (options.purpose === "tenant-membership" && (!options.targetTenantId || !options.roleId)) {
    throw new StarterInvitationError("Tenant membership invitations require a tenant and role.");
  }

  const invitation = await store.create({
    slug: `invite-${tokenHash.slice(0, 16)}`,
    context: "",
    tokenHash,
    email,
    type,
    purpose: options.purpose,
    status: "pending",
    invitedByUserId: options.invitedByUserId ?? null,
    targetTenantId: options.targetTenantId ?? null,
    roleId: options.roleId ?? null,
    maxUses: options.maxUses ?? (type === "link" ? 0 : 1),
    useCount: 0,
    expiresAt,
    acceptedAt: null,
    acceptedByUserId: null,
    metadata: JSON.stringify(options.metadata ?? {}),
  });

  return { token, invitation };
}

export async function validateStarterInvitationToken(
  store: StarterInvitationStore,
  token: string,
  options: ValidateStarterInvitationOptions = {},
): Promise<StarterInvitation> {
  const normalizedToken = token.trim();
  if (!normalizedToken) {
    throw new StarterInvitationError("Invitation token is required.");
  }

  const invitation = await store.findByTokenHash(hashInvitationToken(normalizedToken));
  if (!invitation) {
    throw new StarterInvitationError("Invitation not found.");
  }

  if (options.purpose && invitation.purpose !== options.purpose) {
    throw new StarterInvitationError("Invitation cannot be used for this flow.");
  }

  if (invitation.status === "revoked") {
    throw new StarterInvitationError("Invitation has been revoked.");
  }

  if (invitation.status === "accepted" || invitation.isFullyUsed()) {
    throw new StarterInvitationError("Invitation has already been used.");
  }

  if (invitation.isExpired(options.now)) {
    throw new StarterInvitationError("Invitation has expired.");
  }

  if (hasEmailConstraint(options.email) && !invitation.matchesEmail(options.email)) {
    throw new StarterInvitationError("Invitation is for a different email address.");
  }

  return invitation;
}

export async function redeemStarterInvitationToken(
  store: StarterInvitationStore,
  token: string,
  options: RedeemStarterInvitationOptions,
): Promise<StarterInvitation> {
  const invitation = await validateStarterInvitationToken(store, token, options);

  if (invitation.requiresEmailMatch() && !hasEmailConstraint(options.email)) {
    throw new StarterInvitationError("Invitation requires an email address.");
  }

  invitation.useCount += 1;
  invitation.acceptedAt = new Date();
  invitation.acceptedByUserId = options.acceptedByUserId;

  if (invitation.type === "email" || invitation.isFullyUsed()) {
    invitation.status = "accepted";
  }

  await invitation.save();
  return invitation;
}

export async function revokeStarterInvitation(
  store: StarterInvitationStore,
  invitationId: string,
): Promise<StarterInvitation> {
  const invitation = await store.get({ id: invitationId });
  if (!invitation) {
    throw new StarterInvitationError("Invitation not found.");
  }

  invitation.status = "revoked";
  await invitation.save();
  return invitation;
}

function normalizeInviteEmail(
  email: string | null | undefined,
  options: { required: boolean },
): string {
  const normalized = (email ?? "").trim().toLowerCase();
  if (!normalized) {
    if (options.required) {
      throw new StarterInvitationError("Email invitations require an email address.");
    }
    return "";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new StarterInvitationError("Enter a valid email address.");
  }
  return normalized;
}

function hasEmailConstraint(email: string | null | undefined): boolean {
  return typeof email === "string" && email.trim().length > 0;
}
