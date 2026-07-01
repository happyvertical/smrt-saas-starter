import { withSystemContext } from "@happyvertical/smrt-tenancy";
import {
  type AccessRequest,
  AccessRequestError,
  type AccessRequestEvent,
  AccessRequestService,
  AccessRequestStatus,
  type GraduateNewTenantOption,
  type GraduateTenantOption,
} from "@happyvertical/smrt-users";
import { error } from "@sveltejs/kit";
import {
  type DbLike,
  generateWelcomeMagicLink,
  seedDefaultTenantSubscription,
} from "$lib/server/accounts";
import { getAppDatabase } from "$lib/server/db";
import { getSmrtConfig } from "$lib/server/smrt";
import { isSuperUserEmail, type SuperUserContext } from "$lib/server/super-users";

export { AccessRequestStatus };

export interface AccessRequestSummary {
  id: string;
  email: string;
  name: string | null;
  status: string;
  source: string | null;
  note: string | null;
  resultingUserId: string | null;
  requestedAt: string | null;
  decidedAt: string | null;
  createdAt: string | null;
}

export interface SubmitAccessRequestInput {
  email: string;
  name?: string | null;
  message?: string | null;
  company?: string | null;
}

export interface GraduateAccessRequestInput {
  /** When set, graduate into a brand-new tenant with the requester as owner. */
  tenantName?: string | null;
  /**
   * When set, graduate into an existing tenant, enrolling the requester with the
   * given membership role (defaults to `member`). Takes precedence over
   * `tenantName`.
   */
  tenant?: { tenantId: string; role?: string | null } | null;
  /**
   * Request origin (e.g. `https://app.example.com`), used to build the
   * best-effort welcome sign-in link sent on graduation. Omit to skip the link.
   */
  origin?: string | null;
}

function accessRequestConfig() {
  return getSmrtConfig("AccessRequest");
}

// `createAccessRequest` is public-safe and never invokes `authorize`, so the
// public service is built without one.
async function createPublicService() {
  return AccessRequestService.create(accessRequestConfig());
}

// Operator methods run through the service's `authorize` hook. Access requests
// are a platform-level concern (they precede any tenant), so gate them on the
// super-user tier — same tier that guards /app/admin — rather than a tenant
// role permission. The route also calls requireSuperUser before reaching here;
// this hook is defense-in-depth bound to the verified operator.
async function createOperatorService(
  operator: SuperUserContext,
  options: { origin?: string } = {},
) {
  return AccessRequestService.create({
    ...accessRequestConfig(),
    authorize: async ({ by }) => {
      if (!by || by !== operator.userId || !isSuperUserEmail(operator.email)) {
        throw error(403, "Super-user access is required to manage access requests.");
      }
    },
    // Lifecycle hook — best-effort, never on the critical path. A throw here is
    // swallowed by the service (it won't roll back an already-persisted
    // transition), and we guard again inside the handler.
    onEvent: (event) => handleAccessRequestEvent(event, options),
  });
}

/**
 * Best-effort reactions to access-request lifecycle transitions. On graduation
 * into a tenant we send the new user a welcome magic link so they can sign in
 * immediately. Delivery must never break the (already-committed) transition, so
 * any failure is logged and swallowed.
 */
async function handleAccessRequestEvent(
  event: AccessRequestEvent,
  options: { origin?: string },
): Promise<void> {
  console.info(`[access-request] ${event.type} ${event.accessRequest?.email ?? ""}`);
  if (event.type !== "access-request.graduated") {
    return;
  }
  // A user graduated without a tenant has no membership, so they cannot sign in
  // yet (signInWithEmail requires an active membership) — a sign-in link would
  // just burn its single use on a guaranteed-failed verify. Only send once a
  // membership exists (new- or existing-tenant graduation).
  if (!event.membership) {
    return;
  }
  const email = event.user?.email ?? event.accessRequest?.email;
  if (!email || !options.origin) {
    return;
  }
  try {
    const link = await generateWelcomeMagicLink({ email, origin: options.origin });
    if (link) {
      // The starter ships no mail transport: locally this surfaces the inline
      // link; wire a real mailer here to deliver the welcome email in production.
      console.info(
        `[access-request] welcome sign-in link for ${link.email}: ${link.verificationUrl}`,
      );
    }
  } catch (err) {
    console.error(`[access-request] welcome email failed for ${email}:`, err);
  }
}

/** Public: capture a prospective user from the request-access form. No auth. */
export async function submitAccessRequest(
  input: SubmitAccessRequestInput,
): Promise<AccessRequestSummary> {
  const service = await createPublicService();
  const request = await withSystemContext(() =>
    service.createAccessRequest({
      email: input.email,
      name: input.name ?? undefined,
      source: "www",
      context: pruneContext({ message: input.message, company: input.company }),
    }),
  );
  return serializeAccessRequest(request);
}

/** Operator: the triage queue (defaults to open REQUESTED requests). */
export async function listAccessRequests(
  operator: SuperUserContext,
  filter?: { status?: AccessRequestStatus | AccessRequestStatus[] },
): Promise<AccessRequestSummary[]> {
  const service = await createOperatorService(operator);
  const rows = await withSystemContext(() =>
    service.listAccessRequests({ status: filter?.status, by: operator.userId }),
  );
  return rows.map(serializeAccessRequest);
}

/** Operator: approve an open request (ready to graduate). */
export async function approveAccessRequest(
  operator: SuperUserContext,
  id: string,
): Promise<AccessRequestSummary> {
  const service = await createOperatorService(operator);
  const request = await withSystemContext(() =>
    service.approveAccessRequest(id, { by: operator.userId }),
  );
  return serializeAccessRequest(request);
}

/** Operator: decline a request, optionally recording a reason. */
export async function declineAccessRequest(
  operator: SuperUserContext,
  id: string,
  reason?: string | null,
): Promise<AccessRequestSummary> {
  const service = await createOperatorService(operator);
  const request = await withSystemContext(() =>
    service.declineAccessRequest(id, { by: operator.userId, reason: reason ?? undefined }),
  );
  return serializeAccessRequest(request);
}

/**
 * Operator: graduate a request into a real User. With an existing `tenant`,
 * enrolls the requester in that tenant with the given role; with `tenantName`,
 * creates a new tenant and enrolls the requester as owner (the self-serve SaaS
 * outcome, mirroring `onboardTenant`); with neither, creates the user only.
 * `allowFromRequested` lets an operator graduate directly without a separate
 * approve step. A best-effort welcome magic link is sent when `origin` is set.
 */
export async function graduateAccessRequest(
  operator: SuperUserContext,
  id: string,
  input: GraduateAccessRequestInput = {},
): Promise<AccessRequestSummary> {
  const origin = input.origin?.trim() || undefined;
  const service = await createOperatorService(operator, { origin });
  const tenant = resolveGraduateTenantOption(input);
  const result = await withSystemContext(() =>
    service.graduateAccessRequest(id, {
      by: operator.userId,
      allowFromRequested: true,
      tenant,
    }),
  );

  // A brand-new tenant needs the same default subscription a normal signup gets
  // (onboardTenant seeds it) — otherwise the graduated tenant hits /app billing +
  // entitlement resolution with no subscription row. An EXISTING tenant already
  // has one, so never re-seed it. Reuse the shared seeder for the new-tenant case.
  if (isNewTenantOption(tenant) && result.tenant?.id && result.tenant?.slug) {
    const db = (await getAppDatabase()) as DbLike;
    const seedTenant = { id: result.tenant.id, slug: result.tenant.slug };
    await withSystemContext(() => seedDefaultTenantSubscription(db, seedTenant));
  }

  return serializeAccessRequest(result.accessRequest);
}

/**
 * Translate the wrapper's graduation input into the SMRT service's tenant
 * option: an existing tenant (with membership role) wins over a new-tenant name,
 * and with neither the requester graduates to a user with no tenant.
 */
function resolveGraduateTenantOption(input: GraduateAccessRequestInput): GraduateTenantOption {
  const existingTenantId = input.tenant?.tenantId?.trim();
  if (existingTenantId) {
    const role = input.tenant?.role?.trim();
    return role ? { tenantId: existingTenantId, role } : { tenantId: existingTenantId };
  }
  const tenantName = input.tenantName?.trim();
  if (tenantName) {
    return { create: { name: tenantName } };
  }
  return "none";
}

function isNewTenantOption(option: GraduateTenantOption): option is GraduateNewTenantOption {
  return typeof option === "object" && "create" in option;
}

/** Map an AccessRequestError to a user-facing message (null for other errors). */
export function toAccessRequestMessage(err: unknown): string | null {
  return err instanceof AccessRequestError ? err.message : null;
}

function serializeAccessRequest(request: AccessRequest): AccessRequestSummary {
  return {
    id: request.id ?? "",
    email: request.email,
    name: request.name ?? null,
    status: request.status,
    source: request.source ?? null,
    note: request.note ?? null,
    resultingUserId: request.resultingUserId ?? null,
    requestedAt: request.requestedAt?.toISOString() ?? null,
    decidedAt: request.decidedAt?.toISOString() ?? null,
    createdAt: request.created_at?.toISOString() ?? null,
  };
}

function pruneContext(
  values: Record<string, string | null | undefined>,
): Record<string, unknown> | undefined {
  const entries = Object.entries(values)
    .map(([key, value]) => [key, value?.trim()] as const)
    .filter((entry): entry is [string, string] => Boolean(entry[1]));
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}
