# Browser shell WebMCP inventory

Browser tools are only mounted when `document.modelContext` is available. They do not grant tenant authority; existing SvelteKit actions and endpoints authorize every server effect.

| Tool | Effect | Authority / completion |
| --- | --- | --- |
| `starter_shell_navigate` | read | Available mounted navigation only; returns `navigation_started`, then hands off to SvelteKit navigation with a visible destination acknowledgement. |
| `starter_shell_set_theme` | local preference | ThemeProvider public context; visible acknowledgement. |
| `starter_shell_switch_tenant` | write | Existing `/api/tenant/switch` membership authorization; invalidated route and visible acknowledgement. |
| `starter_shell_prepare_billing_portal` | provider continuation | Existing `/api/billing/portal` authorization and provider session; explicit confirmation prepares a portal URL for human/provider continuation without opening or approving it. |
| `starter_shell_prepare_subscription_checkout` | provider continuation | Existing `/api/billing/checkout` authorization and plan validation; explicit confirmation prepares a checkout URL for human/provider continuation without opening or approving it. |
| `starter_shell_fill_form` | staged UI | Only enabled non-hidden fields in a marked mounted form; no server effect. |
| `starter_shell_submit_form` | existing non-financial action | The existing route must return a successful authorized SvelteKit action before the visible acknowledgement. Server denials remain denials. |

Marked current forms are member invitation, prompt override, and language override. Each prompt and language action includes its server-owned key (and locale for languages), so a tool can target exactly one visible form; ambiguous action identifiers are rejected. Billing portal and subscription checkout are dedicated confirmed provider-continuation tools. Checkout uses the existing public endpoint's JSON representation, while the `PlanPicker` remains the normal interactive selection flow. Report/job tools are owned by issue #87 and remain pending its server command and approval contract.

Each shell mount owns its pending HTTP requests. Changing the selected tenant, user, role/permissions, or route destroys that mount, aborts its requests, and suppresses their late success acknowledgements. An aborted request may already have reached the server; cancellation does not promise rollback of an authorized server action. The published bespoke tool API currently supplies no caller execution signal, so native caller cancellation remains an upstream integration gap.
