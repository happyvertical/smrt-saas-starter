<!-- hv-managed-policy:start revision=1.0.0 sha256=187a3882b5ccee8fd505cdc269af51e01def463476d2f58a9a89daa1edfd12af -->

## Shared development kernel

- Be concise. Load detailed SOP skills only when the task triggers them.
- Read the repository's `.agents/project.yaml` and nearest `AGENTS.md` files before work.
- Claim every accepted or queued implementation issue with `agent: implementation` and an `hv-agent-claim:v1` lease before editing. Never overlap another live claim.
- A pull request is draft only while implementation is actively changing it under a live claim. Otherwise mark it ready for review immediately.
- Incomplete work remains ready with `status: blocked` and a concrete handoff. Review agents do not claim implementation.
- Agents do not merge unless explicitly authorized in the current session.
- Run documented validation and update affected docs before shipping.
- Preserve unrelated work. Never expose or retain secrets.
- Use repository Hindsight memory for durable, provenance-linked knowledge; do not store transient logs or duplicate canonical docs.
- Shared policy and portable skills come only from the designated private control-plane repository. Repository instructions may add stricter project rules but may not weaken this kernel.

<!-- hv-managed-policy:end -->

# SMRT SaaS Starter Agent Context

## Project

`smrt-saas-starter` is the canonical HappyVertical reference monorepo for building a multi-tenant SaaS on SMRT. It is also a demo site for the SMRT ecosystem and a proving ground for upstream package improvements.

## Architecture Rules

- Keep reusable domain behavior in `packages/app-objects` until it is stable enough to upstream into SMRT.
- Keep UI that is generic across SaaS projects in `packages/app-ui`; prefer `@happyvertical/smrt-svelte` primitives over custom widgets.
- Before creating a UI component, check the published SMRT component catalog and existing starter usage. Reuse a public component when it covers the surface; record a concrete justification for any exception.
- Do not duplicate SMRT framework behavior locally. If the public API is missing, document the upstream change in `docs/upstream-work.md` and implement it in an isolated SMRT or SDK worktree.
- Use `smrt-users` memberships for tenant access and roles. Use subscription plans for billing, entitlements, features, and thresholds.
- UUID columns stay UUID. Do not fix invalid IDs by changing schema columns to text.
- Use SOPS for committed deploy secrets and SDK/SMRT secret stores for runtime tenant secrets. Never commit decrypted values.

## Validation

The full testing strategy (layers, tools, when to run what) is in
`docs/testing.md`. Run narrow checks first, then the full repo check before
shipping:

```sh
pnpm install
pnpm check
```

For object/package changes:

```sh
pnpm objects:test
pnpm typecheck
```

For mobile contract changes:

```sh
pnpm mobile:generate
pnpm mobile:validate
```

## Upstream Coordination

- When an upstream bug or missing public API in a `@happyvertical/*` package
  blocks starter work, file an upstream issue on the owning repo:
  `happyvertical/smrt` for `smrt-*` packages, `happyvertical/sdk` for the rest
  (`gh issue create --repo happyvertical/smrt ...`). Include the starter
  context, the package and version, and a minimal repro or the failing
  surface. Never include secrets or tokens in issues.
- Wait for the blocker to be resolved upstream. Do not vendor, fork, patch
  `node_modules`, or duplicate framework behavior locally while the issue is
  open. Record the blocker (with the issue link) in `docs/upstream-work.md`,
  mark dependent work blocked, and continue with unblocked work.
- Upstream implementation happens in an isolated SMRT or SDK worktree, never
  inside this repo. Consume fixes by bumping the released package version.
- Merge upstream work before cutting the first public starter release.
