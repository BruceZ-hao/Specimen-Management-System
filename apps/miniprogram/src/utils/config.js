const DEFAULT_APP_PUBLIC_BASE_URL = 'https://4da4f49a.r27.cpolar.top'
const DEFAULT_MP_PUBLIC_BASE_URL = 'https://4da4f49a.r27.cpolar.top'
const LEGACY_DEFAULT_BASE_URLS = [
  'https://4e8a64ab.r27.cpolar.top',
  'https://15912e24.r27.cpolar.top',
  'https://2270e4.r27.cpolar.top',
  'https://402d32ef.r27.cpolar.top',
]
const STORAGE_KEY = 'mini-server-base-url'

function isMpWeixinPlatform() {
  // #ifdef MP-WEIXIN
  return true
  // #endif
  return false
}

export function supportsWechatImageShare() {
  // #ifdef APP-PLUS
  return true
  // #endif
  return false
}

export function supportsDynamicServerConfig() {
  return !isMpWeixinPlatform()
}

export function normalizeBaseUrl(value) {
  const normalized = String(value || '')
    .trim()
    .replace(/\/api\/?$/i, '')
    .replace(/\/+$/, '')

  if (/^http:\/\/[^/]+\.cpolar\.top$/i.test(normalized)) {
    return normalized.replace(/^http:\/\//i, 'https://')
  }

  return normalized
}

function uniqueBaseUrls(values) {
  const seen = new Set()
  return values
    .map((item) => normalizeBaseUrl(item))
    .filter((item) => {
      if (!item || seen.has(item)) {
        return false
      }
      seen.add(item)
      return true
    })
}

function isLegacyDefaultBaseUrl(value) {
  const normalized = normalizeBaseUrl(value)
  return Boolean(normalized) && LEGACY_DEFAULT_BASE_URLS.some((item) => normalizeBaseUrl(item) === normalized)
}

export function getDefaultBaseUrl() {
  if (isMpWeixinPlatform()) {
    return normalizeBaseUrl(DEFAULT_MP_PUBLIC_BASE_URL)
  }

  return normalizeBaseUrl(DEFAULT_APP_PUBLIC_BASE_URL)
}

export function getServerBaseUrl() {
  const defaultBaseUrl = getDefaultBaseUrl()
  if (!supportsDynamicServerConfig()) {
    return defaultBaseUrl
  }

  const stored = normalizeBaseUrl(uni.getStorageSync(STORAGE_KEY))

  if (isLegacyDefaultBaseUrl(stored)) {
    uni.setStorageSync(STORAGE_KEY, defaultBaseUrl)
    return defaultBaseUrl
  }

  return stored || defaultBaseUrl
}

export function setServerBaseUrl(value) {
  const normalized = normalizeBaseUrl(value)
  if (supportsDynamicServerConfig()) {
    uni.setStorageSync(STORAGE_KEY, normalized)
  }
  return normalized
}

export function getApiBaseUrl() {
  return `${getServerBaseUrl()}/api`
}

export function getCandidateServerBaseUrls(preferredValue = '') {
  const defaultBaseUrl = getDefaultBaseUrl()
  const stored = supportsDynamicServerConfig() ? normalizeBaseUrl(uni.getStorageSync(STORAGE_KEY)) : ''

  return uniqueBaseUrls([preferredValue, stored, defaultBaseUrl, ...LEGACY_DEFAULT_BASE_URLS])
}

export function getFileBaseUrl() {
  return getServerBaseUrl()
}

function safeDecode(value) {
  try {
    return decodeURIComponent(String(value || '').replace(/\+/g, '%20'))
  } catch {
    return String(value || '')
  }
}

function extractBaseParam(raw) {
  const match = String(raw || '').match(/[?&]base=([^&#]+)/i)
  if (!match || !match[1]) {
    return ''
  }

  return normalizeBaseUrl(safeDecode(match[1]))
}

export function extractBaseUrlFromScanResult(value) {
  const raw = String(value || '').trim()
  if (!raw) {
    return ''
  }

  const baseParam = extractBaseParam(raw)
  if (/^https?:\/\//i.test(baseParam)) {
    return baseParam
  }

  if (raw.startsWith('xingyesample://')) {
    return ''
  }

  if (/^https?:\/\/.+\/api\/system\/app-link(?:[/?#]|$)/i.test(raw)) {
    return ''
  }

  if (/^https?:\/\/.+\/api\/system\/app-release-link(?:[/?#]|$)/i.test(raw)) {
    return ''
  }

  return /^https?:\/\//i.test(raw) ? normalizeBaseUrl(raw) : ''
}
