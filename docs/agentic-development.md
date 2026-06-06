# Agentic Development

This repo is preconfigured for agent-assisted development.

## MCP Servers

`.mcp.json` registers:

- `smrt-dev-mcp` for SMRT package knowledge, review context, architecture context, and code generation
- `happyvertical-sdk-mcp` for SDK package knowledge
- Playwright MCP for local UI verification
- Svelte docs MCP for SvelteKit/Svelte 5 work

Both HappyVertical MCP commands authenticate to GitHub Packages with `gh auth token` and set `GH_PACKAGES_TOKEN`, `GITHUB_PACKAGES_TOKEN`, and `NODE_AUTH_TOKEN`.

## Agent Files

- Root `AGENTS.md` defines repo-level behavior.
- Each package/app has an `AGENTS.md` and `CLAUDE.md` shim.
- Package instructions are cumulative with the root.

## Secrets

- Committed deploy secret files live under `manifests/**.secret.yaml` and must be SOPS-encrypted.
- Runtime tenant secrets should use SMRT and SDK secret packages.
- Human credential sharing uses Warden. Do not paste decrypted secrets into issues, docs, prompts, logs, or PRs.

## Local Validation

```sh
token="$(gh auth token)"
GH_PACKAGES_TOKEN="$token" GITHUB_PACKAGES_TOKEN="$token" NODE_AUTH_TOKEN="$token" pnpm install
pnpm check
```
