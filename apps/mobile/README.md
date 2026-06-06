# SMRT SaaS Mobile

This follows the Amaru mobile strategy:

- Kotlin Multiplatform owns shared contracts and sync behavior.
- Android uses Jetpack Compose.
- iOS uses SwiftUI.
- The mobile client consumes generated DTOs from `packages/mobile-contract`, not raw SMRT manifests at runtime.

The default CI validation is a shell-level check so the repo can validate on machines without Android SDK or Xcode.
