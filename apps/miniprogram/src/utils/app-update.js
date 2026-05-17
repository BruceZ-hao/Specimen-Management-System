import { getServerBaseUrl, normalizeBaseUrl } from './config'
import { request, requestWithServerBaseUrl } from './request'

export const AUTO_UPDATE_PAGE_URL = '/pages/app-update/index?autoStart=1'
export const APP_UPDATE_PAGE_URL = '/pages/app-update/index'

const SKIPPED_UPDATE_STORAGE_KEY = 'mini-skipped-app-update'

let autoUpdatePromptPromise = null
let hasAutoUpdatePromptRun = false

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeVersionCode(value) {
  const normalized = normalizeText(value)
  if (!normalized) {
    return ''
  }

  const numericValue = Number(normalized)
  return Number.isFinite(numericValue) ? String(Math.trunc(numericValue)) : normalized
}

function compareVersionCode(localCode, remoteCode) {
  const localNumber = Number(localCode)
  const remoteNumber = Number(remoteCode)

  if (!Number.isFinite(localNumber) || !Number.isFinite(remoteNumber)) {
    return 0
  }

  if (remoteNumber > localNumber) {
    return 1
  }

  if (remoteNumber < localNumber) {
    return -1
  }

  return 0
}

function buildSkippedUpdateIdentity(remoteInfo) {
  const parts = [
    normalizeText(remoteInfo?.baseUrl),
    normalizeText(remoteInfo?.fileName),
    normalizeText(remoteInfo?.updatedAt),
    normalizeVersionCode(remoteInfo?.versionCode),
    normalizeText(remoteInfo?.versionName),
  ]

  if (!parts.some(Boolean)) {
    return ''
  }

  return parts.join('||')
}

function readSkippedUpdateIdentity() {
  return normalizeText(uni.getStorageSync(SKIPPED_UPDATE_STORAGE_KEY))
}

function showAutoUpdatePrompt(remoteInfo) {
  const versionLabel = remoteInfo.versionName ? `v${remoteInfo.versionName}` : remoteInfo.fileName || '新版本安装包'

  return new Promise((resolve) => {
    uni.showModal({
      title: '发现新版本',
      content: `服务端已发布 ${versionLabel}，是否现在下载并安装？`,
      confirmText: '下载更新',
      cancelText: '暂不下载',
      success: (res) => {
        if (res.confirm) {
          resolve('confirm')
          return
        }

        if (res.cancel) {
          resolve('cancel')
          return
        }

        resolve('dismiss')
      },
      fail: () => resolve('dismiss'),
    })
  })
}

function safeDecode(value) {
  try {
    return decodeURIComponent(String(value || '').replace(/\+/g, '%20'))
  } catch {
    return String(value || '')
  }
}

function extractQueryParam(rawUrl, key) {
  const escapedKey = String(key || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = String(rawUrl || '').match(new RegExp(`[?&]${escapedKey}=([^&#]+)`, 'i'))
  if (!match || !match[1]) {
    return ''
  }

  return safeDecode(match[1])
}

function extractBaseUrlFromAbsoluteUrl(rawUrl) {
  const match = String(rawUrl || '').match(/^https?:\/\/[^/?#]+/i)
  return normalizeBaseUrl(match ? match[0] : '')
}

function extractFileNameFromUrl(rawUrl) {
  const cleanUrl = String(rawUrl || '').split('#')[0].split('?')[0]
  const segments = cleanUrl.split('/').filter(Boolean)
  return safeDecode(segments[segments.length - 1] || '')
}

function buildClientConfigUrl(releaseId = '') {
  const normalizedReleaseId = normalizeText(releaseId)
  return normalizedReleaseId
    ? `/system/client-config?releaseId=${encodeURIComponent(normalizedReleaseId)}`
    : '/system/client-config'
}

function buildRemoteAppInfo(data, options = {}) {
  return {
    baseUrl: normalizeText(options.baseUrl || getServerBaseUrl()),
    downloadUrl: normalizeText(options.downloadUrl || data?.appDownloadUrl),
    fileName: normalizeText(options.fileName || data?.apkFileName),
    updatedAt: normalizeText(data?.apkUpdatedAt),
    versionName: normalizeText(data?.apkVersionName),
    versionCode: normalizeVersionCode(data?.apkVersionCode),
    releaseNotes: normalizeText(data?.apkReleaseNotes),
    sizeBytes: Number(data?.apkSizeBytes || 0),
  }
}

export function parseAppUpdateScanResult(value) {
  const raw = normalizeText(value)
  if (!raw) {
    return {
      ok: false,
      reason: 'empty',
    }
  }

  const baseUrl = extractBaseUrlFromAbsoluteUrl(raw)
  if (!baseUrl) {
    return {
      ok: false,
      reason: 'unsupported',
    }
  }

  if (/\/api\/system\/app-release-link(?:[/?#]|$)/i.test(raw)) {
    return {
      ok: true,
      kind: 'release-page',
      rawValue: raw,
      baseUrl,
      releaseId: normalizeText(extractQueryParam(raw, 'id')),
    }
  }

  if (/\/api\/system\/app-download(?:[/?#]|$)/i.test(raw)) {
    return {
      ok: true,
      kind: 'download-url',
      rawValue: raw,
      baseUrl,
      releaseId: normalizeText(extractQueryParam(raw, 'releaseId')),
      downloadUrl: raw,
      fileName: normalizeText(extractQueryParam(raw, 'fileName')),
    }
  }

  if (/\.apk(?:[?#]|$)/i.test(raw)) {
    return {
      ok: true,
      kind: 'direct-apk',
      rawValue: raw,
      baseUrl,
      releaseId: '',
      downloadUrl: raw,
      fileName: extractFileNameFromUrl(raw),
    }
  }

  return {
    ok: false,
    reason: 'unsupported',
  }
}

export function supportsNativeAppUpdate() {
  // #ifdef APP-PLUS
  return typeof plus !== 'undefined' && String(plus.os?.name || '').toLowerCase() === 'android'
  // #endif
  return false
}

function navigateToAppUpdatePage(url, attempt = 'navigate') {
  return new Promise((resolve) => {
    const method = attempt === 'redirect' ? 'redirectTo' : attempt === 'relaunch' ? 'reLaunch' : 'navigateTo'
    uni[method]({
      url,
      success: () => resolve(true),
      fail: () => resolve(false),
    })
  })
}

export async function openAppUpdatePage(options = {}) {
  const autoStart = String(options?.autoStart || '').trim() === '1'
  const url = autoStart ? AUTO_UPDATE_PAGE_URL : APP_UPDATE_PAGE_URL

  if (!supportsNativeAppUpdate()) {
    uni.showToast({ title: getNativeAppUpdateLabel(), icon: 'none' })
    return false
  }

  if (await navigateToAppUpdatePage(url, 'navigate')) {
    return true
  }

  if (await navigateToAppUpdatePage(url, 'redirect')) {
    return true
  }

  if (await navigateToAppUpdatePage(url, 'relaunch')) {
    return true
  }

  uni.showToast({ title: '打开更新页失败', icon: 'none' })
  return false
}

export function getNativeAppUpdateLabel() {
  if (supportsNativeAppUpdate()) {
    return '支持原生应用更新'
  }

  // #ifdef APP-PLUS
  if (typeof plus !== 'undefined') {
    return 'iOS 暂不支持这里的安装包更新'
  }
  // #endif

  return '只有 Android App 内才能使用安装包更新'
}

export function getLocalAppInfo() {
  return new Promise((resolve) => {
    if (!supportsNativeAppUpdate()) {
      resolve({
        appId: '',
        appName: '',
        versionName: '',
        versionCode: '',
      })
      return
    }

    plus.runtime.getProperty(plus.runtime.appid, (info) => {
      resolve({
        appId: normalizeText(plus.runtime.appid),
        appName: normalizeText(info?.name),
        versionName: normalizeText(info?.version || plus.runtime.version),
        versionCode: normalizeVersionCode(info?.versionCode),
      })
    })
  })
}

export async function getRemoteAppInfo(options = {}) {
  const baseUrl = normalizeText(options?.baseUrl)
  const releaseId = normalizeText(options?.releaseId)
  const requestUrl = buildClientConfigUrl(releaseId)
  const data = baseUrl
    ? await requestWithServerBaseUrl({ baseUrl, url: requestUrl })
    : await request({ url: requestUrl })

  return buildRemoteAppInfo(data, {
    baseUrl: baseUrl || getServerBaseUrl(),
    downloadUrl: options?.downloadUrl,
    fileName: options?.fileName,
  })
}

export async function resolveScannedRemoteAppInfo(scanValue) {
  const parsed = parseAppUpdateScanResult(scanValue)

  if (!parsed.ok) {
    throw new Error('请扫描后台生成的下载二维码，或直接扫描 APK 下载链接。')
  }

  try {
    const remoteInfo = await getRemoteAppInfo({
      baseUrl: parsed.baseUrl,
      releaseId: parsed.releaseId,
      downloadUrl: parsed.downloadUrl,
      fileName: parsed.fileName,
    })

    const finalRemoteInfo = {
      ...remoteInfo,
      baseUrl: parsed.baseUrl || remoteInfo.baseUrl,
      downloadUrl: normalizeText(parsed.downloadUrl || remoteInfo.downloadUrl),
      fileName: normalizeText(parsed.fileName || remoteInfo.fileName || extractFileNameFromUrl(parsed.downloadUrl)),
    }

    if (!finalRemoteInfo.downloadUrl) {
      throw new Error('识别到了更新二维码，但没有取到 APK 下载地址。')
    }

    if (!finalRemoteInfo.fileName) {
      finalRemoteInfo.fileName = 'update.apk'
    }

    return {
      parsed,
      remoteInfo: finalRemoteInfo,
    }
  } catch (error) {
    if (!parsed.downloadUrl) {
      throw error
    }

    return {
      parsed,
      remoteInfo: {
        baseUrl: parsed.baseUrl,
        downloadUrl: normalizeText(parsed.downloadUrl),
        fileName: normalizeText(parsed.fileName || extractFileNameFromUrl(parsed.downloadUrl) || 'update.apk'),
        updatedAt: '',
        versionName: '',
        versionCode: '',
        releaseNotes: '',
        sizeBytes: 0,
      },
    }
  }
}

export function resolveUpdateState(localInfo, remoteInfo) {
  if (!supportsNativeAppUpdate()) {
    return {
      key: 'unsupported',
      text: getNativeAppUpdateLabel(),
      canInstall: false,
      recommendInstall: false,
    }
  }

  if (!remoteInfo.downloadUrl || !remoteInfo.fileName) {
    return {
      key: 'missing-package',
      text: '服务端当前没有可安装的 APK。',
      canInstall: false,
      recommendInstall: false,
    }
  }

  const versionComparison = compareVersionCode(localInfo.versionCode, remoteInfo.versionCode)
  const hasRemoteVersion = Boolean(remoteInfo.versionCode || remoteInfo.versionName)

  if (versionComparison > 0) {
    return {
      key: 'update-available',
      text: '发现更高版本的 Android 安装包。',
      canInstall: true,
      recommendInstall: true,
    }
  }

  if (versionComparison < 0) {
    return {
      key: 'local-newer',
      text: '当前设备上的版本比服务端选中的 APK 更新。',
      canInstall: true,
      recommendInstall: false,
    }
  }

  if (remoteInfo.versionName && localInfo.versionName && remoteInfo.versionName !== localInfo.versionName) {
    return {
      key: 'update-available',
      text: '发现不同版本的 Android 安装包。',
      canInstall: true,
      recommendInstall: true,
    }
  }

  if (!hasRemoteVersion) {
    return {
      key: 'reinstall-available',
      text: '服务端上有可安装的 APK，但没有读取到版本信息。',
      canInstall: true,
      recommendInstall: false,
    }
  }

  return {
    key: 'up-to-date',
    text: '当前 Android 应用已经是服务端选中的版本。',
    canInstall: true,
    recommendInstall: false,
  }
}

export async function inspectAppUpdate() {
  const [localInfo, remoteInfo] = await Promise.all([getLocalAppInfo(), getRemoteAppInfo()])
  const updateState = resolveUpdateState(localInfo, remoteInfo)

  return {
    localInfo,
    remoteInfo,
    updateState,
    skippedIdentity: buildSkippedUpdateIdentity(remoteInfo),
    skipped: isSkippedAppUpdate(remoteInfo),
  }
}

export function rememberSkippedAppUpdate(remoteInfo) {
  const identity = buildSkippedUpdateIdentity(remoteInfo)
  if (!identity) {
    return ''
  }

  uni.setStorageSync(SKIPPED_UPDATE_STORAGE_KEY, identity)
  return identity
}

export function clearSkippedAppUpdate() {
  uni.removeStorageSync(SKIPPED_UPDATE_STORAGE_KEY)
}

export function isSkippedAppUpdate(remoteInfo) {
  const identity = buildSkippedUpdateIdentity(remoteInfo)
  return Boolean(identity) && identity === readSkippedUpdateIdentity()
}

export async function maybePromptForAppUpdate() {
  if (autoUpdatePromptPromise) {
    return autoUpdatePromptPromise
  }

  if (hasAutoUpdatePromptRun) {
    return { action: 'none', reason: 'already-ran' }
  }

  hasAutoUpdatePromptRun = true

  autoUpdatePromptPromise = (async () => {
    try {
      const result = await inspectAppUpdate()
      if (result.updateState.key !== 'update-available') {
        return {
          action: 'none',
          reason: result.updateState.key,
          ...result,
        }
      }

      if (result.skipped) {
        return {
          action: 'none',
          reason: 'skipped-same-version',
          ...result,
        }
      }

      const promptResult = await showAutoUpdatePrompt(result.remoteInfo)
      if (promptResult === 'confirm') {
        clearSkippedAppUpdate()
        return {
          action: 'download',
          updatePageUrl: AUTO_UPDATE_PAGE_URL,
          ...result,
        }
      }

      if (promptResult === 'cancel') {
        rememberSkippedAppUpdate(result.remoteInfo)
        return {
          action: 'skip',
          ...result,
        }
      }

      return {
        action: 'none',
        reason: 'dismissed',
        ...result,
      }
    } catch (error) {
      return {
        action: 'error',
        error,
      }
    } finally {
      autoUpdatePromptPromise = null
    }
  })()

  return autoUpdatePromptPromise
}

export function formatAppUpdateError(error) {
  if (error && typeof error === 'object') {
    if (typeof error.message === 'string' && error.message.trim()) {
      return error.message.trim()
    }
    if (typeof error.errMsg === 'string' && error.errMsg.trim()) {
      return error.errMsg.trim()
    }
  }

  if (typeof error === 'string' && error.trim()) {
    return error.trim()
  }

  return '更新失败。'
}

export function formatFileSize(sizeBytes) {
  const size = Number(sizeBytes)
  if (!Number.isFinite(size) || size <= 0) {
    return ''
  }

  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`
  }

  if (size >= 1024) {
    return `${(size / 1024).toFixed(1)} KB`
  }

  return `${Math.round(size)} B`
}

export function formatDateTime(value) {
  const normalized = normalizeText(value)
  if (!normalized) {
    return ''
  }

  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) {
    return normalized
  }

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hour}:${minute}`
}

export function downloadLatestApk(downloadUrl, onProgress) {
  return new Promise((resolve, reject) => {
    const task = uni.downloadFile({
      url: downloadUrl,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300 && (res.tempFilePath || res.filePath)) {
          resolve(res.tempFilePath || res.filePath)
          return
        }

        reject(new Error('下载安装包失败。'))
      },
      fail: (error) => reject(error),
    })

    if (task && typeof task.onProgressUpdate === 'function') {
      task.onProgressUpdate((progressEvent) => {
        if (typeof onProgress === 'function') {
          onProgress(progressEvent)
        }
      })
    }
  })
}

export function installDownloadedApk(filePath) {
  return new Promise((resolve, reject) => {
    if (!supportsNativeAppUpdate()) {
      reject(new Error('当前环境不支持 Android 安装包更新。'))
      return
    }

    let settled = false

    const finishResolve = () => {
      if (!settled) {
        settled = true
        resolve(true)
      }
    }

    const finishReject = (error) => {
      if (!settled) {
        settled = true
        reject(error)
      }
    }

    try {
      plus.runtime.install(
        filePath,
        { force: false },
        () => finishResolve(),
        (error) => finishReject(new Error(formatAppUpdateError(error))),
      )

      setTimeout(() => {
        finishResolve()
      }, 1000)
    } catch (error) {
      finishReject(error)
    }
  })
}
