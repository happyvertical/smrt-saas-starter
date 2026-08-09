import type {
  FieldPolicyAuditSnapshot,
  FieldPolicyBatchResult,
  FieldPolicyEditorStateResult,
} from "@happyvertical/smrt-fields";
import type {
  FieldPolicyControlPanelAdapter,
  FieldPolicyEditorMutation,
  ObjectFormPolicyClient,
} from "@happyvertical/smrt-fields/svelte";
import { createClient } from "@happyvertical/smrt-virt-client";

const policyBasePath = "/api/field-policies";

async function policyRequest<T>(
  path: string,
  method: "POST" | "PUT" | "DELETE",
  body?: unknown,
): Promise<T> {
  const response = await fetch(`${policyBasePath}${path}`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) : undefined;
  } catch {
    payload = text;
  }
  if (!response.ok) {
    const record =
      payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
    const nested =
      record.error && typeof record.error === "object"
        ? (record.error as Record<string, unknown>)
        : record;
    const message =
      typeof nested.message === "string"
        ? nested.message
        : typeof record.message === "string"
          ? record.message
          : `Field-policy request failed (${response.status}).`;
    const requestError = new Error(message) as Error & { status: number; body?: unknown };
    requestError.status = response.status;
    requestError.body = payload;
    throw requestError;
  }
  return payload as T;
}

export const fieldPolicyAdapter: FieldPolicyControlPanelAdapter & ObjectFormPolicyClient = {
  load: ({ objectRef }) =>
    policyRequest<FieldPolicyEditorStateResult>("/editor-state", "POST", { objectRef }),
  create: (input: FieldPolicyEditorMutation) => policyRequest("", "POST", input),
  update: ({ id, ...input }) => policyRequest(`/${encodeURIComponent(id)}`, "PUT", input),
  delete: ({ id }) => policyRequest(`/${encodeURIComponent(id)}`, "DELETE"),
  loadAudit: (input) =>
    policyRequest<FieldPolicyAuditSnapshot>("/policy-audit", "POST", input ?? {}),
  resolveBatch: (input) => policyRequest<FieldPolicyBatchResult>("/resolve", "POST", input),
};

const client = createClient("/api/generated");
export const starterAppSettingsClient = client.starterappsettings;
