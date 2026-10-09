import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { getUserSettingsPath, readUserSettings, writeUserSettings } from '../src/user-settings'

const directory = mkdtempSync(join(tmpdir(), 'ai-ins-settings-'))
const fileName = join(directory, 'nested', 'settings.json')

afterAll(() => rmSync(directory, { force: true, recursive: true }))

describe('user settings file', () => {
  it('lives in ~/.ai-ins unless AI_INS_HOME moves it', () => {
    expect(getUserSettingsPath()).toMatch(/[/\\]\.ai-ins[/\\]settings\.json$/u)
    process.env.AI_INS_HOME = directory
    expect(getUserSettingsPath()).toBe(join(directory, 'settings.json'))
    delete process.env.AI_INS_HOME
  })

  it('reports a missing file, then merges partial updates', () => {
    expect(readUserSettings(fileName)).toEqual({ exists: false, settings: {} })
    writeUserSettings({ proxy: 'http://127.0.0.1:7890', theme: 'dark' }, fileName)
    writeUserSettings({ notify: true, theme: 'light' }, fileName)
    expect(readUserSettings(fileName)).toEqual({ exists: true, settings: { notify: true, proxy: 'http://127.0.0.1:7890', theme: 'light' } })
  })

  it('clears a key with an empty string and ignores unknown or mistyped values', () => {
    writeUserSettings({ proxy: '', ...({ evil: 'x', theme: 42 } as object) }, fileName)
    expect(readUserSettings(fileName).settings).toEqual({ notify: true, theme: 'light' })
  })

  it('is owner-only, since a proxy URL can hold credentials', () => {
    if (process.platform === 'win32') return
    expect(statSync(fileName).mode & 0o777).toBe(0o600)
  })

  it('treats broken JSON as empty instead of failing', () => {
    writeFileSync(fileName, '{ not json')
    expect(readUserSettings(fileName)).toEqual({ exists: true, settings: {} })
    expect(readFileSync(fileName, 'utf-8')).toBe('{ not json')
  })
})
