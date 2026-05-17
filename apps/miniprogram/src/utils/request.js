import { getCandidateServerBaseUrls, getServerBaseUrl, normalizeBaseUrl, setServerBaseUrl } from './config'

const RETRYABLE_STATUS_CODES = new Set([404, 502, 503, 504])

function buildHeaders(extraHeaders = {}) {
  const token = uni.getStorageSync('mini-token')
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    'ngrok-skip-browser-warning': 'true',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
    ...extraHeaders,
  }
}

function buildApiBaseUrl(baseUrl) {
  return `${normalizeBaseUrl(baseUrl)}/api`
}

function buildRequestUrl(baseUrl, url, method) {
  const upperMethod = String(method || 'GET').toUpperCase()
  const apiBaseUrl = buildApiBaseUrl(baseUrl)

  return upperMethod === 'GET'
    ? `${apiBaseUrl}${url}${url.includes('?') ? '&' : '?'}_t=${Date.now()}`
    : `${apiBaseUrl}${url}`
}

function extractErrorMessage(error) {
  if (error && typeof error === 'object') {
    if (typeof error.message === 'string' && error.message.trim()) {
      return error.message.trim()
    }

    if (typeof error.errMsg === 'string' && error.errMsg.trim()) {
      return error.errMsg.trim()
    }

    if (typeof error.error === 'string' && error.error.trim()) {
      return error.error.trim()
    }
  }

  if (typeof error === 'string' && error.trim()) {
    return error.trim()
  }

  return ''
}

function isRetryableStatusCode(statusCode) {
  return RETRYABLE_STATUS_CODES.has(Number(statusCode || 0))
}

function isNetworkFailure(error) {
  const message = extractErrorMessage(error).toLowerCase()

  return (
    message.includes('request:fail') ||
    message.includes('network error') ||
    message.includes('timeout') ||
    message.includes('econn') ||
    message.includes('ssl') ||
    message.includes('connection closed') ||
    message.includes('unable to resolve host')
  )
}

function normalizeHttpError(statusCode, data, baseUrl) {
  const message = extractErrorMessage(data) || `HTTP ${statusCode}`

  return {
    statusCode,
    data,
    message,
    errMsg: message,
    serverBaseUrl: baseUrl,
    retryable: isRetryableStatusCode(statusCode),
  }
}

function normalizeRequestError(error, baseUrl) {
  if (error && typeof error === 'object' && 'statusCode' in error) {
    return {
      ...error,
      serverBaseUrl: error.serverBaseUrl || baseUrl,
    }
  }

  const message = extractErrorMessage(error) || 'request failed'
  return {
    message,
    errMsg: message,
    serverBaseUrl: baseUrl,
    network: isNetworkFailure(error),
    cause: error,
  }
}

function shouldTryNextCandidate(error, index, candidates) {
  if (index >= candidates.length - 1) {
    return false
  }

  if (error?.network) {
    return true
  }

  return isRetryableStatusCode(error?.statusCode)
}

function finalizeRequestError(error, attemptedBaseUrls, preferredBaseUrl) {
  const normalized = normalizeRequestError(error, preferredBaseUrl)
  const treatAsConnectivityIssue = Boolean(normalized.network || normalized.retryable)

  if (!treatAsConnectivityIssue) {
    return {
      ...normalized,
      attemptedBaseUrls,
    }
  }

  return {
    ...normalized,
    network: true,
    attemptedBaseUrls,
    message:
      normalized.message ||
      `无法连接服务器：${preferredBaseUrl || attemptedBaseUrls[0] || '未配置地址'}`,
  }
}

function requestWithBaseUrl({ baseUrl, url, method = 'GET', data }) {
  const upperMethod = String(method || 'GET').toUpperCase()
  const finalUrl = buildRequestUrl(baseUrl, url, upperMethod)

  return new Promise((resolve, reject) => {
    uni.request({
      url: finalUrl,
      method: upperMethod,
      data,
      header: buildHeaders(),
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data)
        } else {
          reject(normalizeHttpError(res.statusCode, res.data, baseUrl))
        }
      },
      fail: (error) => {
        reject(normalizeRequestError(error, baseUrl))
      },
    })
  })
}

export function requestWithServerBaseUrl({ baseUrl, url, method = 'GET', data }) {
  return requestWithBaseUrl({
    baseUrl: normalizeBaseUrl(baseUrl),
    url,
    method,
    data,
  })
}

export function getRequestHeaders(extraHeaders = {}) {
  return buildHeaders(extraHeaders)
}

export function isConnectivityError(error) {
  return Boolean(error?.network)
}

export function formatConnectivityErrorMessage(error) {
  const attemptedBaseUrls = Array.isArray(error?.attemptedBaseUrls) ? error.attemptedBaseUrls.filter(Boolean) : []
  const currentBaseUrl = normalizeBaseUrl(error?.serverBaseUrl || getServerBaseUrl())
  const lines = [
    '无法连接当前服务器。',
    currentBaseUrl ? `当前地址：${currentBaseUrl}` : '当前地址未配置。',
    '请确认桌面端已打开并保持运行，或者重新扫描最新的服务器二维码。',
  ]

  if (attemptedBaseUrls.length > 1) {
    lines.push(`已自动尝试 ${attemptedBaseUrls.length} 个地址。`)
  }

  return lines.join('\n')
}

export async function request({ url, method = 'GET', data }) {
  const preferredBaseUrl = getServerBaseUrl()
  const candidateBaseUrls = getCandidateServerBaseUrls(preferredBaseUrl)
  let lastError = null

  for (let index = 0; index < candidateBaseUrls.length; index += 1) {
    const baseUrl = candidateBaseUrls[index]

    try {
      const response = await requestWithBaseUrl({ baseUrl, url, method, data })

      if (baseUrl && baseUrl !== preferredBaseUrl) {
        setServerBaseUrl(baseUrl)
      }

      return response
    } catch (error) {
      const normalizedError = normalizeRequestError(error, baseUrl)
      lastError = normalizedError

      if (!shouldTryNextCandidate(normalizedError, index, candidateBaseUrls)) {
        throw finalizeRequestError(normalizedError, candidateBaseUrls, preferredBaseUrl)
      }
    }
  }

  throw finalizeRequestError(lastError, candidateBaseUrls, preferredBaseUrl)
}

export function uploadFile({ url, filePath, name = 'file', formData = {} }) {
  const baseUrl = getServerBaseUrl()

  return new Promise((resolve, reject) => {
    uni.uploadFile({
      url: `${buildApiBaseUrl(baseUrl)}${url}`,
      filePath,
      name,
      formData,
      header: buildHeaders(),
      success: (res) => {
        try {
          const data = JSON.parse(res.data || '{}')
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data)
          } else {
            reject(normalizeHttpError(res.statusCode, data, baseUrl))
          }
        } catch (error) {
          reject(normalizeRequestError(error, baseUrl))
        }
      },
      fail: (error) => {
        reject(normalizeRequestError(error, baseUrl))
      },
    })
  })
}
