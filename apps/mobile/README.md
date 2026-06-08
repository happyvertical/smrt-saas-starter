# SMRT SaaS Mobile

This follows the Amaru mobile strategy:

- Kotlin Multiplatform owns shared contracts and sync behavior.
- Android has a minimal native shell; Jetpack Compose is the target UI layer as screens fill in.
- iOS uses SwiftUI.
- The mobile client consumes generated DTOs from `packages/mobile-contract`, not raw SMRT manifests at runtime.

Auth uses `/api/mobile/auth/*` on the web app:

- `GET /api/mobile/auth/providers` lists configured `@happyvertical/auth` OAuth/OIDC providers.
- `POST /api/mobile/auth/start` returns the authorization URL, state, and PKCE verifier.
- `POST /api/mobile/auth/complete` exchanges the code and returns a `smrt-users` bearer session.
- `GET /api/mobile/session` bootstraps tenant, plan, usage threshold, and feature state from that bearer token.

The default CI validation is a shell-level check so the repo can validate on machines without Android SDK or Xcode.
