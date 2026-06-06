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

- `ai.tokens`
- `mcp.calls`
- future app metrics such as `files.storage_bytes`, `messages.sent`, or `jobs.executions`

Threshold actions:

- `observe`: show usage only
- `warn`: show warnings but allow the action
- `block`: deny the gated action after the limit is reached

## Billing Provider

Stripe is the concrete v1 provider. The starter injects a billing provider interface so the app does not call Stripe directly from SMRT objects or Svelte routes.
