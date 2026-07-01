import { withSystemContext } from "@happyvertical/smrt-tenancy";
import {
  type AccessRequest,
  AccessRequestError,
  AccessRequestService,
  AccessRequestStatus,
} from "@happyvertical/smrt-users";
import { error } from "@sveltejs/kit";
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
async function createOperatorService(operator: SuperUserContext) {
  return AccessRequestService.create({
    ...accessRequestConfig(),
    authorize: async ({ by }) => {
      if (!by || by !== operator.userId || !isSuperUserEmail(operator.email)) {
        throw error(403, "Super-user access is required to manage access requests.");
      }
    },
    // Lifecycle hook — best-effort, never on the critical path. Email delivery
    // (confirmation / welcome magic link) would wire in here.
    onEvent: (event) => {
      console.info(`[access-request] ${event.type} ${event.accessRequest?.email ?? ""}`);
    },
  });
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
  filter?: { status?: AccessRequestStatus },
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
 * Operator: graduate a request into a real User. With `tenantName`, creates a
 * new tenant and enrolls the requester as owner (the self-serve SaaS outcome,
 * mirroring `onboardTenant`); otherwise creates the user only. `allowFromRequested`
 * lets an operator graduate directly without a separate approve step.
 */
export async function graduateAccessRequest(
  operator: SuperUserContext,
  id: string,
  input: GraduateAccessRequestInput = {},
): Promise<AccessRequestSummary> {
  const service = await createOperatorService(operator);
  const tenantName = input.tenantName?.trim();
  const result = await withSystemContext(() =>
    service.graduateAccessRequest(id, {
      by: operator.userId,
      allowFromRequested: true,
      tenant: tenantName ? { create: { name: tenantName } } : "none",
    }),
  );
  return serializeAccessRequest(result.accessRequest);
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
