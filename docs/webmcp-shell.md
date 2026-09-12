# Browser shell WebMCP inventory

Browser tools are only mounted when `document.modelContext` is available. They do not grant tenant authority; existing SvelteKit actions and endpoints authorize every server effect.

| Tool | Effect | Authority / completion |
| --- | --- | --- |
| `starter_shell_navigate` | read | Available mounted navigation only; SvelteKit navigation and visible heading acknowledgement. |
| `starter_shell_set_theme` | local preference | ThemeProvider public context; visible acknowledgement. |
| `starter_shell_switch_tenant` | write | Existing `/api/tenant/switch` membership authorization; invalidated route and visible acknowledgement. |
| `starter_shell_fill_form` | staged UI | Only enabled non-hidden fields in a marked mounted form; no server effect. |
| `starter_shell_submit_form` | existing action | Native form submission reaches the route's existing server authorization; visible acknowledgement means submission was observed. |

Marked current forms are member invitation, prompt override, language override, and billing portal. Subscription checkout remains the existing PlanPicker flow and is not registered until its mounted control has a stable action identity. Report/job tools are owned by issue #87 and remain pending its server command and approval contract.
