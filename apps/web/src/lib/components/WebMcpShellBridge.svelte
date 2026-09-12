<script lang="ts">
  import { goto, invalidateAll } from "$app/navigation";
  import { getThemeContext } from "@happyvertical/smrt-ui/themes";
  import { useWebMcpTool } from "@happyvertical/smrt-svelte";

  export interface ShellDestination {
    href: string;
    label: string;
  }

  export interface ShellTenant {
    tenantId: string;
    tenantLabel: string;
  }

  let { activePath, destinations, tenants }: {
    activePath: string;
    destinations: readonly ShellDestination[];
    tenants: readonly ShellTenant[];
  } = $props();

  const theme = getThemeContext();
  let acknowledgement = $state("");

  function respond(value: Record<string, unknown>): string {
    return JSON.stringify({ ok: true, ...value });
  }

  function reject(reason: string): string {
    return JSON.stringify({ ok: false, reason });
  }

  function acknowledge(message: string): void {
    acknowledgement = message;
  }

  function formFor(action: unknown): HTMLFormElement | undefined {
    if (typeof action !== "string") return undefined;
    return Array.from(document.querySelectorAll<HTMLFormElement>("form[data-webmcp-action]")).find(
      (form) => form.dataset.webmcpAction === action,
    );
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
    execute: async (args) => {
      const href = typeof args.href === "string" ? args.href : "";
      const destination = destinations.find((candidate) => candidate.href === href);
      if (!destination) return reject("not_available");

      await goto(destination.href);
      const heading = document.querySelector("main h1, h1")?.textContent?.trim();
      acknowledge(`Opened ${heading || destination.label}.`);
      return respond({
        acknowledgement: "visible",
        completion: "navigated",
        href: destination.href,
        heading: heading || destination.label,
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
    execute: (args) => {
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
    execute: async (args) => {
      if (args.confirm !== true) return reject("confirmation_required");
      const tenantId = typeof args.tenantId === "string" ? args.tenantId : "";
      const tenant = tenants.find((candidate) => candidate.tenantId === tenantId);
      if (!tenant) return reject("not_available");

      const response = await fetch("/api/tenant/switch", {
        method: "POST",
        credentials: "same-origin",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({ tenantId, returnTo: activePath }),
      });
      if (!response.ok) return reject(response.status === 403 ? "forbidden" : "switch_failed");

      await invalidateAll();
      acknowledge(`Switched to ${tenant.tenantLabel}.`);
      return respond({ acknowledgement: "visible", completion: "switched", tenantId });
    },
  }));

  useWebMcpTool(() => ({
    name: "starter_shell_fill_form",
    description: "Fill editable visible fields in a mounted, existing workspace form without submitting it.",
    inputSchema: {
      type: "object", additionalProperties: false, required: ["action", "fields"],
      properties: { action: { type: "string" }, fields: { type: "object" } },
    },
    annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false },
    execute: (args) => {
      const form = formFor(args.action);
      if (!form || !args.fields || typeof args.fields !== "object" || Array.isArray(args.fields)) return reject("not_available");
      for (const [name, value] of Object.entries(args.fields)) {
        const field = Array.from(form.elements).find((element) =>
          element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement
            ? element.name === name && element.type !== "hidden" && !element.disabled
            : false,
        ) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | undefined;
        if (!field || typeof value !== "string") return reject("invalid_field");
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
    description: "Submit a mounted existing workspace form through its normal server action.",
    inputSchema: {
      type: "object", additionalProperties: false, required: ["action"],
      properties: { action: { type: "string" } },
    },
    annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
    execute: (args) => {
      const form = formFor(args.action);
      if (!form) return reject("not_available");
      acknowledge("Submitting existing authorized form.");
      form.requestSubmit();
      return respond({ acknowledgement: "visible", completion: "submitted" });
    },
  }));
</script>

<p class="sr-only" aria-live="polite" aria-atomic="true" data-webmcp-ack>{acknowledgement}</p>

<style>
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
