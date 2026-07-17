import AVFoundation
import SwiftUI
import UIKit

@main
struct SmrtStarterApp: App {
  var body: some Scene {
    WindowGroup {
      ContentView()
    }
  }
}

struct ContentView: View {
  private let baseUrl = "http://localhost:5173"
  private let capabilities = DeviceCapabilityBridge().currentCapabilities()

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text("SMRT Starter")
        .font(.title)
      Text("Tenant-aware subscriptions, usage, and agent tools.")
        .font(.body)
      Text("OIDC PKCE login starts at \(baseUrl)/api/mobile/auth/start")
        .font(.callout)
      Text("Session bootstrap uses \(baseUrl)/api/mobile/session with an Authorization bearer token.")
        .font(.callout)
      Text("Device interfaces")
        .font(.headline)
      ForEach(capabilities.summaryLines, id: \.self) { line in
        Text(line)
          .font(.callout)
      }
    }
    .padding()
  }
}

extension MobileDeviceCapability {
  var summaryLine: String {
    let support = supported ? "supported" : "unavailable"
    let permissionText = permission.status.replacingOccurrences(of: "_", with: " ")
    return "\(label): \(support), permission \(permissionText), input \(preferredInput)"
  }
}

extension MobileDeviceCapabilities {
  var summaryLines: [String] {
    [camera.summaryLine, microphone.summaryLine]
  }
}

final class DeviceCapabilityBridge {
  func currentCapabilities() -> MobileDeviceCapabilities {
    MobileDeviceCapabilities(
      camera: cameraCapability(),
      microphone: microphoneCapability(),
      checkedAtEpochMillis: Int64(Date().timeIntervalSince1970 * 1000)
    )
  }

  private func cameraCapability() -> MobileDeviceCapability {
    let supported = UIImagePickerController.isSourceTypeAvailable(.camera)
    return MobileDeviceCapability(
      surface: "camera",
      label: "Camera",
      supported: supported,
      permission: permissionState(
        status: AVCaptureDevice.authorizationStatus(for: .video),
        unsupportedReason: supported ? "" : "hardware_unavailable"
      ),
      preferredInput: supported ? "native_camera" : "unavailable"
    )
  }

  private func microphoneCapability() -> MobileDeviceCapability {
    let supported = AVAudioSession.sharedInstance().isInputAvailable
    return MobileDeviceCapability(
      surface: "microphone",
      label: "Microphone",
      supported: supported,
      permission: permissionState(
        status: AVCaptureDevice.authorizationStatus(for: .audio),
        unsupportedReason: supported ? "" : "hardware_unavailable"
      ),
      preferredInput: supported ? "native_microphone" : "unavailable"
    )
  }

  private func permissionState(
    status: AVAuthorizationStatus,
    unsupportedReason: String
  ) -> MobileDevicePermissionState {
    if !unsupportedReason.isEmpty {
      return MobileDevicePermissionState(
        status: "unavailable",
        canRequest: false,
        reason: unsupportedReason
      )
    }

    switch status {
    case .authorized:
      return MobileDevicePermissionState(status: "granted", canRequest: false, reason: nil)
    case .denied, .restricted:
      return MobileDevicePermissionState(status: "denied", canRequest: false, reason: "permission_not_granted")
    case .notDetermined:
      return MobileDevicePermissionState(status: "not_determined", canRequest: true, reason: "permission_not_requested")
    @unknown default:
      return MobileDevicePermissionState(status: "unavailable", canRequest: false, reason: "authorization_unknown")
    }
  }
}
