# Agentic Development

This repo is preconfigured for agent-assisted development.

## MCP Servers

`.mcp.json` registers:

- `smrt-dev-mcp` for SMRT package knowledge, review context, architecture context, and code generation
- `happyvertical-sdk-mcp` for SDK package knowledge
- Playwright MCP for local UI verification
- Svelte docs MCP for SvelteKit/Svelte 5 work

Both HappyVertical MCP servers launch with plain `npx` — their packages are on public npm, so no token is required.

The HappyVertical MCP pins in `.mcp.json` must match the pnpm catalog;
`pnpm deps:check` (part of `pnpm check`) fails on drift. These dev-time
servers are distinct from `@happyvertical/smrt-app-mcp`, the runtime MCP
surface the web app exposes to tenants at `/api/mcp/*`.

## Agent Files

- Root `AGENTS.md` defines repo-level behavior.
- Each package/app has an `AGENTS.md` and `CLAUDE.md` shim.
- Package instructions are cumulative with the root.

## Skills And Preview

- `.claude/skills/run-web` is the verified recipe for launching and driving
  the web dev server (Postgres prereq, dev-auth fallback, port gotchas).
- `.claude/launch.json` defines the `web` preview config so Claude Code's
  preview tools can start and screenshot the app directly.

## Upstream Blockers

Upstream bugs or missing APIs in `@happyvertical/*` packages are filed as
issues on the owning repo (`happyvertical/smrt` or `happyvertical/sdk`),
recorded in `docs/upstream-work.md`, and waited out — agents must not vendor,
fork, or patch around them. See `AGENTS.md` Upstream Coordination for the
exact rules.

## Testing

`docs/testing.md` lays out the test layers (unit, route, DB smoke, mobile
contract, e2e, runtime images) and which commands to run for each kind of
change.

## Secrets

- Committed deploy secret files live under `manifests/**.secret.yaml` and must be SOPS-encrypted.
- Runtime tenant secrets should use SMRT and SDK secret packages.
- Human credential sharing uses Warden. Do not paste decrypted secrets into issues, docs, prompts, logs, or PRs.

## Local Validation

```sh
pnpm install   # @happyvertical/* resolve from public npm — no token needed
pnpm check
```
