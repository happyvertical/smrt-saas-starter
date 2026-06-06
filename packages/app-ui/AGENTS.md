# @happyvertical/smrt-saas-ui

Reusable SaaS UI components for the starter.

## Rules

- Prefer `@happyvertical/smrt-svelte` components and tokens.
- Keep components generic; app-specific route wiring belongs in `apps/web`.
- Use icons from `lucide-svelte` for actions.
- Do not hard-code tenant or product names.

## Validation

```sh
pnpm --filter @happyvertical/smrt-saas-ui typecheck
```
