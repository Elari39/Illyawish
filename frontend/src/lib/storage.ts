function canUseWindow() {
  return typeof window !== 'undefined'
}

function getLocalStorage(): Storage | null {
  return canUseWindow() ? window.localStorage : null
}

function getSessionStorage(): Storage | null {
  return canUseWindow() ? window.sessionStorage : null
}

function readStorageValue(storage: Storage | null, key: string) {
  if (!storage) {
    return null
  }

  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

function writeStorageValue(storage: Storage | null, key: string, value: string) {
  if (!storage) {
    return false
  }

  try {
    storage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

function removeStorageValue(storage: Storage | null, key: string) {
  if (!storage) {
    return false
  }

  try {
    storage.removeItem(key)
    return true
  } catch {
    return false
  }
}

export function readLocalStorage(key: string) {
  return readStorageValue(getLocalStorage(), key)
}

export function writeLocalStorage(key: string, value: string) {
  return writeStorageValue(getLocalStorage(), key, value)
}

export function removeLocalStorage(key: string) {
  return removeStorageValue(getLocalStorage(), key)
}

export function readSessionStorage(key: string) {
  return readStorageValue(getSessionStorage(), key)
}

export function writeSessionStorage(key: string, value: string) {
  return writeStorageValue(getSessionStorage(), key, value)
}
