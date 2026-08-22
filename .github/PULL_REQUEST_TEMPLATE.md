<!--
PRs target `dev`. Use Conventional Commit style in the title (e.g. feat(web): …).
See CONTRIBUTING.md for setup, validation, and the upstream-coordination rule.
-->

## What & why

<!-- What does this change and why? Link any related issue (Closes #…). -->

## How it was tested

<!-- Commands run and results. -->

- [ ] `pnpm check` passes
- [ ] Targeted checks where relevant (`pnpm run objects:test`, `pnpm typecheck`, `test:e2e`, `pnpm run mobile:validate`)

## Checklist

- [ ] No secrets, tokens, or decrypted values committed
- [ ] No local workarounds for upstream `@happyvertical/*` bugs (filed upstream + recorded in `docs/upstream-work.md` instead)
- [ ] Docs updated if behavior or setup changed
