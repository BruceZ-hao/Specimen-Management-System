import { getApiBaseUrl, getFileBaseUrl } from './config'
import { getRequestHeaders } from './request'

export function buildAttachmentFileUrl(attachmentId) {
  return `${getApiBaseUrl()}/samples/attachments/${attachmentId}/file`
}

export function resolveFileUrl(url) {
  if (!url) {
    return ''
  }

  return String(url).startsWith('http') ? String(url) : `${getFileBaseUrl()}${url}`
}

export function downloadAuthenticatedFile(url) {
  const finalUrl = resolveFileUrl(url)

  return new Promise((resolve, reject) => {
    uni.downloadFile({
      url: finalUrl,
      header: getRequestHeaders(),
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.tempFilePath) {
          resolve(res.tempFilePath)
          return
        }
        reject(new Error('下载文件失败'))
      },
      fail: (error) => reject(error),
    })
  })
}

export async function previewAuthenticatedImage(url) {
  const tempFilePath = await downloadAuthenticatedFile(url)

  return new Promise((resolve, reject) => {
    uni.previewImage({
      urls: [tempFilePath],
      current: tempFilePath,
      success: resolve,
      fail: reject,
    })
  })
}
