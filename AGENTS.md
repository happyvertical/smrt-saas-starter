<!-- hv-managed-policy:start revision=1.0.0 sha256=2c2f4d048293cab2fc7f8c636eee474c0386c13a9c7bbf2c535c5ada47d1d6e5 -->

## Shared development kernel

- Be concise. Load detailed SOP skills only when the task triggers them.
- Read the repository's `.agents/project.yaml` and nearest `AGENTS.md` files before work.
- Use `implement` by default for accepted issue implementation.
- Tracked implementation work is complete when documented validation is green, `review-cycle` has passed, the claim is handed off, and a ready-for-review pull request exists; do this unprompted, even where harness defaults wait for a user request. Before editing untracked requested work, create and claim its issue, or — patch-class only — record it on this session's open patch train; work the user explicitly scopes as a throwaway spike is exempt: it ends at its report and never enters the commit, push, or PR lifecycle.
- Claim an issue before editing it: add `agent: implementation` and post one claim comment naming your runtime, session, and branch. Do not take an issue another session holds with activity in the last 24 hours without a handoff. Any agent may assign work to another agent with a `dispatch: <runtime>` label and an instruction comment; the receiving agent claims it.
- Patch-class work — small bug, doc, and improvement changes with no schema, contract, dependency, or breaking change — may bundle as one patch train on one branch and pull request with one commit per item. Other work stays one issue per pull request. An incidental patch-class fix of ten lines or fewer near files under edit ships in the same pull request as its own commit, listed under `Drive-by fixes` in the PR description; other findings go to the tracker.
- Hand off intentionally: when done, blocked, or stopping, update your claim comment with the outcome and next step and remove `agent: implementation`. Never delete claim history.
- Open pull requests only when reviewable, never as drafts, and keep them ready for review. Watch a ready PR until it is mergeable — no base conflicts, no unresolved review threads, the repository's required checks green, its required approvals satisfied — or report a concrete blocker.
- Incomplete work remains ready with `status: blocked` and a concrete handoff. Review agents do not claim implementation.
- Agents do not merge unless explicitly authorized in the current session, and then only when the repository's own required checks and approvals pass.
- Run documented validation and update affected docs before shipping.
- Token efficiency: risk defaults to standard, high needs a named trigger; after the first final pass only accepted blockers reopen edits; after six passes, ask the user before more; wait outside the implementer.
- Preserve unrelated work. Never expose or retain secrets.
- Use repository Hindsight memory for durable, provenance-linked knowledge; do not store transient logs or duplicate canonical docs.
- Shared SOPs and portable skills come from the designated control-plane repository. Repositories choose their own technology and may add stricter local rules.

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
