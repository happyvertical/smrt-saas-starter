# @happyvertical/smrt-saas-mobile

Kotlin Multiplatform shell (androidApp, iosApp, shared) that consumes the web
app's mobile endpoints through `@happyvertical/smrt-saas-mobile-contract` DTOs.

## Rules

- Mobile consumes only the generated contract DTOs; never read raw SMRT
  manifests or invent ad-hoc response shapes. Contract changes start in
  `packages/mobile-contract` (`pnpm run mobile:generate`), and the regenerated
  Kotlin/Swift surface is committed.
- Auth uses the web app's `/api/mobile/auth/*` endpoints (OIDC + PKCE) and the
  bearer session from `/api/mobile/session`; redirect URIs must be registered
  in the server allow list.
- Shell validation (`validate:shell`) is the default gate; native Android/iOS
  builds (`validate:android`, `validate:ios`) run in CI and need local
  toolchains (Java 21, Xcode) when run by hand.
- Mobile remains shell-validated-first while the starter web surface settles;
  do not expand native scope without checking the current direction.

## Validation

```sh
pnpm run mobile:generate
pnpm run mobile:validate              # shell validation
pnpm run mobile:validate:native      # Android + iOS builds (local toolchains)
```
