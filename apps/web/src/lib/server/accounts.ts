import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { MagicLinkError, MagicLinkService } from "@happyvertical/smrt-users";
import { getAppDatabase } from "$lib/server/db";
import {
  type DbOverride,
  redeemTenantOwnerInvitationToken,
  toAccountFlowMessage,
  validateTenantOwnerInvitationToken,
} from "$lib/server/invitations";
import {
  ensureUserProfile,
  ensureUserProfileInTransaction,
  type ProfileIdentityDatabase,
} from "$lib/server/profile-identity";
import { getSmrtConfig } from "$lib/server/smrt";
import { getCurrentMonthWindow, starterData } from "$lib/server/starter-data";

export class AccountFlowError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AccountFlowError";
  }
}

export interface AccountSessionTarget {
  userId: string;
  userEmail: string;
  tenantId: string;
  tenantSlug: string;
  tenantLabel: string;
}

export interface TenantMemberSummary {
  membershipId: string;
  userId: string;
  email: string;
  roleSlug: string;
  roleLabel: string;
  status: string;
}

export interface InviteTenantMemberResult {
  action: "created" | "already-member" | "updated";
  member: TenantMemberSummary;
}

export interface SignInLinkRequestResult {
  email: string;
  expiresAt: Date;
  verificationUrl: string | null;
}

export interface EmailLinkRequestResult extends SignInLinkRequestResult {
  createsAccount: boolean;
}

export interface WelcomeMagicLink {
  email: string;
  expiresAt: Date;
  verificationUrl: string;
}

export interface TenantSummary {
  id: string;
  slug: string;
  name: string;
}

export type DbLike = ProfileIdentityDatabase;

const userStatusActive = "active";
const tenantStatusActive = "active";
const membershipStatusActive = "active";
const defaultPlanKey = "starter";
const allowedInviteRoles = new Set(["admin", "member", "viewer"]);

export async function requestSignInLink(input: {
  email: string;
  origin: string;
  returnTo?: string | null;
}): Promise<SignInLinkRequestResult> {
  const email = normalizeEmail(input.email);
  if (!isMagicLinkDeliveryConfigured()) {
    throw new AccountFlowError(
      501,
      "Magic link email delivery is not configured. Use HappyVertical IDP or enable local inline links.",
    );
  }

  const db = (await getAppDatabase()) as DbLike;
  const user = await findUserByEmail(db, email);
  if (!user) {
    throw new AccountFlowError(404, "No active user exists for that email.");
  }

  const magicLinks = await createMagicLinkService();
  const result = await magicLinks.generate(email);
  const verificationUrl = buildVerificationUrl(input.origin, result.token, input.returnTo);

  return {
    email,
    expiresAt: result.expiresAt,
    verificationUrl: shouldExposeInlineMagicLinks() ? verificationUrl : null,
  };
}

/**
 * Start the unified email entry flow. Existing users get a normal sign-in
 * link; eligible new users get a signed provisioning intent attached to the
 * same magic link. Nothing is created until that link is verified.
 */
export async function requestEmailLink(input: {
  email: string;
  tenantName?: string | null;
  origin: string;
  returnTo?: string | null;
  allowSignup: boolean;
}): Promise<EmailLinkRequestResult> {
  const email = normalizeEmail(input.email);
  if (!isMagicLinkDeliveryConfigured()) {
    throw new AccountFlowError(
      501,
      "Magic link email delivery is not configured. Use HappyVertical IDP or enable local inline links.",
    );
  }

  const db = (await getAppDatabase()) as DbLike;
  const existingUser = await findUserByEmail(db, email);
  if (!existingUser && !input.allowSignup) {
    throw new AccountFlowError(403, "Open signup is not available for this starter.");
  }

  const magicLinks = await createMagicLinkService();
  const result = await magicLinks.generate(email);
  const tenantName = existingUser ? null : resolveNewTenantName(input.tenantName);
  const signupIntent = tenantName
    ? createSignupIntent({
        email,
        tenantName,
        token: result.token,
        expiresAt: result.expiresAt,
      })
    : null;
  const verificationUrl = buildVerificationUrl(
    input.origin,
    result.token,
    input.returnTo,
    signupIntent,
  );

  return {
    email,
    expiresAt: result.expiresAt,
    verificationUrl: shouldExposeInlineMagicLinks() ? verificationUrl : null,
    createsAccount: !existingUser,
  };
}

/**
 * Generate a single-use welcome sign-in link for a freshly graduated user.
 * Mirrors {@link requestSignInLink}'s magic-link generation but skips the
 * membership lookup (graduation just created the user + membership) and always
 * returns the URL so the caller can deliver it (e.g. an access-request welcome
 * email). Returns `null` when local magic-link delivery is not configured — the
 * same gate as the sign-in flow, so production (which ships no inline links or
 * mail transport) is a no-op until a real transport is wired in.
 */
export async function generateWelcomeMagicLink(input: {
  email: string;
  origin: string;
  returnTo?: string | null;
}): Promise<WelcomeMagicLink | null> {
  if (!isMagicLinkDeliveryConfigured()) {
    return null;
  }
  const email = normalizeEmail(input.email);
  const magicLinks = await createMagicLinkService();
  const result = await magicLinks.generate(email);
  return {
    email,
    expiresAt: result.expiresAt,
    verificationUrl: buildVerificationUrl(input.origin, result.token, input.returnTo),
  };
}

export async function verifySignInLink(token: string): Promise<AccountSessionTarget> {
  return await verifyEmailLink(token);
}

export async function verifyEmailLink(
  token: string,
  options: { signupIntent?: string | null; allowSignup?: boolean } = {},
): Promise<AccountSessionTarget> {
  const trimmedToken = token.trim();
  if (!trimmedToken) {
    throw new AccountFlowError(400, "Sign-in link is missing a token.");
  }

  const magicLinks = await createMagicLinkService();
  try {
    const result = await magicLinks.verify(trimmedToken);
    if (options.signupIntent) {
      const intent = verifySignupIntent(options.signupIntent, result.email, trimmedToken);
      if (!options.allowSignup) {
        throw new AccountFlowError(403, "Open signup is not available for this starter.");
      }

      try {
        return await onboardTenant({ email: result.email, tenantName: intent.tenantName });
      } catch (error) {
        if (error instanceof AccountFlowError && error.status === 409) {
          return await signInWithEmail(result.email, { reuseExistingProfile: true });
        }
        throw error;
      }
    }
    return await signInWithEmail(result.email, { reuseExistingProfile: true });
  } catch (error) {
    if (error instanceof MagicLinkError) {
      throw new AccountFlowError(400, error.message);
    }
    throw error;
  }
}

export async function signInWithEmail(
  emailInput: string,
  options: { reuseExistingProfile?: boolean } = {},
): Promise<AccountSessionTarget> {
  const email = normalizeEmail(emailInput);
  const db = (await getAppDatabase()) as DbLike;
  const user = await findUserByEmail(db, email);
  if (!user) {
    throw new AccountFlowError(404, "No active user exists for that email.");
  }

  await ensureUserProfile(
    {
      userId: readRequiredString(user, "id"),
      email,
      ...(options.reuseExistingProfile ? { reuseExistingProfile: true } : {}),
    },
    { db },
  );

  const membership = await findFirstActiveMembershipForUser(db, readRequiredString(user, "id"));
  if (!membership) {
    throw new AccountFlowError(403, "That user does not have an active tenant membership.");
  }

  await db.query(
    `
      UPDATE users
      SET last_login_at = ?, updated_at = ?
      WHERE id = ?
    `,
    new Date().toISOString(),
    new Date().toISOString(),
    readRequiredString(user, "id"),
  );

  return toSessionTarget(membership);
}

export async function onboardTenant(input: {
  email: string;
  tenantName: string;
  invitationToken?: string | null;
}): Promise<AccountSessionTarget> {
  const email = normalizeEmail(input.email);
  const tenantName = normalizeTenantName(input.tenantName);
  const invitationToken = input.invitationToken?.trim() || null;
  const db = (await getAppDatabase()) as DbLike;

  const now = new Date().toISOString();
  const tenantId = randomUUID();
  const userId = randomUUID();
  const userSlug = createUserSlug(email);

  return await withDbTransaction(db, async (tx) => {
    if (invitationToken) {
      await validateAccountInvitation(invitationToken, email, tx);
    }

    const existingUser = await findUserByEmail(tx, email);
    if (existingUser) {
      throw new AccountFlowError(409, "That email already has an account. Sign in instead.");
    }

    const tenantSlug = await createUniqueTenantSlug(tx, slugify(tenantName));
    const ownerRole = await ensureSystemRole(tx, "owner");

    await tx.upsert("tenants", ["slug", "context", "_meta_type"], {
      id: tenantId,
      slug: tenantSlug,
      context: "",
      _meta_type: "@happyvertical/smrt-users:Tenant",
      _meta_data: { createdBy: "smrt-saas-starter-signup" },
      updated_at: now,
      name: tenantName,
      status: tenantStatusActive,
      description: `${tenantName} workspace`,
      hierarchy_level: 0,
      hierarchy_path: tenantId,
      cascade_permissions: true,
      inherit_permissions: true,
    });

    await tx.upsert("users", ["slug", "context"], {
      id: userId,
      slug: userSlug,
      context: "",
      updated_at: now,
      profile_id: null,
      email,
      email_key: email,
      status: userStatusActive,
      last_login_at: now,
    });

    await ensureUserProfileInTransaction(tx, {
      userId,
      email,
    });

    await tx.upsert("memberships", ["slug", "context"], {
      id: randomUUID(),
      slug: createMembershipSlug(userId, "owner"),
      context: tenantId,
      updated_at: now,
      user_id: userId,
      tenant_id: tenantId,
      role_id: readRequiredString(ownerRole, "id"),
      status: membershipStatusActive,
    });

    await seedDefaultTenantSubscription(tx, { id: tenantId, slug: tenantSlug });

    if (invitationToken) {
      await redeemAccountInvitation(invitationToken, email, userId, tx);
    }

    return {
      userId,
      userEmail: email,
      tenantId,
      tenantSlug,
      tenantLabel: tenantName,
    };
  });
}

/**
 * Seed the default (`starter`) subscription for a tenant. Shared by the signup
 * onboarding path and access-request graduation so both produce the same
 * billing/entitlement state (`getBillingOverview` expects a subscription row).
 * Idempotent on the SMRT polymorphic subscriber identity.
 */
export async function seedDefaultTenantSubscription(
  db: DbLike,
  tenant: { id: string; slug: string },
): Promise<void> {
  const now = new Date().toISOString();
  const window = getCurrentMonthWindow();
  const starterPlan = await findSubscriptionPlan(db, defaultPlanKey);
  await db.upsert(
    "_smrt_tenant_subscriptions",
    ["tenant_id", "subscriber_kind", "subscriber_external_id"],
    {
      id: randomUUID(),
      slug: `${tenant.slug}-${defaultPlanKey}`,
      context: tenant.id,
      updated_at: now,
      tenant_id: tenant.id,
      subscriber_kind: "tenant",
      subscriber_external_id: "",
      plan_id: readRequiredString(starterPlan, "id"),
      status: "active",
      started_at: window.start.toISOString(),
      current_period_start: window.start.toISOString(),
      current_period_end: window.end.toISOString(),
      trial_ends_at: null,
      cancel_at_period_end: false,
      canceled_at: null,
      external_provider: "stripe",
      stripe_customer_id: "",
      stripe_subscription_id: "",
      stripe_checkout_session_id: "",
      metadata: JSON.stringify({ createdBy: "smrt-saas-starter", planKey: defaultPlanKey }),
    },
  );
}

/**
 * List active tenants (id / slug / name), ordered by name. Used by the admin
 * access-request triage UI to graduate a requester into an existing tenant.
 */
export async function listTenants(): Promise<TenantSummary[]> {
  const db = (await getAppDatabase()) as DbLike;
  const result = await db.query(
    `
      SELECT id, slug, name
      FROM tenants
      WHERE status = 'active'
      ORDER BY name ASC
    `,
  );
  return result.rows.map((row) => ({
    id: readRequiredString(row, "id"),
    slug: readRequiredString(row, "slug"),
    name: readRequiredString(row, "name"),
  }));
}

async function validateAccountInvitation(token: string, email: string, db: DbLike): Promise<void> {
  try {
    // `db` is the live SMRT database/transaction (DbLike is a local narrowing of it);
    // the invitation API expects the full DatabaseInterface, so re-widen at the boundary.
    await validateTenantOwnerInvitationToken(token, { email, db: db as unknown as DbOverride });
  } catch (error) {
    const message = toAccountFlowMessage(error);
    if (message) {
      throw new AccountFlowError(400, message);
    }
    throw error;
  }
}

async function redeemAccountInvitation(
  token: string,
  email: string,
  acceptedByUserId: string,
  db: DbLike,
): Promise<void> {
  try {
    await redeemTenantOwnerInvitationToken(token, {
      email,
      acceptedByUserId,
      db: db as unknown as DbOverride,
    });
  } catch (error) {
    const message = toAccountFlowMessage(error);
    if (message) {
      throw new AccountFlowError(400, message);
    }
    throw error;
  }
}

export async function listTenantMembers(tenantId: string): Promise<TenantMemberSummary[]> {
  const db = (await getAppDatabase()) as DbLike;
  const result = await db.query(
    `
      SELECT
        memberships.id AS membership_id,
        memberships.status AS membership_status,
        users.id AS user_id,
        users.email AS user_email,
        roles.slug AS role_slug,
        roles.name AS role_name
      FROM memberships
      INNER JOIN users ON users.id = memberships.user_id
      INNER JOIN roles ON roles.id = memberships.role_id
      WHERE memberships.tenant_id = ?
      ORDER BY roles.slug ASC, users.email ASC
    `,
    tenantId,
  );

  return result.rows.map(toTenantMemberSummary);
}

export async function inviteTenantMember(input: {
  tenantId: string;
  email: string;
  roleSlug: string;
}): Promise<InviteTenantMemberResult> {
  const email = normalizeEmail(input.email);
  const roleSlug = normalizeInviteRole(input.roleSlug);
  const db = (await getAppDatabase()) as DbLike;
  const tenant = await findTenantById(db, input.tenantId);
  if (!tenant) {
    throw new AccountFlowError(404, "Tenant not found.");
  }

  const now = new Date().toISOString();
  const user = (await findUserByEmail(db, email)) ?? (await createInvitedUser(db, email, now));
  const userId = readRequiredString(user, "id");
  await ensureUserProfile({ userId, email }, { db });
  const existingMembership = await findMembershipByUserAndTenant(db, userId, input.tenantId);
  const role = await ensureSystemRole(db, roleSlug);

  if (existingMembership) {
    if (
      readOptionalString(existingMembership, "status") === membershipStatusActive &&
      readOptionalString(existingMembership, "role_slug") === roleSlug
    ) {
      return {
        action: "already-member",
        member: toTenantMemberSummary(existingMembership),
      };
    }

    await db.query(
      `
        UPDATE memberships
        SET role_id = ?, status = ?, updated_at = ?
        WHERE id = ?
      `,
      readRequiredString(role, "id"),
      membershipStatusActive,
      now,
      readRequiredString(existingMembership, "membership_id"),
    );

    return {
      action: "updated",
      member: {
        membershipId: readRequiredString(existingMembership, "membership_id"),
        userId,
        email,
        roleSlug,
        roleLabel: readRequiredString(role, "name"),
        status: membershipStatusActive,
      },
    };
  }

  const membershipId = randomUUID();
  await db.upsert("memberships", ["slug", "context"], {
    id: membershipId,
    slug: createMembershipSlug(userId, roleSlug),
    context: input.tenantId,
    updated_at: now,
    user_id: userId,
    tenant_id: input.tenantId,
    role_id: readRequiredString(role, "id"),
    status: membershipStatusActive,
  });

  return {
    action: "created",
    member: {
      membershipId,
      userId,
      email,
      roleSlug,
      roleLabel: readRequiredString(role, "name"),
      status: membershipStatusActive,
    },
  };
}

function normalizeEmail(emailInput: string): string {
  const email = emailInput.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AccountFlowError(400, "Enter a valid email address.");
  }
  return email;
}

function normalizeTenantName(value: string): string {
  const tenantName = value.trim().replace(/\s+/g, " ");
  if (tenantName.length < 2) {
    throw new AccountFlowError(400, "Workspace name must be at least 2 characters.");
  }
  if (tenantName.length > 80) {
    throw new AccountFlowError(400, "Workspace name must be 80 characters or fewer.");
  }
  return tenantName;
}

function resolveNewTenantName(value: string | null | undefined): string {
  const provided = value?.trim();
  return normalizeTenantName(provided || "My team");
}

function normalizeInviteRole(value: string): string {
  const roleSlug = value.trim().toLowerCase();
  if (!allowedInviteRoles.has(roleSlug)) {
    throw new AccountFlowError(400, "Choose a valid member role.");
  }
  return roleSlug;
}

async function createMagicLinkService(): Promise<MagicLinkService> {
  return await MagicLinkService.create({
    ...getSmrtConfig("UsersMagicLinkToken"),
    secret: getAuthSecret(),
  });
}

function getAuthSecret(): string {
  const configured = process.env.SESSION_SECRET?.trim();
  if (configured) {
    return configured;
  }
  if (process.env.NODE_ENV === "production") {
    throw new AccountFlowError(500, "SESSION_SECRET is required for magic link authentication.");
  }
  return "smrt-saas-starter-local-session-secret";
}

function isMagicLinkDeliveryConfigured(): boolean {
  return shouldExposeInlineMagicLinks();
}

function shouldExposeInlineMagicLinks(): boolean {
  return (
    process.env.SMRT_STARTER_AUTH_INLINE_LINKS !== "false" && process.env.NODE_ENV !== "production"
  );
}

function buildVerificationUrl(
  origin: string,
  token: string,
  returnTo: string | null | undefined,
  signupIntent?: string | null,
): string {
  const url = new URL("/login/verify", origin);
  url.searchParams.set("token", token);
  if (signupIntent) {
    url.searchParams.set("signup", signupIntent);
  }
  const normalizedReturnTo = normalizeReturnTo(returnTo);
  if (normalizedReturnTo !== "/app") {
    url.searchParams.set("returnTo", normalizedReturnTo);
  }
  return url.toString();
}

interface SignupIntent {
  email: string;
  tenantName: string;
  tokenHash: string;
  expiresAt: string;
}

function createSignupIntent(input: {
  email: string;
  tenantName: string;
  token: string;
  expiresAt: Date;
}): string {
  const payload: SignupIntent = {
    email: input.email,
    tenantName: input.tenantName,
    tokenHash: hashMagicLinkToken(input.token),
    expiresAt: input.expiresAt.toISOString(),
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", getAuthSecret())
    .update(encodedPayload)
    .digest("base64url");
  return `${encodedPayload}.${signature}`;
}

function verifySignupIntent(intentInput: string, emailInput: string, token: string): SignupIntent {
  const [encodedPayload, signature, extra] = intentInput.split(".");
  if (!encodedPayload || !signature || extra) {
    throw new AccountFlowError(400, "Sign-in link has an invalid signup intent.");
  }

  const expectedSignature = createHmac("sha256", getAuthSecret())
    .update(encodedPayload)
    .digest("base64url");
  if (!hasMatchingSignature(signature, expectedSignature)) {
    throw new AccountFlowError(400, "Sign-in link has an invalid signup intent.");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    throw new AccountFlowError(400, "Sign-in link has an invalid signup intent.");
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new AccountFlowError(400, "Sign-in link has an invalid signup intent.");
  }

  const value = payload as Partial<SignupIntent>;
  if (
    typeof value.email !== "string" ||
    typeof value.tenantName !== "string" ||
    typeof value.tokenHash !== "string" ||
    typeof value.expiresAt !== "string" ||
    value.email !== normalizeEmail(emailInput) ||
    value.tokenHash !== hashMagicLinkToken(token) ||
    Number.isNaN(Date.parse(value.expiresAt)) ||
    Date.parse(value.expiresAt) <= Date.now()
  ) {
    throw new AccountFlowError(400, "Sign-in link has an invalid signup intent.");
  }

  return {
    email: value.email,
    tenantName: normalizeTenantName(value.tenantName),
    tokenHash: value.tokenHash,
    expiresAt: value.expiresAt,
  };
}

function hashMagicLinkToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function hasMatchingSignature(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual, "base64url");
  const expectedBuffer = Buffer.from(expected, "base64url");
  return (
    actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

function normalizeReturnTo(value: string | null | undefined): string {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/app";
}

async function withDbTransaction<T>(db: DbLike, callback: (tx: DbLike) => Promise<T>): Promise<T> {
  return db.transaction ? db.transaction(callback) : callback(db);
}

async function createUniqueTenantSlug(db: DbLike, baseSlug: string): Promise<string> {
  const base = baseSlug || "workspace";
  for (let index = 0; index < 20; index += 1) {
    const slug = index === 0 ? base : `${base}-${index + 1}`;
    const existing = await findTenantBySlug(db, slug);
    if (!existing) {
      return slug;
    }
  }
  throw new AccountFlowError(409, "Could not create a unique workspace slug.");
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function createUserSlug(email: string): string {
  const digest = createHash("sha256").update(email).digest("hex").slice(0, 12);
  return `user-${digest}`;
}

function createMembershipSlug(userId: string, roleSlug: string): string {
  return `${roleSlug}-${userId.slice(0, 8)}`;
}

async function createInvitedUser(db: DbLike, email: string, now: string) {
  const user = {
    id: randomUUID(),
    slug: createUserSlug(email),
    context: "",
    updated_at: now,
    profile_id: null,
    email,
    email_key: email,
    status: userStatusActive,
    last_login_at: null,
  };
  await db.upsert("users", ["slug", "context"], user);
  return user;
}

async function ensureSystemRole(db: DbLike, roleSlug: string) {
  const result = await db.query(
    `
      SELECT id, slug, name
      FROM roles
      WHERE slug = ? AND tenant_id IS NULL
      LIMIT 1
    `,
    roleSlug,
  );
  const existing = result.rows[0];
  if (existing) {
    return existing;
  }

  const seedRole = starterData.roles.find((role) => role.slug === roleSlug);
  if (!seedRole) {
    throw new AccountFlowError(500, `Missing starter role ${roleSlug}.`);
  }

  const now = new Date().toISOString();
  const role = {
    id: seedRole.id,
    slug: seedRole.slug,
    context: "",
    updated_at: now,
    tenant_id: null,
    name: seedRole.name,
    description: seedRole.description,
    is_system: true,
  };
  await db.upsert("roles", ["slug", "context"], role);
  return role;
}

async function findSubscriptionPlan(db: DbLike, planKey: string) {
  const result = await db.query(
    `
      SELECT id, plan_key
      FROM _smrt_subscription_plans
      WHERE plan_key = ? AND status = 'active'
      LIMIT 1
    `,
    planKey,
  );
  const plan = result.rows[0];
  if (!plan) {
    throw new AccountFlowError(500, "Starter subscription plans have not been seeded.");
  }
  return plan;
}

async function findUserByEmail(db: DbLike, email: string) {
  const result = await db.query(
    `
      SELECT id, email
      FROM users
      WHERE email_key = ? AND status = 'active'
      LIMIT 1
    `,
    email,
  );
  return result.rows[0] ?? null;
}

async function findTenantBySlug(db: DbLike, slug: string) {
  const result = await db.query(
    `
      SELECT id, slug, name
      FROM tenants
      WHERE slug = ? AND status = 'active'
      LIMIT 1
    `,
    slug,
  );
  return result.rows[0] ?? null;
}

async function findTenantById(db: DbLike, tenantId: string) {
  const result = await db.query(
    `
      SELECT id, slug, name
      FROM tenants
      WHERE id = ? AND status = 'active'
      LIMIT 1
    `,
    tenantId,
  );
  return result.rows[0] ?? null;
}

async function findFirstActiveMembershipForUser(db: DbLike, userId: string) {
  const result = await db.query(
    `
      SELECT
        memberships.id AS membership_id,
        memberships.status AS membership_status,
        users.id AS user_id,
        users.email AS user_email,
        tenants.id AS tenant_id,
        tenants.slug AS tenant_slug,
        tenants.name AS tenant_name,
        roles.slug AS role_slug,
        roles.name AS role_name
      FROM memberships
      INNER JOIN users ON users.id = memberships.user_id
      INNER JOIN tenants ON tenants.id = memberships.tenant_id
      INNER JOIN roles ON roles.id = memberships.role_id
      WHERE memberships.user_id = ?
        AND memberships.status = 'active'
        AND tenants.status = 'active'
      ORDER BY memberships.created_at ASC
      LIMIT 1
    `,
    userId,
  );
  return result.rows[0] ?? null;
}

async function findMembershipByUserAndTenant(db: DbLike, userId: string, tenantId: string) {
  const result = await db.query(
    `
      SELECT
        memberships.id AS membership_id,
        memberships.status AS membership_status,
        users.id AS user_id,
        users.email AS user_email,
        roles.slug AS role_slug,
        roles.name AS role_name
      FROM memberships
      INNER JOIN users ON users.id = memberships.user_id
      INNER JOIN roles ON roles.id = memberships.role_id
      WHERE memberships.user_id = ? AND memberships.tenant_id = ?
      LIMIT 1
    `,
    userId,
    tenantId,
  );
  return result.rows[0] ?? null;
}

function toSessionTarget(row: Record<string, unknown>): AccountSessionTarget {
  return {
    userId: readRequiredString(row, "user_id"),
    userEmail: readRequiredString(row, "user_email"),
    tenantId: readRequiredString(row, "tenant_id"),
    tenantSlug: readRequiredString(row, "tenant_slug"),
    tenantLabel: readRequiredString(row, "tenant_name"),
  };
}

function toTenantMemberSummary(row: Record<string, unknown>): TenantMemberSummary {
  return {
    membershipId: readRequiredString(row, "membership_id"),
    userId: readRequiredString(row, "user_id"),
    email: readRequiredString(row, "user_email"),
    roleSlug: readRequiredString(row, "role_slug"),
    roleLabel: readRequiredString(row, "role_name"),
    status: readRequiredString(row, "membership_status"),
  };
}

function readRequiredString(row: Record<string, unknown>, key: string): string {
  const value = readOptionalString(row, key);
  if (!value) {
    throw new Error(`Account query is missing ${key}`);
  }
  return value;
}

function readOptionalString(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}
