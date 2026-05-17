const ANDROID_PERMISSIONS = {
  camera: ['android.permission.CAMERA'],
  album: [
    'android.permission.READ_EXTERNAL_STORAGE',
    'android.permission.READ_MEDIA_IMAGES',
  ],
}

function isCancelError(error) {
  const message = String(error && (error.errMsg || error.message) ? error.errMsg || error.message : '')
  return /cancel|取消/i.test(message)
}

function getPermissionLabel(type) {
  return type === 'camera' ? '相机' : '相册'
}

function openAndroidAppSettings() {
  // #ifdef APP-PLUS
  if (typeof plus === 'undefined' || !plus.android) return false

  try {
    const main = plus.android.runtimeMainActivity()
    const Intent = plus.android.importClass('android.content.Intent')
    const Settings = plus.android.importClass('android.provider.Settings')
    const Uri = plus.android.importClass('android.net.Uri')
    const intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
    intent.setData(Uri.parse('package:' + main.getPackageName()))
    main.startActivity(intent)
    return true
  } catch (error) {
    return false
  }
  // #endif

  return false
}

function requestAndroidPermissions(permissions) {
  return new Promise((resolve) => {
    // #ifdef APP-PLUS
    if (typeof plus === 'undefined' || !plus.android || !plus.android.requestPermissions) {
      resolve(true)
      return
    }

    plus.android.requestPermissions(
      permissions,
      (result) => {
        const granted = Array.isArray(result.granted) ? result.granted : []
        resolve(permissions.some((permission) => granted.includes(permission)))
      },
      () => resolve(false),
    )
    return
    // #endif

    resolve(true)
  })
}

export async function ensureNativePermission(type) {
  // #ifdef APP-PLUS
  if (typeof plus !== 'undefined' && plus.android) {
    return requestAndroidPermissions(ANDROID_PERMISSIONS[type] || [])
  }
  // #endif

  return true
}

export function showPermissionModal(type) {
  const label = getPermissionLabel(type)
  uni.showModal({
    title: `需要${label}权限`,
    content: `请在系统设置中允许使用${label}权限后再继续。`,
    confirmText: '去设置',
    cancelText: '取消',
    success: (res) => {
      if (res.confirm) {
        openAndroidAppSettings()
      }
    },
  })
}

export async function runWithNativePermission(type, task) {
  const granted = await ensureNativePermission(type)
  if (!granted) {
    showPermissionModal(type)
    return { ok: false, reason: 'permission-denied' }
  }

  try {
    return { ok: true, result: await task() }
  } catch (error) {
    return {
      ok: false,
      reason: isCancelError(error) ? 'cancelled' : 'failed',
      error,
    }
  }
}
