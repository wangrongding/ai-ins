import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { dirname, isAbsolute, join, relative } from 'path'
import { getUserSettingsPath, readUserSettings } from './user-settings'
import type { AiInsMiddleware, AiInsPluginOptions } from './types'

/**
 * "Is there a newer AI Ins?" for the panel. All packages are released together
 * at one version (see `.changeset/config.json`), so the running core's version
 * is the installed version and `@ai-ins/core`'s `latest` tag is the newest.
 *
 * The check never gets in the way: it runs in the dev server (no CORS or page
 * CSP), is cached in `~/.ai-ins/update-check.json` so a restart does not hit
 * the network again, times out quickly, and any failure just means "unknown".
 */

const checkedPackage = '@ai-ins/core'
const aiInsPackages = ['@ai-ins/astro', '@ai-ins/nextjs', '@ai-ins/vite', '@ai-ins/webpack', '@ai-ins/core', 'ai-ins']
export const aiInsChangelogUrl = 'https://github.com/wangrongding/ai-ins/blob/main/packages/core/CHANGELOG.md'
const defaultRegistry = 'https://registry.npmjs.org'
// Tried alongside the default; whichever answers first wins. Helps where npmjs is slow or blocked.
const mirrorRegistry = 'https://registry.npmmirror.com'
const requestTimeoutMs = 4000
const freshForMs = 6 * 60 * 60 * 1000
const retryFailedAfterMs = 30 * 60 * 1000
const minManualIntervalMs = 10 * 1000

export type AiInsPackageManager = 'bun' | 'npm' | 'pnpm' | 'yarn'

export type AiInsUpdateInfo = {
  /** Version of the AI Ins code running in this dev server. */
  current: string
  status: 'available' | 'disabled' | 'unknown' | 'up-to-date'
  /**
   * Why no check runs: turned off in the plugin options, an environment
   * variable or the panel (`user`), CI, or AI Ins comes from a local workspace / link.
   */
  disabledReason?: 'ci' | 'env' | 'local' | 'option' | 'user'
  /** The panel's "check for updates automatically" switch (`updateCheck` in the settings file). */
  userEnabled: boolean
  latest?: string
  checkedAt?: number
  /** The user chose "skip this version" for `latest`. */
  skipped?: boolean
  changelogUrl: string
  /** How to upgrade; absent when the project's AI Ins dependencies could not be found. */
  upgrade?: AiInsUpgradePlan
}

export type AiInsUpgradePlan = {
  /** Shell command, prefixed with `cd` when it must run outside the project root. */
  command: string
  /** Where the command runs, relative to the project root ('' for the root itself). */
  directory: string
  packageManager: AiInsPackageManager
  packages: string[]
}

type PackageJson = {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  packageManager?: string
  workspaces?: unknown
}

type CacheEntry = { checkedAt: number; latest?: string; ok: boolean }

function readJson<T>(fileName: string): T | undefined {
  try {
    return JSON.parse(readFileSync(fileName, 'utf-8')) as T
  } catch {
    return undefined
  }
}

let runningVersion: string | undefined

/** Read from this package's own manifest: `src/` in tests and `dist/` when published both sit one level down. */
export function getRunningAiInsVersion() {
  runningVersion ??= readJson<{ version?: string }>(join(__dirname, '..', 'package.json'))?.version || '0.0.0'
  return runningVersion
}

type ParsedVersion = { core: [number, number, number]; prerelease: string[] }

function parseVersion(value: string): ParsedVersion | undefined {
  const match = value.trim().replace(/^v/u, '').match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/u)
  if (!match) return undefined
  return { core: [Number(match[1]), Number(match[2]), Number(match[3])], prerelease: match[4] ? match[4].split('.') : [] }
}

/** Semver precedence: negative when `a` is older than `b`. Unparsable versions compare equal. */
export function compareVersions(a: string, b: string) {
  const left = parseVersion(a)
  const right = parseVersion(b)
  if (!left || !right) return 0
  for (let index = 0; index < 3; index += 1) {
    if (left.core[index] !== right.core[index]) return left.core[index] - right.core[index]
  }
  // A release outranks its prereleases.
  if (!left.prerelease.length || !right.prerelease.length) return right.prerelease.length - left.prerelease.length
  for (let index = 0; index < Math.max(left.prerelease.length, right.prerelease.length); index += 1) {
    const x = left.prerelease[index]
    const y = right.prerelease[index]
    if (x === undefined) return -1
    if (y === undefined) return 1
    const xNumber = /^\d+$/u.test(x)
    const yNumber = /^\d+$/u.test(y)
    if (xNumber && yNumber && Number(x) !== Number(y)) return Number(x) - Number(y)
    if (xNumber !== yNumber) return xNumber ? -1 : 1
    if (x !== y) return x < y ? -1 : 1
  }
  return 0
}

function isPackageManager(value: string | undefined): value is AiInsPackageManager {
  return value === 'pnpm' || value === 'yarn' || value === 'npm' || value === 'bun'
}

function getLockfileManager(dir: string): AiInsPackageManager | undefined {
  if (existsSync(join(dir, 'pnpm-lock.yaml'))) return 'pnpm'
  if (existsSync(join(dir, 'yarn.lock'))) return 'yarn'
  if (existsSync(join(dir, 'bun.lockb')) || existsSync(join(dir, 'bun.lock'))) return 'bun'
  if (existsSync(join(dir, 'package-lock.json'))) return 'npm'
  return undefined
}

/** Same lookup as the CLI: `packageManager` field or lockfile, from the package up to its workspace root. */
export function detectPackageManager(start: string): AiInsPackageManager {
  let dir = start
  for (;;) {
    const declared = readJson<PackageJson>(join(dir, 'package.json'))?.packageManager?.split('@')[0]
    if (isPackageManager(declared)) return declared
    const fromLockfile = getLockfileManager(dir)
    if (fromLockfile) return fromLockfile
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return 'pnpm'
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }

  const userAgent = process.env.npm_config_user_agent?.split(' ')[0]?.split('/')[0]
  return isPackageManager(userAgent) ? userAgent : 'npm'
}

type ProjectDependencies = {
  directory: string
  /** A dependency points at local source (`workspace:`, `link:`, `file:`…): there is nothing to fetch. */
  local: boolean
  packages: Array<{ dev: boolean; name: string }>
  manifest: PackageJson
}

/** The nearest `package.json` at or above `root` that depends on AI Ins directly. */
export function findAiInsDependencies(root: string): ProjectDependencies | undefined {
  let dir = root
  for (;;) {
    const manifest = readJson<PackageJson>(join(dir, 'package.json'))
    if (manifest) {
      const packages: ProjectDependencies['packages'] = []
      let local = false
      for (const name of aiInsPackages) {
        const spec = manifest.devDependencies?.[name] ?? manifest.dependencies?.[name]
        if (spec === undefined) continue
        if (/^(workspace|link|file|portal):/u.test(spec) || spec.startsWith('.') || spec.startsWith('/')) local = true
        packages.push({ dev: manifest.devDependencies?.[name] !== undefined, name })
      }
      // The `ai-ins` CLI alone (usually run with npx) does not make this the plugin's project.
      if (packages.some((entry) => entry.name !== 'ai-ins')) return { directory: dir, local, manifest, packages }
    }

    const parent = dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
}

function quoteShellArgument(value: string) {
  return /^[\w@%+=:,./-]+$/u.test(value) ? value : `'${value.replace(/'/gu, `'\\''`)}'`
}

function getAddCommand(manager: AiInsPackageManager, specs: string[], dev: boolean, directory: string, manifest: PackageJson) {
  if (manager === 'pnpm') {
    const workspaceRoot = existsSync(join(directory, 'pnpm-workspace.yaml')) ? ['-w'] : []
    return ['pnpm', 'add', ...(dev ? ['-D'] : []), ...specs, ...workspaceRoot]
  }
  if (manager === 'yarn') {
    // Yarn 1 refuses to add to a workspace root without -W; Berry (.yarnrc.yml) has no such flag.
    const classicWorkspaceRoot = manifest.workspaces && !existsSync(join(directory, '.yarnrc.yml')) ? ['-W'] : []
    return ['yarn', 'add', ...(dev ? ['-D'] : []), ...specs, ...classicWorkspaceRoot]
  }
  if (manager === 'bun') return ['bun', 'add', ...(dev ? ['-d'] : []), ...specs]
  return ['npm', 'install', ...(dev ? ['-D'] : []), ...specs]
}

export function getUpgradePlan(root: string, dependencies: ProjectDependencies, version = 'latest'): AiInsUpgradePlan {
  const packageManager = detectPackageManager(dependencies.directory)
  const commands: string[] = []
  for (const dev of [true, false]) {
    const names = dependencies.packages.filter((entry) => entry.dev === dev).map((entry) => entry.name)
    if (names.length) {
      const words = getAddCommand(packageManager, names.map((name) => `${name}@${version}`), dev, dependencies.directory, dependencies.manifest)
      commands.push(words.map(quoteShellArgument).join(' '))
    }
  }

  const fromRoot = relative(root, dependencies.directory)
  const directory = fromRoot && !fromRoot.startsWith('..') && !isAbsolute(fromRoot) ? fromRoot : fromRoot ? dependencies.directory : ''
  const command = commands.join(' && ')
  return {
    command: directory ? `cd ${quoteShellArgument(directory)} && ${command}` : command,
    directory,
    packageManager,
    packages: dependencies.packages.map((entry) => entry.name),
  }
}

function isTruthyEnv(value: string | undefined) {
  return Boolean(value) && !/^(0|false|off|no)$/iu.test(value!.trim())
}

function isFalsyEnv(value: string | undefined) {
  return value !== undefined && /^(0|false|off|no)$/iu.test(value.trim())
}

function getDisabledReason(
  options: AiInsPluginOptions,
  dependencies: ProjectDependencies | undefined,
  userEnabled: boolean,
): AiInsUpdateInfo['disabledReason'] {
  // The project's own config and the environment outrank the panel: the panel cannot turn those back on.
  if (options.updateCheck === false) return 'option'
  if (isFalsyEnv(process.env.AI_INS_UPDATE_CHECK) || isTruthyEnv(process.env.NO_UPDATE_NOTIFIER)) return 'env'
  if (!userEnabled) return 'user'
  // `AI_INS_UPDATE_CHECK=1` checks anyway, e.g. to try the notice from a linked checkout.
  if (isTruthyEnv(process.env.AI_INS_UPDATE_CHECK)) return undefined
  if (isTruthyEnv(process.env.CI)) return 'ci'
  if (dependencies?.local) return 'local'
  return undefined
}

function normalizeRegistry(value: string | undefined) {
  const registry = value?.trim().replace(/\/+$/u, '')
  return registry && /^https?:\/\//u.test(registry) ? registry : undefined
}

/** A registry the project configured (npm / pnpm scripts export it), tried first. */
function getConfiguredRegistry() {
  return normalizeRegistry(process.env.AI_INS_REGISTRY) || normalizeRegistry(process.env.npm_config_registry) || normalizeRegistry(process.env.NPM_CONFIG_REGISTRY)
}

async function fetchJson(url: string, signal: AbortSignal) {
  const response = await fetch(url, { headers: { accept: 'application/json' }, signal })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return (await response.json()) as unknown
}

async function fetchLatestFrom(registry: string, signal: AbortSignal) {
  const name = checkedPackage.replace('/', '%2f')
  let latest: unknown
  try {
    latest = ((await fetchJson(`${registry}/-/package/${name}/dist-tags`, signal)) as { latest?: unknown })?.latest
  } catch (error) {
    if (signal.aborted) throw error
  }
  // Not every registry serves `dist-tags`; the version document has the same answer.
  if (typeof latest !== 'string') latest = ((await fetchJson(`${registry}/${name}/latest`, signal)) as { version?: unknown })?.version
  if (typeof latest !== 'string' || !parseVersion(latest)) throw new Error('no valid latest version')
  return latest
}

async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs)
  try {
    return await run(controller.signal)
  } finally {
    clearTimeout(timer)
    controller.abort()
  }
}

export async function fetchLatestAiInsVersion() {
  const configured = getConfiguredRegistry()
  if (configured && configured !== defaultRegistry && configured !== mirrorRegistry) {
    try {
      return await withTimeout((signal) => fetchLatestFrom(configured, signal))
    } catch {
      // A private registry may not proxy public packages: fall back to the public ones.
    }
  }
  return withTimeout((signal) => Promise.any([defaultRegistry, mirrorRegistry].map((registry) => fetchLatestFrom(registry, signal))))
}

function getCachePath() {
  return join(dirname(getUserSettingsPath()), 'update-check.json')
}

function readCache(): CacheEntry | undefined {
  const entry = readJson<CacheEntry>(getCachePath())
  return entry && typeof entry.checkedAt === 'number' && typeof entry.ok === 'boolean' ? entry : undefined
}

function writeCache(entry: CacheEntry) {
  try {
    const fileName = getCachePath()
    mkdirSync(dirname(fileName), { recursive: true })
    const temporary = `${fileName}.${process.pid}.tmp`
    writeFileSync(temporary, `${JSON.stringify(entry)}\n`)
    renameSync(temporary, fileName)
  } catch {
    // Read-only home: the in-memory copy still saves repeat requests.
  }
}

let memoryCache: CacheEntry | undefined
let pendingCheck: Promise<CacheEntry> | undefined

function isFresh(entry: CacheEntry | undefined, now: number) {
  if (!entry || entry.checkedAt > now) return false
  return now - entry.checkedAt < (entry.ok ? freshForMs : retryFailedAfterMs)
}

/** The cached answer while fresh; otherwise one shared network check (concurrent callers wait on the same one). */
export function checkLatestAiInsVersion(force = false): Promise<CacheEntry> {
  const now = Date.now()
  const cached = memoryCache ?? (memoryCache = readCache())
  const recent = cached && now - cached.checkedAt < minManualIntervalMs
  if (cached && (force ? recent : isFresh(cached, now))) return Promise.resolve(cached)
  pendingCheck ??= fetchLatestAiInsVersion()
    .then((latest) => ({ checkedAt: Date.now(), latest, ok: true }))
    // Keep the last known version through a failed retry.
    .catch(() => ({ checkedAt: Date.now(), latest: cached?.latest, ok: false }))
    .then((entry) => {
      memoryCache = entry
      writeCache(entry)
      return entry
    })
    .finally(() => {
      pendingCheck = undefined
    })
  return pendingCheck
}

export function resetAiInsUpdateCheckForTests() {
  memoryCache = undefined
  pendingCheck = undefined
  runningVersion = undefined
}

export async function getAiInsUpdateInfo(root: string, options: AiInsPluginOptions = {}, force = false): Promise<AiInsUpdateInfo> {
  const current = getRunningAiInsVersion()
  const dependencies = findAiInsDependencies(root)
  const settings = readUserSettings().settings
  const userEnabled = settings.updateCheck !== false
  const disabledReason = getDisabledReason(options, dependencies, userEnabled)
  const info: AiInsUpdateInfo = { changelogUrl: aiInsChangelogUrl, current, status: 'unknown', userEnabled }
  if (dependencies && !dependencies.local) info.upgrade = getUpgradePlan(root, dependencies)
  if (disabledReason) return { ...info, disabledReason, status: 'disabled' }

  const entry = await checkLatestAiInsVersion(force)
  if (!entry.latest) return { ...info, checkedAt: entry.checkedAt }
  const available = compareVersions(current, entry.latest) < 0
  return {
    ...info,
    checkedAt: entry.checkedAt,
    latest: entry.latest,
    skipped: available && settings.updateSkipped === entry.latest,
    status: available ? 'available' : 'up-to-date',
  }
}

let announced = false

/** One quiet line in the dev server's terminal, once per process, for people who never open the panel's settings. */
function announceUpdate(info: AiInsUpdateInfo) {
  if (announced || info.status !== 'available' || info.skipped) return
  announced = true
  const upgrade = info.upgrade ? ` Upgrade: ${info.upgrade.command}` : ''
  console.log(`[ai-ins] v${info.latest} is available (running v${info.current}).${upgrade}`)
}

/** `GET` the update state; `?refresh=1` checks the registry again now. */
export function aiInsUpdateMiddleware(root: string, options: AiInsPluginOptions = {}): AiInsMiddleware {
  // Warm the cache shortly after startup, so the panel's first look is instant.
  const warmUp = setTimeout(() => {
    void getAiInsUpdateInfo(root, options).then(announceUpdate, () => undefined)
  }, 3000)
  warmUp.unref?.()

  return async (req, res) => {
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'GET') {
      res.statusCode = 405
      res.end(JSON.stringify({ message: 'method not allowed' }))
      return
    }

    const force = new URL(req.url || '/', 'http://localhost').searchParams.get('refresh') === '1'
    try {
      res.end(JSON.stringify(await getAiInsUpdateInfo(root, options, force)))
    } catch (error) {
      res.statusCode = 500
      res.end(JSON.stringify({ message: error instanceof Error ? error.message : String(error) }))
    }
  }
}
