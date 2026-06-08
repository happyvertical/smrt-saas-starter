# Subscriptions And Entitlements

Plans grant features and thresholds.

## Features

Feature keys should align with `smrt-features`:

- `chat.agent`
- `mcp.read_tools`
- `mcp.write_tools`
- `exports.bulk`
- `languages.ai_translate`
- `prompts.tenant_overrides`

`/app/settings` renders effective prompt and language values for every tenant.
Saving prompt templates requires `prompts.tenant_overrides`; saving language
templates requires `languages.ai_translate`. The demo tenant starts on Growth,
so the page shows the resolved values while the save controls remain gated until
the tenant moves to Scale.

## Thresholds

Thresholds reference tenant usage metrics:

- `ai.tokens.total`
- `chat.messages`
- `mcp.calls`
- future app metrics such as `files.storage_bytes`, `messages.sent`, or `jobs.executions`

The starter records right-dock/runtime MCP tool calls as `mcp.calls` usage
records with `source: "smrt-app-mcp"`. Those records are summarized by tenant
and compared against plan thresholds before each allowed tool invocation.
Right-dock chat sends are recorded as `chat.messages` with
`source: "smrt-chat"` and are checked before the user message is persisted.

The admin right dock uses `/api/chat` to create a tenant-scoped `smrt-chat`
agent session. The chat service allowlists runtime tools from the tenant's
feature snapshot, then routes common usage, billing, prompt, and subscription
questions through the shared MCP executor:

- `tenant.usage.summary`
- `tenant.subscription.summary`
- `tenant.prompt.preview`
- `tenant.subscription.update`

`tenant.subscription.update` is intentionally non-mutating in the starter. It
returns `requires_confirmation`; actual plan changes continue through the
billing checkout or customer portal.

Threshold enforcement modes:

- `observe`: show usage only
- `warn`: show warnings but allow the action
- `block`: deny the gated action after the limit is reached

## Billing Provider

Stripe is the concrete v1 provider. The starter injects a billing provider interface so the app does not call Stripe directly from SMRT objects or Svelte routes.

Checkout sessions write the tenant id and plan id into Stripe metadata. The
webhook route verifies the Stripe signature, normalizes checkout/subscription
events, and idempotently upserts the tenant subscription row with Stripe
customer, subscription, checkout session, status, plan, and current period
fields. Customer portal access is hidden until a real Stripe customer id exists.
