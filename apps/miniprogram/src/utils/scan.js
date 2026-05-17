import { extractBaseUrlFromScanResult, setServerBaseUrl, supportsDynamicServerConfig } from './config'
import { runWithNativePermission } from './native-permission'

function scanCode() {
  return new Promise((resolve, reject) => {
    uni.scanCode({
      onlyFromCamera: false,
      scanType: ['qrCode', 'barCode'],
      success: resolve,
      fail: reject,
    })
  })
}

function chooseImage() {
  return new Promise((resolve, reject) => {
    uni.chooseImage({
      count: 1,
      sourceType: ['album'],
      sizeType: ['compressed', 'original'],
      success: resolve,
      fail: reject,
    })
  })
}

function scanImageFile(path) {
  return new Promise((resolve, reject) => {
    // #ifdef APP-PLUS
    if (typeof plus !== 'undefined' && plus.barcode && plus.barcode.scan) {
      plus.barcode.scan(
        path,
        (type, code) => resolve({ scanType: type, result: code }),
        (error) => reject(error),
      )
      return
    }
    // #endif

    reject(new Error('image-scan-not-supported'))
  })
}

function showDynamicConfigUnavailableMessage() {
  uni.showToast({
    title: '当前平台使用固定服务器地址',
    icon: 'none',
  })
}

function normalizeScanText(value) {
  return String(value || '').trim()
}

function applyScanResult(result, onApplied) {
  const normalized = extractBaseUrlFromScanResult(result)
  if (!normalized) {
    uni.showModal({
      title: '无法识别二维码',
      content: '请扫描桌面端生成的服务器二维码，或者手动输入服务器地址。',
      showCancel: false,
    })
    return { ok: false, reason: 'invalid-result' }
  }

  setServerBaseUrl(normalized)
  if (typeof onApplied === 'function') {
    onApplied(normalized)
  }
  uni.showToast({ title: '服务器已保存', icon: 'success' })
  return { ok: true, baseUrl: normalized }
}

export async function scanQrCodeText() {
  const scanResult = await runWithNativePermission('camera', scanCode)
  if (!scanResult.ok) {
    return {
      ok: false,
      reason: scanResult.reason || 'scan-failed',
      error: scanResult.error,
    }
  }

  return {
    ok: true,
    text: normalizeScanText(scanResult.result?.result),
    raw: scanResult.result,
  }
}

export async function scanQrImageText() {
  const imageResult = await runWithNativePermission('album', chooseImage)
  if (!imageResult.ok) {
    return {
      ok: false,
      reason: imageResult.reason || 'choose-image-failed',
      error: imageResult.error,
    }
  }

  try {
    const image = imageResult.result
    const filePath = image?.tempFilePaths?.[0]
    if (!filePath) {
      return {
        ok: false,
        reason: 'no-image',
      }
    }

    const result = await scanImageFile(filePath)
    return {
      ok: true,
      text: normalizeScanText(result?.result),
      raw: result,
    }
  } catch (error) {
    const message = String(error && error.message ? error.message : '')
    if (message === 'image-scan-not-supported') {
      return {
        ok: false,
        reason: 'image-scan-not-supported',
        error,
      }
    }

    return {
      ok: false,
      reason: 'image-scan-failed',
      error,
    }
  }
}

export async function scanAndApplyServerConfig({ onApplied } = {}) {
  if (!supportsDynamicServerConfig()) {
    showDynamicConfigUnavailableMessage()
    return { ok: false, reason: 'dynamic-config-disabled' }
  }

  const scanResult = await scanQrCodeText()
  if (!scanResult.ok) {
    if (scanResult.reason !== 'cancelled' && scanResult.reason !== 'permission-denied') {
      uni.showToast({ title: '扫码失败，请检查相机权限', icon: 'none' })
    }
    return { ok: false, reason: 'scan-failed', error: scanResult.error }
  }

  return applyScanResult(scanResult.text, onApplied)
}

export async function scanImageAndApplyServerConfig({ onApplied } = {}) {
  if (!supportsDynamicServerConfig()) {
    showDynamicConfigUnavailableMessage()
    return { ok: false, reason: 'dynamic-config-disabled' }
  }

  const imageResult = await scanQrImageText()
  if (!imageResult.ok) {
    if (imageResult.reason === 'image-scan-not-supported') {
      uni.showToast({ title: '当前平台不支持图片识码', icon: 'none' })
    } else if (imageResult.reason === 'image-scan-failed') {
      uni.showToast({ title: '图片识别失败', icon: 'none' })
    } else if (imageResult.reason !== 'cancelled' && imageResult.reason !== 'permission-denied') {
      uni.showToast({ title: '选择图片失败，请检查相册权限', icon: 'none' })
    }

    return { ok: false, reason: imageResult.reason, error: imageResult.error }
  }

  return applyScanResult(imageResult.text, onApplied)
}
