import { http } from './http'

export function login(payload: { username: string; password: string }) {
  return http.post('/auth/login', payload)
}

export function getMe() {
  return http.get('/auth/me')
}
