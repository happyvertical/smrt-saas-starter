package com.happyvertical.starter

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.pm.PackageManager

class AndroidDeviceCapabilityAdapter(
  private val context: Context,
  private val permissionRequestHistory: AndroidPermissionRequestHistory =
    UnknownAndroidPermissionRequestHistory,
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

  private fun permissionState(permission: String): DevicePermissionState {
    if (context.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED) {
      return DevicePermissionState(
        status = DevicePermissionStatus.GRANTED,
        canRequest = false,
      )
    }

    if (!permissionRequestHistory.hasRequested(permission)) {
      return DevicePermissionState(
        status = DevicePermissionStatus.NOT_DETERMINED,
        canRequest = true,
        reason = "permission_not_requested",
      )
    }

    val canRequestAgain = (context as? Activity)
      ?.shouldShowRequestPermissionRationale(permission)
      ?: false
    return DevicePermissionState(
      status = DevicePermissionStatus.DENIED,
      canRequest = canRequestAgain,
      reason = if (canRequestAgain) {
        "permission_denied"
      } else {
        "permission_denied_blocked_or_unavailable"
      },
    )
  }
}

fun interface AndroidPermissionRequestHistory {
  fun hasRequested(permission: String): Boolean
}

object UnknownAndroidPermissionRequestHistory : AndroidPermissionRequestHistory {
  override fun hasRequested(permission: String): Boolean = false
}
