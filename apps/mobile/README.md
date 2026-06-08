# SMRT SaaS Mobile

This follows the Amaru mobile strategy:

- Kotlin Multiplatform owns shared contracts and sync behavior.
- Android has a minimal native shell; Jetpack Compose is the target UI layer as screens fill in.
- iOS uses SwiftUI.
- The mobile client consumes generated DTOs from `packages/mobile-contract` at `shared/src/commonMain/kotlin/generated/Contract.kt` and `iosApp/SmrtStarter/MobileContract.swift`, not raw SMRT manifests at runtime.
- Camera and microphone support follows Amaru's native adapter strategy: KMP defines the shared capability model, Android checks native hardware and permissions, and iOS checks AVFoundation privacy state.

Auth uses `/api/mobile/auth/*` on the web app:

- `GET /api/mobile/auth/providers` lists configured `@happyvertical/auth` OAuth/OIDC providers.
- `POST /api/mobile/auth/start` returns the authorization URL, state, and PKCE verifier.
- `POST /api/mobile/auth/complete` exchanges the code and returns a `smrt-users` bearer session.
- `GET /api/mobile/session` bootstraps tenant, plan, usage threshold, and feature state from that bearer token.

## Device Interfaces

The shared layer defines `DeviceCapabilityAdapter` plus camera and microphone capability DTOs. Feature modules should consume that interface rather than platform-specific APIs directly.

Android declares `CAMERA` and `RECORD_AUDIO` while keeping camera and microphone hardware optional for broad installability. It exposes `AndroidDeviceCapabilityAdapter`, which reports permissions as `not_determined` until a permission request flow records request history.

iOS declares `NSCameraUsageDescription` and `NSMicrophoneUsageDescription` in `iosApp/SmrtStarter/Info.plist`, exposes `DeviceCapabilityBridge` from the SwiftUI shell, and is wired through `iosApp/project.yml` for XcodeGen.

The default CI validation is a shell-level check so the repo can validate on machines without Android SDK or Xcode.

Pull request CI also runs native shell checks:

```sh
pnpm mobile:validate:android
pnpm mobile:validate:ios
```

Android validation uses the committed Gradle wrapper, requires Java 21, and requires `ANDROID_HOME` or `ANDROID_SDK_ROOT` when the SDK is not installed in a standard location. iOS validation requires macOS, Xcode, and XcodeGen.

When XcodeGen is available locally:

```sh
cd apps/mobile/iosApp
xcodegen generate
xcodebuild -project SmrtStarter.xcodeproj -scheme SmrtStarter -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' build CODE_SIGNING_ALLOWED=NO
```
