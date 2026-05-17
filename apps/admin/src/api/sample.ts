import { http } from './http'

export function getSamples(params: Record<string, unknown>) {
  return http.get('/samples', { params })
}

export function getProgressSummary() {
  return http.get('/samples/progress-summary')
}

export function getSampleDetail(id: number | string) {
  return http.get(`/samples/${id}`)
}

export function createSample(payload: Record<string, unknown>) {
  return http.post('/samples', payload)
}

export function updateSample(id: number | string, payload: Record<string, unknown>) {
  return http.patch(`/samples/${id}`, payload)
}

export function deleteSample(id: number | string) {
  return http.delete(`/samples/${id}`)
}

export function updateStep(id: number | string, payload: Record<string, unknown>) {
  return http.patch(`/steps/${id}`, payload)
}

export function resetSampleOwnership(id: number | string, payload: Record<string, unknown>) {
  return http.post(`/samples/${id}/reset-ownership`, payload)
}

export function uploadAttachment(id: number | string, file: File) {
  const formData = new FormData()
  formData.append('file', file)
  return http.post(`/samples/${id}/attachments`, formData)
}

export function buildAttachmentUrl(id: number | string) {
  const baseUrl =
    import.meta.env.VITE_SERVER_BASE_URL ||
    (typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:3000')
  return `${baseUrl}/api/samples/attachments/${id}/file`
}
