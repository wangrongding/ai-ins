import type { PermissionMode } from './types'

/**
 * Per-conversation composer state kept in sessionStorage, so it survives a
 * page reload (HMR full reloads are common in dev) but not a new tab.
 */
const draftsStorageKey = 'ai-ins-panel-prompt-drafts'
const queuedStorageKey = 'ai-ins-panel-queued-prompts'
// Single-draft key used before drafts were per conversation; migrated once.
const legacyDraftStorageKey = 'ai-ins-panel-prompt-draft'

/** Draft key of the blank "new conversation" composer. Conversations use their run id. */
export const newConversationDraftKey = 'new'

function readMap(storageKey: string): Record<string, string> {
  try {
    const value = JSON.parse(window.sessionStorage.getItem(storageKey) || '{}')
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch {
    return {}
  }
}

function writeMap(storageKey: string, map: Record<string, string>) {
  try {
    if (Object.keys(map).length) {
      window.sessionStorage.setItem(storageKey, JSON.stringify(map))
    } else {
      window.sessionStorage.removeItem(storageKey)
    }
  } catch {
    // Ignore storage restrictions in embedded browsers.
  }
}

function writeEntry(storageKey: string, key: string, value: string) {
  const map = readMap(storageKey)
  if (value) {
    map[key] = value
  } else {
    delete map[key]
  }
  writeMap(storageKey, map)
}

export function readPromptDraft(key: string) {
  const drafts = readMap(draftsStorageKey)
  if (key === newConversationDraftKey && !(key in drafts)) {
    try {
      const legacy = window.sessionStorage.getItem(legacyDraftStorageKey) || ''
      window.sessionStorage.removeItem(legacyDraftStorageKey)
      if (legacy) {
        writeEntry(draftsStorageKey, key, legacy)
        return legacy
      }
    } catch {
      // Ignore storage restrictions in embedded browsers.
    }
  }

  return typeof drafts[key] === 'string' ? drafts[key] : ''
}

export function savePromptDraft(key: string, value: string) {
  writeEntry(draftsStorageKey, key, value)
}

export function readQueuedPrompts() {
  return new Map(Object.entries(readMap(queuedStorageKey)).filter(([, value]) => typeof value === 'string' && value))
}

export function saveQueuedPrompts(queued: Map<string, string>) {
  writeMap(queuedStorageKey, Object.fromEntries(queued))
}

const permissionModeStorageKey = 'ai-ins-permission-mode'

/** "Ask me" unless the user chose otherwise; kept across tabs and reloads. */
export function readPermissionMode(): PermissionMode {
  try {
    const value = window.localStorage.getItem(permissionModeStorageKey)
    return value === 'edit' || value === 'full' ? value : 'ask'
  } catch {
    return 'ask'
  }
}

export function savePermissionMode(value: PermissionMode) {
  try {
    window.localStorage.setItem(permissionModeStorageKey, value)
    globalThis.aiInsRememberSetting?.(permissionModeStorageKey, value)
  } catch {
    // Ignore storage restrictions in embedded browsers.
  }
}
