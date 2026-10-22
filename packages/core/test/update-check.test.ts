import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  compareVersions,
  detectPackageManager,
  findAiInsDependencies,
  getAiInsUpdateInfo,
  getRunningAiInsVersion,
  getUpgradePlan,
  resetAiInsUpdateCheckForTests,
} from '../src/update-check'
import { writeUserSettings } from '../src/user-settings'

const directory = mkdtempSync(join(tmpdir(), 'ai-ins-update-'))
let caseIndex = 0

afterAll(() => rmSync(directory, { force: true, recursive: true }))

/** A throwaway project tree: `files` maps relative paths to contents (objects become JSON). */
function project(files: Record<string, object | string>) {
  const root = join(directory, `case-${(caseIndex += 1)}`)
  for (const [name, content] of Object.entries(files)) {
    const fileName = join(root, name)
    mkdirSync(join(fileName, '..'), { recursive: true })
    writeFileSync(fileName, typeof content === 'string' ? content : JSON.stringify(content))
  }
  return root
}

const savedEnv = { ...process.env }

beforeEach(() => {
  for (const key of ['CI', 'AI_INS_UPDATE_CHECK', 'NO_UPDATE_NOTIFIER', 'AI_INS_REGISTRY', 'npm_config_registry', 'NPM_CONFIG_REGISTRY', 'npm_config_user_agent']) {
    delete process.env[key]
  }
  process.env.AI_INS_HOME = join(directory, `home-${(caseIndex += 1)}`)
  resetAiInsUpdateCheckForTests()
})

afterEach(() => {
  process.env = { ...savedEnv }
  vi.unstubAllGlobals()
})

function stubRegistry(latest: string | Error) {
  const fetchMock = vi.fn(async (url: string) => {
    if (latest instanceof Error) throw latest
    return new Response(JSON.stringify(url.includes('dist-tags') ? { latest } : { version: latest }), { status: 200 })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('compareVersions', () => {
  it('orders by semver precedence, prereleases below their release', () => {
    expect(compareVersions('1.0.6', '1.0.7')).toBeLessThan(0)
    expect(compareVersions('1.10.0', '1.9.9')).toBeGreaterThan(0)
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
    expect(compareVersions('1.1.0-beta.2', '1.1.0')).toBeLessThan(0)
    expect(compareVersions('1.1.0-beta.10', '1.1.0-beta.2')).toBeGreaterThan(0)
    expect(compareVersions('1.1.0-alpha', '1.1.0-alpha.1')).toBeLessThan(0)
    expect(compareVersions('not-a-version', '1.0.0')).toBe(0)
  })
})

describe('project detection', () => {
  it('finds the nearest manifest that depends on an AI Ins plugin, skipping one with only the CLI', () => {
    const root = project({
      'package.json': { devDependencies: { '@ai-ins/vite': '^1.0.0', 'ai-ins': '^1.0.0' } },
      'apps/web/package.json': { devDependencies: { 'ai-ins': '^1.0.0' } },
    })
    const found = findAiInsDependencies(join(root, 'apps', 'web'))
    expect(found?.directory).toBe(root)
    expect(found?.packages).toEqual([
      { dev: true, name: '@ai-ins/vite' },
      { dev: true, name: 'ai-ins' },
    ])
    expect(found?.local).toBe(false)
  })

  it('treats workspace, link and file specs as local source', () => {
    expect(findAiInsDependencies(project({ 'package.json': { devDependencies: { '@ai-ins/vite': 'workspace:*' } } }))?.local).toBe(true)
    expect(findAiInsDependencies(project({ 'package.json': { devDependencies: { '@ai-ins/vite': 'file:../ai-ins' } } }))?.local).toBe(true)
  })

  it('takes the package manager from packageManager, a lockfile or the workspace root', () => {
    expect(detectPackageManager(project({ 'package.json': { packageManager: 'yarn@4.1.0' } }))).toBe('yarn')
    expect(detectPackageManager(project({ 'package.json': {}, 'bun.lock': '' }))).toBe('bun')
    const monorepo = project({ 'package.json': {}, 'pnpm-workspace.yaml': '', 'apps/web/package.json': {} })
    expect(detectPackageManager(join(monorepo, 'apps', 'web'))).toBe('pnpm')
    expect(detectPackageManager(project({ 'package.json': {} }))).toBe('npm')
  })
})

describe('upgrade command', () => {
  it('upgrades every direct AI Ins dependency with the project package manager', () => {
    const root = project({ 'package.json': { devDependencies: { '@ai-ins/astro': '1.0.6' } }, 'pnpm-lock.yaml': '' })
    expect(getUpgradePlan(root, findAiInsDependencies(root)!)).toEqual({
      command: 'pnpm add -D @ai-ins/astro@latest',
      directory: '',
      packageManager: 'pnpm',
      packages: ['@ai-ins/astro'],
    })
  })

  it('adds -w at a pnpm workspace root and -W at a Yarn 1 workspace root', () => {
    const pnpmRoot = project({ 'package.json': { devDependencies: { '@ai-ins/vite': '1.0.6' } }, 'pnpm-workspace.yaml': '' })
    expect(getUpgradePlan(pnpmRoot, findAiInsDependencies(pnpmRoot)!).command).toBe('pnpm add -D @ai-ins/vite@latest -w')
    const yarnRoot = project({ 'package.json': { devDependencies: { '@ai-ins/vite': '1.0.6' }, workspaces: ['apps/*'] }, 'yarn.lock': '' })
    expect(getUpgradePlan(yarnRoot, findAiInsDependencies(yarnRoot)!).command).toBe('yarn add -D @ai-ins/vite@latest -W')
    const berryRoot = project({ '.yarnrc.yml': '', 'package.json': { devDependencies: { '@ai-ins/vite': '1.0.6' }, workspaces: ['apps/*'] }, 'yarn.lock': '' })
    expect(getUpgradePlan(berryRoot, findAiInsDependencies(berryRoot)!).command).toBe('yarn add -D @ai-ins/vite@latest')
  })

  it('keeps runtime dependencies out of -D and runs from the package that declares them', () => {
    const root = project({
      'package.json': {},
      'package-lock.json': '',
      'apps/my web/package.json': { dependencies: { '@ai-ins/nextjs': '1.0.6' }, devDependencies: { '@ai-ins/core': '1.0.6' } },
    })
    // The plugin root is the repository; the dependency lives in the app.
    const dependencies = findAiInsDependencies(join(root, 'apps', 'my web'))!
    expect(getUpgradePlan(root, dependencies)).toMatchObject({
      command: `cd 'apps/my web' && npm install -D @ai-ins/core@latest && npm install @ai-ins/nextjs@latest`,
      directory: join('apps', 'my web'),
    })
  })
})

describe('getAiInsUpdateInfo', () => {
  it('reports a newer version with the command to install it', async () => {
    const root = project({ 'package.json': { devDependencies: { '@ai-ins/vite': '1.0.6' } }, 'pnpm-lock.yaml': '' })
    stubRegistry('99.0.0')
    const info = await getAiInsUpdateInfo(root)
    expect(info).toMatchObject({ current: getRunningAiInsVersion(), latest: '99.0.0', skipped: false, status: 'available' })
    expect(info.upgrade?.command).toBe('pnpm add -D @ai-ins/vite@latest')
  })

  it('caches the answer on disk, so a restarted server does not ask again', async () => {
    const root = project({ 'package.json': { devDependencies: { '@ai-ins/vite': '1.0.6' } } })
    const fetchMock = stubRegistry('99.0.0')
    await getAiInsUpdateInfo(root)
    const calls = fetchMock.mock.calls.length
    resetAiInsUpdateCheckForTests()
    await getAiInsUpdateInfo(root)
    expect(fetchMock.mock.calls.length).toBe(calls)
    expect(JSON.parse(readFileSync(join(process.env.AI_INS_HOME!, 'update-check.json'), 'utf-8'))).toMatchObject({ latest: '99.0.0', ok: true })
  })

  it('shares one request between concurrent callers', async () => {
    const root = project({ 'package.json': { devDependencies: { '@ai-ins/vite': '1.0.6' } } })
    const fetchMock = stubRegistry('99.0.0')
    await Promise.all([getAiInsUpdateInfo(root), getAiInsUpdateInfo(root), getAiInsUpdateInfo(root)])
    // One check, raced against the default registry and the mirror.
    expect(fetchMock.mock.calls.length).toBe(2)
  })

  it('is up to date when npm has nothing newer, and unknown when npm cannot be reached', async () => {
    const root = project({ 'package.json': { devDependencies: { '@ai-ins/vite': '1.0.6' } } })
    stubRegistry(getRunningAiInsVersion())
    expect((await getAiInsUpdateInfo(root)).status).toBe('up-to-date')
    resetAiInsUpdateCheckForTests()
    process.env.AI_INS_HOME = join(directory, 'offline-home')
    stubRegistry(new Error('offline'))
    expect((await getAiInsUpdateInfo(root)).status).toBe('unknown')
  })

  it('falls back to the public registries when a configured one fails', async () => {
    const root = project({ 'package.json': { devDependencies: { '@ai-ins/vite': '1.0.6' } } })
    process.env.npm_config_registry = 'https://npm.example.internal/'
    const fetchMock = vi.fn(async (url: string) =>
      url.startsWith('https://npm.example.internal') ? new Response('not found', { status: 404 }) : new Response(JSON.stringify({ latest: '99.0.0' })),
    )
    vi.stubGlobal('fetch', fetchMock)
    expect((await getAiInsUpdateInfo(root)).latest).toBe('99.0.0')
    expect(fetchMock.mock.calls[0][0]).toBe('https://npm.example.internal/-/package/@ai-ins%2fcore/dist-tags')
  })

  it('honors a skipped version from the settings file', async () => {
    const root = project({ 'package.json': { devDependencies: { '@ai-ins/vite': '1.0.6' } } })
    writeUserSettings({ updateSkipped: '99.0.0' })
    stubRegistry('99.0.0')
    expect(await getAiInsUpdateInfo(root)).toMatchObject({ skipped: true, status: 'available' })
  })

  it('does not touch the network when turned off, in CI, or for local source', async () => {
    const fetchMock = stubRegistry('99.0.0')
    const installed = project({ 'package.json': { devDependencies: { '@ai-ins/vite': '1.0.6' } } })
    expect(await getAiInsUpdateInfo(installed, { updateCheck: false })).toMatchObject({ disabledReason: 'option', status: 'disabled' })
    process.env.AI_INS_UPDATE_CHECK = '0'
    expect((await getAiInsUpdateInfo(installed)).disabledReason).toBe('env')
    delete process.env.AI_INS_UPDATE_CHECK
    process.env.CI = 'true'
    expect((await getAiInsUpdateInfo(installed)).disabledReason).toBe('ci')
    delete process.env.CI
    const local = project({ 'package.json': { devDependencies: { '@ai-ins/vite': 'workspace:*' } } })
    const localInfo = await getAiInsUpdateInfo(local)
    expect(localInfo).toMatchObject({ disabledReason: 'local', status: 'disabled' })
    expect(localInfo.upgrade).toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
