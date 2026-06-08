package com.happyvertical.starter

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager

class AndroidDeviceCapabilityAdapter(
  private val context: Context,
) : DeviceCapabilityAdapter {
  override fun currentCapabilities(): DeviceCapabilityReport = DeviceCapabilityReport(
    camera = capability(
      surface = DeviceCaptureSurface.CAMERA,
      label = "Camera",
      feature = PackageManager.FEATURE_CAMERA_ANY,
      permission = Manifest.permission.CAMERA,
      preferredInput = DeviceInputKind.NATIVE_CAMERA,
    ),
    microphone = capability(
      surface = DeviceCaptureSurface.MICROPHONE,
      label = "Microphone",
      feature = PackageManager.FEATURE_MICROPHONE,
      permission = Manifest.permission.RECORD_AUDIO,
      preferredInput = DeviceInputKind.NATIVE_MICROPHONE,
    ),
    checkedAtEpochMillis = System.currentTimeMillis(),
  )

  private fun capability(
    surface: String,
    label: String,
    feature: String,
    permission: String,
    preferredInput: String,
  ): DeviceCaptureCapability {
    val supported = context.packageManager.hasSystemFeature(feature)
    val permissionState = if (supported) {
      permissionState(permission)
    } else {
      DevicePermissionState(
        status = DevicePermissionStatus.UNAVAILABLE,
        canRequest = false,
        reason = "hardware_unavailable",
      )
    }

    return DeviceCaptureCapability(
      surface = surface,
      label = label,
      supported = supported,
      permission = permissionState,
      preferredInput = if (supported) preferredInput else DeviceInputKind.UNAVAILABLE,
    )
  }

  private fun permissionState(permission: String): DevicePermissionState =
    if (context.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED) {
      DevicePermissionState(
        status = DevicePermissionStatus.GRANTED,
        canRequest = false,
      )
    } else {
      DevicePermissionState(
        status = DevicePermissionStatus.DENIED,
        canRequest = true,
        reason = "permission_not_granted",
      )
    }
}
