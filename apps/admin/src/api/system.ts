import { http } from './http'

export function getClientConfig() {
  return http.get('/system/client-config')
}

export function getAppReleases() {
  return http.get('/system/app-releases')
}

export function uploadAppRelease(file: File) {
  const formData = new FormData()
  formData.append('file', file)
  return http.post('/system/app-releases/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })
}

export function activateAppRelease(id: string) {
  return http.post(`/system/app-releases/${encodeURIComponent(id)}/activate`)
}

export function deleteAppRelease(id: string) {
  return http.delete(`/system/app-releases/${encodeURIComponent(id)}`)
}

export function getApkOptions() {
  return http.get('/system/apk-options')
}

export function setApkSelection(name: string) {
  return http.post('/system/apk-selection', { name })
}

export function setPublicBaseUrl(value: string) {
  return http.post('/system/public-base-url', { value })
}
