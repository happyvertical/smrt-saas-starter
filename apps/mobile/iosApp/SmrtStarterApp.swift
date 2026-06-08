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

struct DevicePermissionState {
  let status: String
  let canRequest: Bool
  let reason: String
}

struct DeviceCaptureCapability {
  let surface: String
  let label: String
  let supported: Bool
  let permission: DevicePermissionState
  let preferredInput: String

  var summaryLine: String {
    let support = supported ? "supported" : "unavailable"
    let permissionText = permission.status.replacingOccurrences(of: "_", with: " ")
    return "\(label): \(support), permission \(permissionText), input \(preferredInput)"
  }
}

struct DeviceCapabilityReport {
  let camera: DeviceCaptureCapability
  let microphone: DeviceCaptureCapability

  var summaryLines: [String] {
    [camera.summaryLine, microphone.summaryLine]
  }
}

final class DeviceCapabilityBridge {
  func currentCapabilities() -> DeviceCapabilityReport {
    DeviceCapabilityReport(
      camera: cameraCapability(),
      microphone: microphoneCapability()
    )
  }

  private func cameraCapability() -> DeviceCaptureCapability {
    let supported = UIImagePickerController.isSourceTypeAvailable(.camera)
    return DeviceCaptureCapability(
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

  private func microphoneCapability() -> DeviceCaptureCapability {
    let supported = AVAudioSession.sharedInstance().isInputAvailable
    return DeviceCaptureCapability(
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
  ) -> DevicePermissionState {
    if !unsupportedReason.isEmpty {
      return DevicePermissionState(
        status: "unavailable",
        canRequest: false,
        reason: unsupportedReason
      )
    }

    switch status {
    case .authorized:
      return DevicePermissionState(status: "granted", canRequest: false, reason: "")
    case .denied, .restricted:
      return DevicePermissionState(status: "denied", canRequest: false, reason: "permission_not_granted")
    case .notDetermined:
      return DevicePermissionState(status: "not_determined", canRequest: true, reason: "permission_not_requested")
    @unknown default:
      return DevicePermissionState(status: "unavailable", canRequest: false, reason: "authorization_unknown")
    }
  }
}
