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

## Thresholds

Thresholds reference tenant usage metrics:

- `ai.tokens.total`
- `mcp.calls`
- future app metrics such as `files.storage_bytes`, `messages.sent`, or `jobs.executions`

The starter records right-dock/runtime MCP tool calls as `mcp.calls` usage
records with `source: "smrt-app-mcp"`. Those records are summarized by tenant
and compared against plan thresholds before each allowed tool invocation.

Threshold enforcement modes:

- `observe`: show usage only
- `warn`: show warnings but allow the action
- `block`: deny the gated action after the limit is reached

## Billing Provider

Stripe is the concrete v1 provider. The starter injects a billing provider interface so the app does not call Stripe directly from SMRT objects or Svelte routes.
