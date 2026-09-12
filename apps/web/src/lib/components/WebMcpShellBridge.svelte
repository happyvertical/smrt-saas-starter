<script lang="ts">
  import { useWebMcpTool } from "@happyvertical/smrt-svelte";
  import { getThemeContext } from "@happyvertical/smrt-ui/themes";
  import { onDestroy } from "svelte";
  import { deserialize } from "$app/forms";
  import { goto, invalidateAll } from "$app/navigation";
  import { planShellFormFill } from "./shell-form-fill";
  import { createShellRequestLifetime } from "./shell-request-lifetime";

  export interface ShellDestination {
    href: string;
    label: string;
  }

  export interface ShellTenant {
    tenantId: string;
    tenantLabel: string;
  }

  let { activePath, destinations, tenants, acknowledge }: {
    activePath: string;
    destinations: readonly ShellDestination[];
    tenants: readonly ShellTenant[];
    acknowledge: (message: string) => void;
  } = $props();

  const lifetime = createShellRequestLifetime();
  onDestroy(() => lifetime.dispose());
  const theme = getThemeContext();

  function respond(value: Record<string, unknown>): string {
    return JSON.stringify({ ok: true, ...value });
  }

  function reject(reason: string): string {
    return JSON.stringify({ ok: false, reason });
  }

  function formFor(action: unknown): HTMLFormElement | undefined {
    if (typeof action !== "string") return undefined;
    const matches = Array.from(document.querySelectorAll<HTMLFormElement>("form[data-webmcp-action]")).filter(
      (form) => form.dataset.webmcpAction === action,
    );
    return matches.length === 1 ? matches[0] : undefined;
  }

  useWebMcpTool(() => ({
    name: "starter_shell_navigate",
    description: "Open an available SMRT Starter workspace destination and confirm its visible heading.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["href"],
      properties: {
        href: { type: "string", enum: destinations.map((destination) => destination.href) },
      },
    },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    execute: async (args, options) => {
      if (options?.signal?.aborted) return reject("cancelled");
      const href = typeof args.href === "string" ? args.href : "";
      const destination = destinations.find((candidate) => candidate.href === href);
      if (!destination) return reject("not_available");

      // A native WebMCP execution is tied to this document. Awaiting SvelteKit
      // navigation tears down the tool registration before Chromium can settle
      // the command promise. Acknowledge the accepted destination first, then
      // hand navigation to the existing client router after the response.
      acknowledge(`Opening ${destination.label}.`);
      void goto(destination.href);
      return respond({
        completion: "navigation_started",
        href: destination.href,
      });
    },
  }));

  useWebMcpTool(() => ({
    name: "starter_shell_set_theme",
    description: "Set this browser session's workspace color scheme.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["colorScheme"],
      properties: {
        colorScheme: { type: "string", enum: ["light", "dark", "system"] },
      },
    },
    annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false },
    execute: (args, options) => {
      if (options?.signal?.aborted) return reject("cancelled");
      const colorScheme = args.colorScheme;
      if (colorScheme !== "light" && colorScheme !== "dark" && colorScheme !== "system") {
        return reject("invalid_request");
      }

      theme.setColorScheme(colorScheme);
      acknowledge(`Color scheme set to ${colorScheme}.`);
      return respond({ acknowledgement: "visible", completion: "applied", colorScheme });
    },
  }));

  useWebMcpTool(() => ({
    name: "starter_shell_switch_tenant",
    description: "Switch the current workspace tenant through the existing membership-authorized server endpoint.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["tenantId", "confirm"],
      properties: {
        tenantId: { type: "string", enum: tenants.map((tenant) => tenant.tenantId) },
        confirm: { type: "boolean", description: "Must be true to apply the tenant switch." },
      },
    },
    annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false },
    execute: (args, options) => lifetime.run(async (signal) => {
      if (args.confirm !== true) return reject("confirmation_required");
      const tenantId = typeof args.tenantId === "string" ? args.tenantId : "";
      const tenant = tenants.find((candidate) => candidate.tenantId === tenantId);
      if (!tenant) return reject("not_available");

      const response = await fetch("/api/tenant/switch", {
        method: "POST",
        credentials: "same-origin",
        signal,
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({ tenantId, returnTo: activePath }),
      });
      if (!response.ok) return reject(response.status === 403 ? "forbidden" : "switch_failed");

      signal.throwIfAborted();
      acknowledge(`Switched to ${tenant.tenantLabel}.`);
      // The endpoint has completed the membership-authorized switch. Like
      // navigation, invalidating the document must not abort the native tool
      // before its completion response is delivered.
      void invalidateAll();
      return respond({ acknowledgement: "visible", completion: "switched", tenantId });
    }, options?.signal),
  }));

  useWebMcpTool(() => ({
    name: "starter_shell_prepare_billing_portal",
    description: "Prepare the existing authorized billing portal and return its provider continuation URL; this does not open or approve it.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["confirm"],
      properties: {
        confirm: { type: "boolean", description: "Must be true to prepare the provider portal." },
      },
    },
    annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: true },
    execute: (args, options) => lifetime.run(async (signal) => {
      if (args.confirm !== true) return reject("confirmation_required");
      const response = await fetch("/api/billing/portal?format=json", {
        credentials: "same-origin",
        signal,
        headers: { accept: "application/json" },
      });
      if (!response.ok) {
        return reject(response.status === 403 ? "forbidden" : "provider_unavailable");
      }
      const payload = (await response.json()) as { portalUrl?: unknown; continuationRequired?: unknown };
      const portalUrl = typeof payload.portalUrl === "string" ? payload.portalUrl : null;
      if (!portalUrl) return reject("provider_unavailable");
      signal.throwIfAborted();
      acknowledge("Billing portal is ready for provider continuation.");
      return respond({
        acknowledgement: "visible",
        completion: "provider_continuation_required",
        portalUrl,
      });
    }, options?.signal),
  }));

  useWebMcpTool(() => ({
    name: "starter_shell_prepare_subscription_checkout",
    description: "Prepare the existing authorized subscription checkout for a plan and return its provider continuation URL; this does not open or approve it.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["planId", "confirm"],
      properties: {
        planId: { type: "string", description: "Existing subscription plan key." },
        confirm: { type: "boolean", description: "Must be true to prepare the provider checkout." },
      },
    },
    annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: true },
    execute: (args, options) => lifetime.run(async (signal) => {
      if (args.confirm !== true) return reject("confirmation_required");
      const planId = typeof args.planId === "string" ? args.planId : "";
      if (!planId) return reject("invalid_request");

      const response = await fetch(`/api/billing/checkout?format=json&planId=${encodeURIComponent(planId)}`, {
        credentials: "same-origin",
        signal,
        headers: { accept: "application/json" },
      });
      if (!response.ok) {
        return reject(response.status === 403 ? "forbidden" : "provider_unavailable");
      }
      const payload = (await response.json()) as { checkoutUrl?: unknown; continuationRequired?: unknown };
      const checkoutUrl = typeof payload.checkoutUrl === "string" ? payload.checkoutUrl : null;
      if (!checkoutUrl) return reject("provider_unavailable");

      signal.throwIfAborted();
      acknowledge("Subscription checkout is ready for provider continuation.");
      return respond({
        acknowledgement: "visible",
        completion: "provider_continuation_required",
        checkoutUrl,
      });
    }, options?.signal),
  }));

  useWebMcpTool(() => ({
    name: "starter_shell_fill_form",
    description: "Fill editable visible fields in a mounted, existing workspace form without submitting it.",
    inputSchema: {
      type: "object", additionalProperties: false, required: ["action", "fields"],
      properties: { action: { type: "string" }, fields: { type: "object" } },
    },
    annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false },
    execute: (args, options) => {
      if (options?.signal?.aborted) return reject("cancelled");
      const form = formFor(args.action);
      if (!form || !args.fields || typeof args.fields !== "object" || Array.isArray(args.fields)) return reject("not_available");
      const fields = Array.from(form.elements).filter((element): element is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement =>
        element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement,
      );
      const updates = planShellFormFill(fields, args.fields as Record<string, unknown>);
      if (!updates) return reject("invalid_field");
      for (const { field, value } of updates) {
        field.value = value;
        field.dispatchEvent(new Event("input", { bubbles: true }));
        field.dispatchEvent(new Event("change", { bubbles: true }));
      }
      acknowledge("Form fields updated.");
      return respond({ acknowledgement: "visible", completion: "filled" });
    },
  }));

  useWebMcpTool(() => ({
    name: "starter_shell_submit_form",
    description: "Submit a mounted non-financial workspace form through its normal authorized server action.",
    inputSchema: {
      type: "object", additionalProperties: false, required: ["action"],
      properties: { action: { type: "string" } },
    },
    annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
    execute: (args, options) => lifetime.run(async (signal) => {
      const form = formFor(args.action);
      if (!form) return reject("not_available");
      const response = await fetch(form.action, {
        method: "POST",
        credentials: "same-origin",
        signal,
        headers: { accept: "application/json", "x-sveltekit-action": "true" },
        body: new FormData(form),
      });
      if (!response.ok) return reject(response.status === 403 ? "forbidden" : "submission_failed");

      const result = deserialize(await response.text());
      if (result.type === "failure") return reject(result.status === 403 ? "forbidden" : "submission_failed");
      if (result.type !== "success") return reject("submission_failed");

      signal.throwIfAborted();
      acknowledge("Existing authorized form submitted.");
      void invalidateAll();
      return respond({ acknowledgement: "visible", completion: "submitted" });
    }, options?.signal),
  }));
</script>

