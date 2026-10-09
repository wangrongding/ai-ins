import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'
import { readRequestBody } from './source'
import type { AiInsMiddleware } from './types'

/**
 * Panel settings shared by every project and browser: `~/.ai-ins/settings.json`
 * (`%USERPROFILE%\.ai-ins\settings.json` on Windows). `AI_INS_HOME` moves the
 * directory, e.g. where the home directory is read-only.
 */
export type AiInsUserSettings = {
  locale?: string
  notify?: boolean
  permissionMode?: string
  provider?: string
  proxy?: string
  proxyMode?: string
  submitShortcut?: string
  theme?: string
}

const stringKeys = ['locale', 'permissionMode', 'provider', 'proxy', 'proxyMode', 'submitShortcut', 'theme'] as const
const maxValueLength = 2000

export function getUserSettingsPath() {
  const directory = process.env.AI_INS_HOME?.trim() || join(homedir(), '.ai-ins')
  return join(directory, 'settings.json')
}

/** Keep known keys with values of the right type; drop everything else. */
export function sanitizeUserSettings(value: unknown): AiInsUserSettings {
  const settings: AiInsUserSettings = {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) return settings
  const record = value as Record<string, unknown>
  for (const key of stringKeys) {
    const entry = record[key]
    if (typeof entry === 'string' && entry.length <= maxValueLength) settings[key] = entry
  }
  if (typeof record.notify === 'boolean') settings.notify = record.notify
  return settings
}

/** `exists` is false before the first save, which is when the panel migrates browser settings. */
export function readUserSettings(fileName = getUserSettingsPath()): { exists: boolean; settings: AiInsUserSettings } {
  if (!existsSync(fileName)) return { exists: false, settings: {} }
  try {
    return { exists: true, settings: sanitizeUserSettings(JSON.parse(readFileSync(fileName, 'utf-8'))) }
  } catch {
    // Unreadable or hand-broken JSON: treat as empty rather than failing the panel.
    return { exists: true, settings: {} }
  }
}

/** Merge `patch` in (an empty string clears a key) and write atomically. */
export function writeUserSettings(patch: AiInsUserSettings, fileName = getUserSettingsPath()) {
  const next: Record<string, unknown> = { ...readUserSettings(fileName).settings }
  for (const [key, value] of Object.entries(sanitizeUserSettings(patch))) {
    if (value === '') delete next[key]
    else next[key] = value
  }

  mkdirSync(dirname(fileName), { recursive: true })
  const temporary = `${fileName}.${process.pid}.tmp`
  // Owner-only: a proxy URL can carry credentials.
  writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 })
  renameSync(temporary, fileName)
  try {
    chmodSync(fileName, 0o600)
  } catch {
    // Windows and some file systems have no POSIX modes; nothing to do.
  }
  return next as AiInsUserSettings
}

/** `GET` the settings, `POST` a partial update. */
export function aiInsSettingsMiddleware(): AiInsMiddleware {
  return async (req, res) => {
    res.setHeader('Content-Type', 'application/json')
    try {
      if (req.method === 'GET') {
        res.end(JSON.stringify({ ...readUserSettings(), path: getUserSettingsPath() }))
        return
      }

      if (req.method === 'POST') {
        const settings = writeUserSettings(JSON.parse((await readRequestBody(req)) || '{}'))
        res.end(JSON.stringify({ settings }))
        return
      }

      res.statusCode = 405
      res.end(JSON.stringify({ message: 'method not allowed' }))
    } catch (error) {
      // Read-only home, full disk…: the panel keeps working from the browser copy.
      res.statusCode = 500
      res.end(JSON.stringify({ message: error instanceof Error ? error.message : String(error) }))
    }
  }
}
