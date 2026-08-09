import {
  buildFieldPolicySettingsCatalog,
  type FieldPolicyAuditSnapshot,
  type FieldPolicyBatchResult,
  FieldPolicyCollection,
  type FieldPolicyEditorStateResult,
  type FieldPolicyScopeType,
  type FieldPolicySettingsCatalogQuery,
  type FieldPolicyVisibility,
  type ResolvedObjectFieldPolicy,
  resolveFieldPolicy,
} from "@happyvertical/smrt-fields";
import { withTenant } from "@happyvertical/smrt-tenancy";
import { error, isHttpError, json } from "@sveltejs/kit";
import { getStarterAppSettingObjectRef } from "$lib/field-policy";
import { requireTenantMembership, type StarterMembershipContext } from "$lib/server/authz";
import { getAppDatabase } from "$lib/server/db";

export interface FieldPolicyMutationInput extends Record<string, unknown> {
  objectRef: string;
  fieldName: string;
  scopeType: FieldPolicyScopeType;
  defaultValue: string | null;
  displayOrder: number | null;
  help: string | null;
  label: string | null;
  locked: boolean | null;
  visibility: FieldPolicyVisibility | null;
}

/**
 * The Fields package derives authorization from the ambient tenancy context.
 * This adapter only carries the membership that the starter already verified;
 * it deliberately does not implement policy resolution or authorization rules.
 */
export async function withFieldPolicyMembership<T>(
  membership: StarterMembershipContext,
  run: () => Promise<T>,
): Promise<T> {
  return await withTenant(
    {
      tenantId: membership.tenantId,
      userId: membership.userId,
      permissions: new Set(membership.permissions),
    },
    run,
  );
}

export async function resolveStarterAppSettingPolicy(
  membership: StarterMembershipContext,
): Promise<ResolvedObjectFieldPolicy> {
  return await withFieldPolicyMembership(membership, async () =>
    resolveFieldPolicy(getStarterAppSettingObjectRef(), {
      tenantId: membership.tenantId,
      userId: membership.userId,
      db: await getAppDatabase(),
    }),
  );
}

export async function loadFieldPolicySettings(
  membership: StarterMembershipContext,
  query: FieldPolicySettingsCatalogQuery,
) {
  return await withFieldPolicyMembership(membership, async () =>
    buildFieldPolicySettingsCatalog({
      ...query,
      db: await getAppDatabase(),
      objectRefs: [getStarterAppSettingObjectRef()],
    }),
  );
}

export function parseFieldPolicyMutation(value: unknown): FieldPolicyMutationInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw error(400, "Field-policy mutation body must be an object.");
  }
  const input = value as Record<string, unknown>;
  const objectRef = assertFieldPolicyObjectRef(requiredString(input.objectRef, "objectRef"));
  const fieldName = requiredString(input.fieldName, "fieldName");
  const scopeType = input.scopeType;
  if (scopeType !== "app" && scopeType !== "tenant" && scopeType !== "user") {
    throw error(400, "scopeType must be app, tenant, or user.");
  }
  const visibility = input.visibility;
  if (
    visibility !== undefined &&
    visibility !== null &&
    visibility !== "basic" &&
    visibility !== "advanced" &&
    visibility !== "hidden"
  ) {
    throw error(400, "visibility must be basic, advanced, hidden, or null.");
  }
  return {
    objectRef,
    fieldName,
    scopeType,
    defaultValue: nullableString(input.defaultValue, "defaultValue"),
    displayOrder: nullableNumber(input.displayOrder, "displayOrder"),
    help: nullableString(input.help, "help"),
    label: nullableString(input.label, "label"),
    locked: nullableBoolean(input.locked, "locked"),
    visibility: visibility ?? null,
  };
}

export async function createFieldPolicy(
  locals: App.Locals,
  input: FieldPolicyMutationInput,
): Promise<{ id: string | null }> {
  return withFieldPolicyCollection(locals, async (collection) => {
    const row = await collection.create(input);
    return { id: row.id ?? null };
  });
}

export async function updateFieldPolicy(
  locals: App.Locals,
  id: string,
  input: FieldPolicyMutationInput,
): Promise<{ id: string | null }> {
  return withFieldPolicyCollection(locals, async (collection) => {
    const row = await collection.get(id);
    if (!row) throw error(404, "Field-policy row not found.");
    assertFieldPolicyObjectRef(row.objectRef);
    Object.assign(row, input);
    await row.save();
    return { id: row.id ?? null };
  });
}

export async function deleteFieldPolicy(locals: App.Locals, id: string): Promise<{ ok: true }> {
  return withFieldPolicyCollection(locals, async (collection) => {
    const row = await collection.get(id);
    if (!row) throw error(404, "Field-policy row not found.");
    assertFieldPolicyObjectRef(row.objectRef);
    await row.delete();
    return { ok: true };
  });
}

export async function loadFieldPolicyEditorState(
  locals: App.Locals,
  objectRef: string,
): Promise<FieldPolicyEditorStateResult> {
  assertFieldPolicyObjectRef(objectRef);
  return withFieldPolicyCollection(locals, (collection) =>
    collection.getEditorState({ objectRef }),
  );
}

export async function resolveFieldPolicyBatch(
  locals: App.Locals,
  objectRefs: string[],
): Promise<FieldPolicyBatchResult> {
  const allowedObjectRefs = objectRefs.map(assertFieldPolicyObjectRef);
  return withFieldPolicyCollection(locals, (collection) =>
    collection.resolveBatch({ objectRefs: allowedObjectRefs }),
  );
}

export async function loadFieldPolicyAudit(
  locals: App.Locals,
  options: Parameters<FieldPolicyCollection["policyAudit"]>[0],
): Promise<FieldPolicyAuditSnapshot> {
  const objectRefs = options?.objectRefs?.map(assertFieldPolicyObjectRef) ?? [
    getStarterAppSettingObjectRef(),
  ];
  const countObjectRefs = options?.countObjectRefs?.map(assertFieldPolicyObjectRef);
  return withFieldPolicyCollection(locals, (collection) =>
    collection.policyAudit({ ...options, objectRefs, countObjectRefs }),
  );
}

export function fieldPolicyActionResponse(result: unknown): Response {
  if (result && typeof result === "object") {
    const record = result as Record<string, unknown>;
    if (record.ok === false && typeof record.status === "number") {
      const status = record.status;
      if (status >= 400 && status < 500) return json(result, { status });
    }
  }
  return json(result);
}

async function withFieldPolicyCollection<T>(
  locals: App.Locals,
  run: (collection: FieldPolicyCollection) => Promise<T>,
): Promise<T> {
  const membership = await requireTenantMembership(locals, locals.tenantId ?? null);
  try {
    return await withFieldPolicyMembership(membership, async () => {
      const collection = await FieldPolicyCollection.create({ db: await getAppDatabase() });
      return run(collection);
    });
  } catch (cause) {
    if (isHttpError(cause)) throw cause;
    const record = cause && typeof cause === "object" ? (cause as Record<string, unknown>) : {};
    const status = typeof record.status === "number" ? record.status : 500;
    if (status >= 400 && status < 500) {
      const message =
        typeof record.publicMessage === "string"
          ? record.publicMessage
          : cause instanceof Error
            ? cause.message
            : "Field-policy request was denied.";
      throw error(status, message);
    }
    throw error(500, "Field-policy request failed.");
  }
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw error(400, `${name} must be a non-empty string.`);
  }
  return value;
}

function assertFieldPolicyObjectRef(objectRef: string): string {
  if (objectRef !== getStarterAppSettingObjectRef()) {
    throw error(404, "Field-policy object is not exposed by this starter.");
  }
  return objectRef;
}

function nullableString(value: unknown, name: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw error(400, `${name} must be a string or null.`);
  return value;
}

function nullableNumber(value: unknown, name: string): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw error(400, `${name} must be a finite number or null.`);
  }
  return value;
}

function nullableBoolean(value: unknown, name: string): boolean | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "boolean") throw error(400, `${name} must be a boolean or null.`);
  return value;
}
