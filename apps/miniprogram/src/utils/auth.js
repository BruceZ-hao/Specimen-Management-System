function normalizeUser(user) {
  if (!user || typeof user !== 'object') {
    return user
  }

  const normalized = { ...user }
  if ((normalized.id === null || normalized.id === undefined || normalized.id === '') && normalized.sub !== undefined) {
    normalized.id = normalized.sub
  }
  if (normalized.id !== null && normalized.id !== undefined && normalized.id !== '') {
    const numericId = Number(normalized.id)
    normalized.id = Number.isNaN(numericId) ? normalized.id : numericId
  }

  return normalized
}

export function setSession(token, user) {
  uni.setStorageSync('mini-token', token)
  uni.setStorageSync('mini-user', normalizeUser(user))
}

export function getAccessToken() {
  return String(uni.getStorageSync('mini-token') || '').trim()
}

export function getUser() {
  return normalizeUser(uni.getStorageSync('mini-user'))
}

export function clearSession() {
  uni.removeStorageSync('mini-token')
  uni.removeStorageSync('mini-user')
}
