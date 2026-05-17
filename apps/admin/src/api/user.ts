import { http } from './http'

export function getUsers() {
  return http.get('/users')
}

export function createUser(payload: Record<string, unknown>) {
  return http.post('/users', payload)
}

export function updateUser(id: number | string, payload: Record<string, unknown>) {
  return http.patch(`/users/${id}`, payload)
}

export function deleteUser(id: number | string) {
  return http.delete(`/users/${id}`)
}
