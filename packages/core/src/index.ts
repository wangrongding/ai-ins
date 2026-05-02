import { devInspectClientSource } from './client-source'
import { spawn, execSync } from 'child_process'
import type { ChildProcess } from 'child_process'
import { createWriteStream, existsSync, mkdirSync, readFileSync } from 'fs'
import type { IncomingMessage, ServerResponse } from 'http'
import { basename, isAbsolute, join, relative, resolve } from 'path'
import { fileURLToPath } from 'url'

export type DevInspectMiddleware = (req: IncomingMessage, res: ServerResponse, next?: () => void) => void

export type DevInspectRoute = {
  path: string
  middleware: DevInspectMiddleware
}

const macLaunchEditorCandidates = [
  '/Applications/Cursor.app/Contents/MacOS/Cursor',
  '/Applications/Visual Studio Code.app/Contents/MacOS/Code',
  '/Applications/Visual Studio Code - Insiders.app/Contents/MacOS/Code - Insiders',
  '/Applications/VSCodium.app/Contents/MacOS/Electron',
  '/Applications/Zed.app/Contents/MacOS/zed',
  '/Applications/WebStorm.app/Contents/MacOS/webstorm',
]

const commandLaunchEditorCandidates = ['cursor', 'code-insiders', 'code', 'codium', 'vscodium', 'zed', 'webstorm']
const maxBufferedCodexInspectEvents = 800
let cachedSystemProxy: string | undefined

type DevInspectRunStatus = 'done' | 'failed' | 'running' | 'starting'

type CodexInspectEvent = {
  code?: number | null
  logPath?: string
  message?: string
  pid?: number
  providerId?: string
  providerLabel?: string
  signal?: NodeJS.Signals | null
  stream?: 'stderr' | 'stdout'
  type: 'done' | 'error' | 'heartbeat' | 'output' | 'status'
}

type CodexInspectRun = {
  child?: ChildProcess
  code?: number | null
  completed: boolean
  createdAt: number
  events: CodexInspectEvent[]
  fileName: string
  lineNumber: number
  logPath: string
  prompt: string
  providerId: string
  providerLabel: string
  signal?: NodeJS.Signals | null
  sourceName: string
  sourcePath: string
  status: DevInspectRunStatus
  statusMessage: string
  subscribers: Set<ServerResponse>
}

export type DevInspectAgentProviderInput = {
  args?: string[]
  command?: string
  disabledReason?: string
  enabled?: boolean
  id: string
  input?: 'argument' | 'stdin'
  label?: string
  output?: 'codex-json' | 'jsonl' | 'plain'
  proxy?: string
}

type ResolvedDevInspectAgentProvider = {
  args: string[]
  command: string
  disabledReason?: string
  enabled: boolean
  id: string
  input: 'argument' | 'stdin'
  label: string
  output: 'codex-json' | 'jsonl' | 'plain'
  proxy: string
}

type DevInspectClientAgentProvider = {
  disabledReason?: string
  enabled: boolean
  id: string
  label: string
}

export type DevInspectPluginOptions = {
  agents?: {
    defaultProvider?: string
    providers?: DevInspectAgentProviderInput[]
  }
  codex?: {
    command?: string
    model?: string
    proxy?: string
  }
  proxy?: string
}

const codexInspectRuns = new Map<string, CodexInspectRun>()

export function getConfiguredCodexProxy(pluginProxy = '') {
  return (
    normalizeProxy(pluginProxy) ||
    normalizeProxy(process.env.CODEX_INSPECT_PROXY) ||
    normalizeProxy(process.env.HTTPS_PROXY) ||
    normalizeProxy(process.env.HTTP_PROXY) ||
    normalizeProxy(process.env.ALL_PROXY) ||
    normalizeProxy(process.env.https_proxy) ||
    normalizeProxy(process.env.http_proxy) ||
    normalizeProxy(process.env.all_proxy) ||
    getSystemProxy()
  )
}

function getConfiguredAgentProxy(providerProxy = '', fallbackProxy = '') {
  return (
    normalizeProxy(providerProxy) ||
    normalizeProxy(fallbackProxy) ||
    normalizeProxy(process.env.CODEX_INSPECT_PROXY) ||
    normalizeProxy(process.env.HTTPS_PROXY) ||
    normalizeProxy(process.env.HTTP_PROXY) ||
    normalizeProxy(process.env.ALL_PROXY) ||
    normalizeProxy(process.env.https_proxy) ||
    normalizeProxy(process.env.http_proxy) ||
    normalizeProxy(process.env.all_proxy) ||
    getSystemProxy()
  )
}

function getSystemProxy() {
  if (cachedSystemProxy !== undefined) {
    return cachedSystemProxy
  }

  if (process.platform === 'darwin') {
    cachedSystemProxy = getMacSystemProxy()
  } else if (process.platform === 'win32') {
    cachedSystemProxy = getWindowsSystemProxy()
  } else {
    cachedSystemProxy = ''
  }

  return cachedSystemProxy
}

function getMacSystemProxy() {
  try {
    return parseMacSystemProxy(execSync('scutil --proxy', { stdio: ['ignore', 'pipe', 'ignore'] }).toString())
  } catch {
    return ''
  }
}

function parseMacSystemProxy(output: string) {
  const entries = new Map<string, string>()
  for (const line of output.split(/\r?\n/u)) {
    const match = line.match(/^\s*([A-Za-z]+)\s*:\s*(.+?)\s*$/u)
    if (match) {
      entries.set(match[1], match[2])
    }
  }

  return (
    getMacProxyUrl(entries, 'HTTPS', 'http') ||
    getMacProxyUrl(entries, 'HTTP', 'http') ||
    getMacProxyUrl(entries, 'SOCKS', 'socks5')
  )
}

function getMacProxyUrl(entries: Map<string, string>, key: 'HTTP' | 'HTTPS' | 'SOCKS', protocol: 'http' | 'socks5') {
  if (entries.get(`${key}Enable`) !== '1') {
    return ''
  }

  const host = entries.get(`${key}Proxy`)
  const port = entries.get(`${key}Port`)
  if (!host || !port) {
    return ''
  }

  return normalizeProxy(`${protocol}://${host}:${port}`)
}

function getWindowsSystemProxy() {
  try {
    return parseWindowsSystemProxy(
      execSync('reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyEnable /v ProxyServer', {
        stdio: ['ignore', 'pipe', 'ignore'],
      }).toString(),
    )
  } catch {
    return ''
  }
}

function parseWindowsSystemProxy(output: string) {
  const proxyEnable = output.match(/\bProxyEnable\s+REG_DWORD\s+0x([0-9a-f]+)/iu)?.[1]
  if (proxyEnable !== '1') {
    return ''
  }

  const proxyServer = output.match(/\bProxyServer\s+REG_SZ\s+(.+?)\s*$/imu)?.[1]?.trim()
  if (!proxyServer) {
    return ''
  }

  return getWindowsProxyUrl(proxyServer)
}

function getWindowsProxyUrl(proxyServer: string) {
  const entries = proxyServer.includes(';')
    ? Object.fromEntries(
        proxyServer
          .split(';')
          .map((entry) => entry.trim().split('='))
          .filter((entry): entry is [string, string] => entry.length === 2 && Boolean(entry[0] && entry[1])),
      )
    : {}

  return (
    normalizeWindowsProxyEntry(entries.https, 'http') ||
    normalizeWindowsProxyEntry(entries.http, 'http') ||
    normalizeWindowsProxyEntry(entries.socks, 'socks5') ||
    normalizeWindowsProxyEntry(proxyServer, 'http')
  )
}

function normalizeWindowsProxyEntry(proxy: string | undefined, protocol: 'http' | 'socks5') {
  if (!proxy || proxy.includes('=')) {
    return ''
  }

  if (/^[a-z][a-z0-9+.-]*:\/\//iu.test(proxy)) {
    return normalizeProxy(proxy)
  }

  return normalizeProxy(`${protocol}://${proxy}`)
}

function getRunningProcesses() {
  return execSync('ps x -o comm=', {
    stdio: ['ignore', 'pipe', 'ignore'],
  }).toString()
}

function commandExists(command: string) {
  try {
    execSync(`command -v ${command}`, {
      shell: '/bin/zsh',
      stdio: ['ignore', 'ignore', 'ignore'],
    })
    return true
  } catch {
    return false
  }
}

function sendCodexInspectEvent(res: ServerResponse, event: CodexInspectEvent) {
  res.write(`data: ${JSON.stringify(event)}\n\n`)
}

function appendCodexInspectEvent(runId: string, event: CodexInspectEvent) {
  const run = codexInspectRuns.get(runId)
  if (!run) {
    return
  }

  if (event.type === 'status' || event.type === 'heartbeat') {
    run.status = run.completed ? run.status : 'running'
    run.statusMessage = event.message || run.statusMessage
  }

  if (event.type === 'output') {
    run.status = run.completed ? run.status : 'running'
  }

  if (event.type === 'error') {
    run.completed = true
    run.status = 'failed'
    run.statusMessage = event.message || run.statusMessage
  }

  if (event.type === 'done') {
    run.code = event.code
    run.completed = true
    run.signal = event.signal
    run.status = event.code === 0 ? 'done' : 'failed'
    run.statusMessage = event.code === 0 ? `${run.providerLabel} 已完成` : `${run.providerLabel} 退出：code=${event.code ?? 'null'}`
  }

  run.events.push(event)
  if (run.events.length > maxBufferedCodexInspectEvents) {
    run.events.splice(0, run.events.length - maxBufferedCodexInspectEvents)
  }

  for (const subscriber of run.subscribers) {
    sendCodexInspectEvent(subscriber, event)
  }
}

function createCodexInspectRun(
  runId: string,
  logPath: string,
  provider: Pick<ResolvedDevInspectAgentProvider, 'id' | 'label'>,
  metadata: {
    fileName: string
    lineNumber: number
    prompt: string
    sourceName: string
    sourcePath: string
  },
) {
  codexInspectRuns.set(runId, {
    completed: false,
    createdAt: Date.now(),
    events: [],
    fileName: metadata.fileName,
    lineNumber: metadata.lineNumber,
    logPath,
    prompt: metadata.prompt,
    providerId: provider.id,
    providerLabel: provider.label,
    sourceName: metadata.sourceName,
    sourcePath: metadata.sourcePath,
    status: 'starting',
    statusMessage: `${provider.label} 启动中`,
    subscribers: new Set(),
  })
}

function resolveCommand(command: string) {
  if (isAbsolute(command) || command.includes('/')) {
    return existsSync(command) ? command : null
  }

  return commandExists(command) ? command : null
}

export function ensureLaunchEditor(command: string) {
  if (command !== 'serve' || process.platform !== 'darwin' || process.env.LAUNCH_EDITOR) {
    return
  }

  try {
    const runningProcesses = getRunningProcesses()
    const preferredEditor = macLaunchEditorCandidates.find((candidate) => existsSync(candidate) && runningProcesses.includes(candidate))

    if (preferredEditor) {
      process.env.LAUNCH_EDITOR = preferredEditor
    }
  } catch {
    // Keep explicit LAUNCH_EDITOR / command lookup as fallback.
  }
}

function resolveLaunchEditor() {
  if (process.env.LAUNCH_EDITOR) {
    return process.env.LAUNCH_EDITOR
  }

  if (process.platform === 'darwin') {
    try {
      const runningProcesses = getRunningProcesses()
      const preferredEditor = macLaunchEditorCandidates.find((candidate) => existsSync(candidate) && runningProcesses.includes(candidate))

      if (preferredEditor) {
        return preferredEditor
      }
    } catch {
      // Fall through to PATH lookup.
    }
  }

  return commandLaunchEditorCandidates.find((candidate) => commandExists(candidate)) ?? null
}

function parseOpenInEditorTarget(rawTarget: string, root: string) {
  const normalizedTarget = rawTarget.startsWith('file://') ? fileURLToPath(rawTarget) : rawTarget
  const match = normalizedTarget.match(/:(\d+)(?::(\d+))?$/)
  const fileName = (match ? normalizedTarget.slice(0, normalizedTarget.length - match[0].length) : normalizedTarget).replace(/^\/private/, '')

  return {
    columnNumber: match?.[2] ? Number(match[2]) : 1,
    fileName: isAbsolute(fileName) ? fileName : resolve(root, fileName),
    lineNumber: match?.[1] ? Number(match[1]) : 1,
  }
}

function parseSourceRangeTarget(rawTarget: string, root: string) {
  const normalizedTarget = rawTarget.startsWith('file://') ? fileURLToPath(rawTarget) : rawTarget
  const match = normalizedTarget.match(/:(\d+):(\d+)-(\d+):(\d+)$/)
  if (!match) {
    return null
  }

  const fileName = normalizedTarget.slice(0, normalizedTarget.length - match[0].length).replace(/^\/private/, '')
  return {
    endColumnNumber: Number(match[4]),
    endLineNumber: Number(match[3]),
    fileName: isAbsolute(fileName) ? fileName : resolve(root, fileName),
    startColumnNumber: Number(match[2]),
    startLineNumber: Number(match[1]),
  }
}

function isPathInsideRoot(fileName: string, root: string) {
  const relativePath = relative(root, fileName)
  return relativePath && !relativePath.startsWith('..') && !isAbsolute(relativePath)
}

function getSourceContext(fileName: string, lineNumber: number, radius = 12, endLineNumber = lineNumber) {
  const lines = readFileSync(fileName, 'utf-8').split(/\r?\n/u)
  const startLine = Math.max(1, lineNumber - radius)
  const endLine = Math.min(lines.length, Math.max(lineNumber, endLineNumber) + radius)
  const lineNumberWidth = String(endLine).length
  const text = lines
    .slice(startLine - 1, endLine)
    .map((line, index) => {
      const sourceLine = startLine + index
      const marker = sourceLine >= lineNumber && sourceLine <= endLineNumber ? '>' : ' '
      return `${marker} ${String(sourceLine).padStart(lineNumberWidth, ' ')} | ${line}`
    })
    .join('\n')

  return { endLine, startLine, text }
}

function getDisplayPath(fileName: string, root: string) {
  const relativePath = relative(root, fileName)
  return relativePath && !relativePath.startsWith('..') && !isAbsolute(relativePath) ? relativePath : fileName
}

function readRequestBody(req: IncomingMessage, limit = 1024 * 1024) {
  return new Promise<string>((resolveBody, reject) => {
    let body = ''

    req.setEncoding('utf-8')
    req.on('data', (chunk: string) => {
      body += chunk

      if (body.length > limit) {
        reject(new Error('request body too large'))
        req.destroy()
      }
    })
    req.on('end', () => resolveBody(body))
    req.on('error', reject)
  })
}

function getLayerSummary(rawLayers: unknown, root: string) {
  if (!Array.isArray(rawLayers)) {
    return 'No DOM source stack was provided.'
  }

  const layers = rawLayers
    .filter((layer): layer is { name?: unknown; path?: unknown; range?: unknown } => Boolean(layer) && typeof layer === 'object')
    .map((layer) => {
      const name = typeof layer.name === 'string' ? layer.name : 'unknown'
      const path = typeof layer.path === 'string' ? layer.path : ''
      const range = typeof layer.range === 'string' ? parseSourceRangeTarget(layer.range, root) : null

      if (!path) {
        return `- ${name}`
      }

      const { columnNumber, fileName, lineNumber } = parseOpenInEditorTarget(path, root)
      const displayPath = getDisplayPath(fileName, root)
      return range && range.fileName === fileName
        ? `- ${name}: ${displayPath}:${range.startLineNumber}:${range.startColumnNumber}-${range.endLineNumber}:${range.endColumnNumber}`
        : `- ${name}: ${displayPath}:${lineNumber}:${columnNumber}`
    })

  return layers.length ? layers.join('\n') : 'No DOM source stack was provided.'
}

function getSourceRangeForTarget(rawLayers: unknown, fileName: string, lineNumber: number, root: string) {
  if (!Array.isArray(rawLayers)) {
    return null
  }

  for (const layer of rawLayers) {
    if (!layer || typeof layer !== 'object' || !('range' in layer) || typeof layer.range !== 'string') {
      continue
    }

    const range = parseSourceRangeTarget(layer.range, root)
    if (range && range.fileName === fileName && range.startLineNumber === lineNumber) {
      return range
    }
  }

  return null
}

function getLayerNameForTarget(rawLayers: unknown, fileName: string, lineNumber: number, root: string) {
  if (!Array.isArray(rawLayers)) {
    return getDisplayPath(fileName, root)
  }

  let fallbackName = ''
  for (const layer of rawLayers) {
    if (!layer || typeof layer !== 'object') {
      continue
    }

    const name = 'name' in layer && typeof layer.name === 'string' ? layer.name : ''
    const path = 'path' in layer && typeof layer.path === 'string' ? layer.path : ''
    if (!name || !path) {
      continue
    }

    if (!fallbackName) {
      fallbackName = name
    }

    const parsedTarget = parseOpenInEditorTarget(path, root)
    if (parsedTarget.fileName === fileName && parsedTarget.lineNumber === lineNumber) {
      return name
    }
  }

  return fallbackName || getDisplayPath(fileName, root)
}

function getRunOutput(run: CodexInspectRun, root: string) {
  const output = run.events
    .filter((event) => event.type === 'output' || event.type === 'error')
    .map((event) => {
      const prefix = event.stream === 'stderr' ? '[stderr] ' : ''
      return event.type === 'error' ? `\n[inspect] ${event.message || 'Agent failed'}\n` : `${prefix}${event.message || ''}`
    })
    .join('')

  return `${run.providerLabel} 已启动\n日志：${getDisplayPath(run.logPath, root)}\n\n${output}`
}

function getCodexInspectRunSummary(runId: string, run: CodexInspectRun, root: string) {
  return {
    code: run.code,
    completed: run.completed,
    createdAt: run.createdAt,
    id: runId,
    lineNumber: run.lineNumber,
    logPath: run.logPath,
    output: getRunOutput(run, root),
    prompt: run.prompt,
    providerId: run.providerId,
    providerLabel: run.providerLabel,
    signal: run.signal,
    sourceName: run.sourceName,
    sourcePath: run.sourcePath,
    status: run.status,
    statusMessage: run.statusMessage,
  }
}

export function normalizeProxy(rawProxy: unknown) {
  const proxy = typeof rawProxy === 'string' ? rawProxy.trim() : ''
  if (!proxy) {
    return ''
  }

  try {
    const url = new URL(proxy)
    if (!['http:', 'https:', 'socks4:', 'socks5:'].includes(url.protocol)) {
      return ''
    }

    return url.toString()
  } catch {
    return ''
  }
}

function getCodexEnv(proxy: string) {
  const env = { ...process.env }

  if (!proxy) {
    return env
  }

  env.HTTP_PROXY = proxy
  env.HTTPS_PROXY = proxy
  env.ALL_PROXY = proxy
  env.http_proxy = proxy
  env.https_proxy = proxy
  env.all_proxy = proxy

  return env
}

function getCodexArgs(root: string, options: DevInspectPluginOptions) {
  const args = ['--ask-for-approval', 'never', 'exec', '--json', '--cd', root, '--sandbox', 'workspace-write', '--ephemeral', '--color', 'never']
  const model = options.codex?.model || process.env.CODEX_INSPECT_MODEL

  if (model) {
    args.push('--model', model)
  }

  args.push('-')
  return args
}

function getBuiltinAgentProviders(root: string, options: DevInspectPluginOptions, pluginProxy: string): ResolvedDevInspectAgentProvider[] {
  const codexProxy = getConfiguredAgentProxy(options.codex?.proxy, pluginProxy)

  return [
    {
      args: getCodexArgs(root, options),
      command: options.codex?.command || process.env.CODEX_CLI || 'codex',
      enabled: true,
      id: 'codex',
      input: 'stdin',
      label: 'Codex',
      output: 'codex-json',
      proxy: codexProxy,
    },
    {
      args: ['-p', '--permission-mode', 'acceptEdits', '--output-format', 'stream-json', '--include-partial-messages', '--no-session-persistence'],
      command: process.env.CLAUDE_CLI || 'claude',
      enabled: true,
      id: 'claude',
      input: 'argument',
      label: 'Claude',
      output: 'jsonl',
      proxy: getConfiguredAgentProxy('', pluginProxy),
    },
    {
      args: [],
      command: '',
      disabledReason: 'Copilot 还没有标准的本地改码 CLI，请在 devInspectPlugin({ agents: { providers: [...] } }) 里配置适配器。',
      enabled: false,
      id: 'copilot',
      input: 'stdin',
      label: 'Copilot',
      output: 'plain',
      proxy: getConfiguredAgentProxy('', pluginProxy),
    },
  ]
}

function mergeAgentProvider(
  base: ResolvedDevInspectAgentProvider | undefined,
  input: DevInspectAgentProviderInput,
  pluginProxy: string,
): ResolvedDevInspectAgentProvider {
  return {
    args: input.args ?? base?.args ?? [],
    command: input.command ?? base?.command ?? '',
    disabledReason: input.disabledReason ?? base?.disabledReason,
    enabled: input.enabled ?? base?.enabled ?? true,
    id: input.id,
    input: input.input ?? base?.input ?? 'stdin',
    label: input.label ?? base?.label ?? input.id,
    output: input.output ?? base?.output ?? 'plain',
    proxy: getConfiguredAgentProxy(input.proxy, base?.proxy || pluginProxy),
  }
}

function resolveAgentProviders(root: string, options: DevInspectPluginOptions, pluginProxy: string) {
  const providers = new Map(getBuiltinAgentProviders(root, options, pluginProxy).map((provider) => [provider.id, provider]))

  for (const providerInput of options.agents?.providers ?? []) {
    providers.set(providerInput.id, mergeAgentProvider(providers.get(providerInput.id), providerInput, pluginProxy))
  }

  return [...providers.values()].map((provider) => {
    if (!provider.enabled) {
      return provider
    }

    if (!provider.command) {
      return {
        ...provider,
        disabledReason: provider.disabledReason || `${provider.label} 没有配置可执行命令。`,
        enabled: false,
      }
    }

    if (!resolveCommand(provider.command)) {
      return {
        ...provider,
        disabledReason: `${provider.label} CLI not found: ${provider.command}`,
        enabled: false,
      }
    }

    return provider
  })
}

export function getClientAgentProviders(root: string, options: DevInspectPluginOptions, pluginProxy: string): DevInspectClientAgentProvider[] {
  return resolveAgentProviders(root, options, pluginProxy).map((provider) => ({
    disabledReason: provider.disabledReason,
    enabled: provider.enabled,
    id: provider.id,
    label: provider.label,
  }))
}

export function getDefaultAgentProviderId(providers: DevInspectClientAgentProvider[], preferredProviderId = 'codex') {
  return (
    providers.find((provider) => provider.id === preferredProviderId && provider.enabled)?.id ||
    providers.find((provider) => provider.enabled)?.id ||
    providers[0]?.id ||
    'codex'
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function getStringRecordValue(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  return ''
}

function collectJsonText(value: unknown, depth = 0): string[] {
  if (depth > 5 || value === null || value === undefined) {
    return []
  }

  if (typeof value === 'string') {
    return value.trim() ? [value] : []
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return []
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectJsonText(item, depth + 1))
  }

  if (!isRecord(value)) {
    return []
  }

  const directText = getStringRecordValue(value, ['message', 'text', 'delta', 'content', 'summary', 'title', 'command', 'cmd', 'error', 'status'])
  if (directText) {
    return [directText]
  }

  return ['message', 'delta', 'content', 'item', 'event', 'tool_call', 'toolCall', 'result', 'data']
    .flatMap((key) => collectJsonText(value[key], depth + 1))
    .filter(Boolean)
}

function truncateAgentOutput(message: string, maxLength = 2400) {
  return message.length > maxLength ? `${message.slice(0, maxLength)}\n[inspect] output truncated\n` : message
}

function formatAgentJsonLine(rawEvent: unknown) {
  if (!isRecord(rawEvent)) {
    return `${truncateAgentOutput(JSON.stringify(rawEvent))}\n`
  }

  const eventType = getStringRecordValue(rawEvent, ['type', 'event', 'kind', 'sessionUpdate'])
  const text = collectJsonText(rawEvent)
    .filter((part) => part !== eventType)
    .join('')
    .trim()

  if (text) {
    if (/chunk|delta|partial/iu.test(eventType)) {
      return truncateAgentOutput(text)
    }

    return eventType ? `[${eventType}] ${truncateAgentOutput(text)}\n` : `${truncateAgentOutput(text)}\n`
  }

  const compactJson = truncateAgentOutput(JSON.stringify(rawEvent))
  return eventType ? `[${eventType}] ${compactJson}\n` : `${compactJson}\n`
}

function buildAgentPrompt(options: {
  columnNumber: number
  context: ReturnType<typeof getSourceContext>
  endColumnNumber?: number
  endLineNumber?: number
  fileName: string
  lineNumber: number
  rawPrompt: string
  root: string
  layerSummary: string
}) {
  const { columnNumber, context, endColumnNumber, endLineNumber, fileName, layerSummary, lineNumber, rawPrompt, root } = options
  const displayPath = getDisplayPath(fileName, root)
  const sourceRange =
    endLineNumber && endColumnNumber
      ? `${displayPath}:${lineNumber}:${columnNumber}-${endLineNumber}:${endColumnNumber}`
      : `${displayPath}:${lineNumber}:${columnNumber}`

  return `You are an AI coding agent invoked from Agent Dev's dev inspect tool after the user Option-clicked a DOM node in the running Vite app.

User request:
${rawPrompt}

Clicked source location:
- ${displayPath}:${lineNumber}:${columnNumber}
- Source range: ${sourceRange}
- Context window: L${context.startLine}-L${context.endLine}

DOM source stack from clicked element:
${layerSummary}

Source excerpt:
\`\`\`
${context.text}
\`\`\`

Please edit the repository directly. Keep the change narrowly scoped to the clicked component/source region unless the request clearly requires nearby supporting changes. Preserve existing project style and run focused checks if they are cheap.`
}

function getEditorArgs(editor: string, fileName: string, lineNumber: number, columnNumber: number) {
  switch (basename(editor).replace(/\.(exe|cmd|bat)$/i, '')) {
    case 'Code':
    case 'Code - Insiders':
    case 'code':
    case 'code-insiders':
    case 'codium':
    case 'cursor':
    case 'Electron':
    case 'VSCodium':
    case 'zed':
      return ['-r', '-g', `${fileName}:${lineNumber}:${columnNumber}`]
    case 'webstorm':
      return ['--line', String(lineNumber), '--column', String(columnNumber), fileName]
    default:
      return [fileName]
  }
}

export function codexInspectEventsMiddleware(): DevInspectMiddleware {
  return (req, res) => {
    if (req.method !== 'GET') {
      res.statusCode = 405
      res.end('method not allowed')
      return
    }

    const requestUrl = req.url ? new URL(req.url, 'http://localhost') : null
    const runId = requestUrl?.searchParams.get('id') || ''
    const run = codexInspectRuns.get(runId)

    if (!run) {
      res.statusCode = 404
      res.end('dev inspect agent run not found')
      return
    }

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders()
    res.write(': connected\n\n')

    run.subscribers.add(res)
    for (const event of run.events) {
      sendCodexInspectEvent(res, event)
    }

    if (run.completed) {
      res.end()
      return
    }

    req.on('close', () => {
      run.subscribers.delete(res)
    })
  }
}

export function codexInspectRunsMiddleware(root: string): DevInspectMiddleware {
  return (req, res) => {
    const requestUrl = req.url ? new URL(req.url, 'http://localhost') : null

    if (req.method === 'GET') {
      const runs = [...codexInspectRuns.entries()]
        .sort(([, firstRun], [, secondRun]) => secondRun.createdAt - firstRun.createdAt)
        .map(([runId, run]) => getCodexInspectRunSummary(runId, run, root))

      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ runs }))
      return
    }

    if (req.method === 'DELETE') {
      const runId = requestUrl?.searchParams.get('id') || ''
      const run = codexInspectRuns.get(runId)

      if (!run) {
        res.statusCode = 404
        res.end('dev inspect agent run not found')
        return
      }

      if (!run.completed) {
        run.child?.kill('SIGTERM')
      }

      for (const subscriber of run.subscribers) {
        subscriber.end()
      }

      codexInspectRuns.delete(runId)
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ success: true }))
      return
    }

    res.statusCode = 405
    res.end('method not allowed')
  }
}

export function codexInspectEditMiddleware(root: string, options: DevInspectPluginOptions, pluginProxy: string): DevInspectMiddleware {
  return async (req, res) => {
    if (req.method !== 'POST') {
      res.statusCode = 405
      res.end('method not allowed')
      return
    }

    try {
      const body = await readRequestBody(req)
      const payload = JSON.parse(body || '{}') as { file?: unknown; layers?: unknown; prompt?: unknown; provider?: unknown; proxy?: unknown }
      const rawTarget = typeof payload.file === 'string' ? payload.file : ''
      const rawPrompt = typeof payload.prompt === 'string' ? payload.prompt.trim() : ''
      const providers = resolveAgentProviders(root, options, pluginProxy)
      const requestedProviderId =
        typeof payload.provider === 'string' && payload.provider.trim() ? payload.provider.trim() : getDefaultAgentProviderId(providers)
      const provider = providers.find((candidate) => candidate.id === requestedProviderId)

      if (!rawTarget) {
        res.statusCode = 400
        res.end('missing file')
        return
      }

      if (!rawPrompt) {
        res.statusCode = 400
        res.end('missing prompt')
        return
      }

      if (!provider) {
        res.statusCode = 400
        res.end(`unknown inspect agent provider: ${requestedProviderId}`)
        return
      }

      if (!provider.enabled) {
        res.statusCode = 400
        res.end(provider.disabledReason || `${provider.label} is disabled`)
        return
      }

      const agentCommand = resolveCommand(provider.command)
      if (!agentCommand) {
        res.statusCode = 500
        res.end(`${provider.label} CLI not found: ${provider.command}`)
        return
      }

      const proxy = normalizeProxy(payload.proxy) || provider.proxy

      const { columnNumber, fileName, lineNumber } = parseOpenInEditorTarget(rawTarget, root)
      if (!isPathInsideRoot(fileName, root)) {
        res.statusCode = 403
        res.end(`source file outside project root: ${fileName}`)
        return
      }

      if (!existsSync(fileName)) {
        res.statusCode = 404
        res.end(`source file not found: ${fileName}`)
        return
      }

      const sourceRange = getSourceRangeForTarget(payload.layers, fileName, lineNumber, root)
      const context = getSourceContext(fileName, lineNumber, 12, sourceRange?.endLineNumber)
      const layerSummary = getLayerSummary(payload.layers, root)
      const sourceName = getLayerNameForTarget(payload.layers, fileName, lineNumber, root)
      const prompt = buildAgentPrompt({
        columnNumber,
        context,
        endColumnNumber: sourceRange?.endColumnNumber,
        endLineNumber: sourceRange?.endLineNumber,
        fileName,
        layerSummary,
        lineNumber,
        rawPrompt,
        root,
      })

      const logDirectory = join(root, '.codex', 'dev-inspect')
      mkdirSync(logDirectory, { recursive: true })
      const runId = `${new Date().toISOString().replace(/[:.]/gu, '-')}-${provider.id}`
      const logPath = join(logDirectory, `${runId}.log`)
      const logStream = createWriteStream(logPath, { flags: 'a' })
      const args = [...provider.args]
      if (provider.input === 'argument') {
        args.push(prompt)
      }

      logStream.write(`$ ${agentCommand} ${provider.input === 'argument' ? `${provider.args.join(' ')} <prompt>` : args.join(' ')}\n\n${prompt}\n\n`)
      if (proxy) {
        logStream.write(`[inspect] using proxy ${proxy}\n\n`)
      }
      createCodexInspectRun(runId, logPath, provider, {
        fileName,
        lineNumber,
        prompt: rawPrompt,
        sourceName,
        sourcePath: fileName,
      })

      const child = spawn(agentCommand, args, {
        cwd: root,
        env: getCodexEnv(proxy),
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      const run = codexInspectRuns.get(runId)
      if (run) {
        run.child = child
      }
      const startedAt = Date.now()
      let completed = false
      let stdoutBuffer = ''
      const heartbeatTimer = setInterval(() => {
        if (completed) {
          return
        }

        appendCodexInspectEvent(runId, {
          logPath,
          message: `${provider.label} 运行中 · ${Math.max(1, Math.round((Date.now() - startedAt) / 1000))}s`,
          providerId: provider.id,
          providerLabel: provider.label,
          type: 'heartbeat',
        })
      }, 5000)
      ;(heartbeatTimer as unknown as { unref?: () => void }).unref?.()

      appendCodexInspectEvent(runId, {
        logPath,
        message: proxy ? `${provider.label} CLI started with proxy ${proxy}` : `${provider.label} CLI started`,
        pid: child.pid,
        providerId: provider.id,
        providerLabel: provider.label,
        type: 'status',
      })

      const appendOutput = (message: string, stream: 'stderr' | 'stdout') => {
        appendCodexInspectEvent(runId, {
          message,
          providerId: provider.id,
          providerLabel: provider.label,
          stream,
          type: 'output',
        })
      }
      const flushStdoutLine = (line: string) => {
        if (!line.trim()) {
          return
        }

        if (provider.output === 'plain') {
          appendOutput(`${line}\n`, 'stdout')
          return
        }

        try {
          appendOutput(formatAgentJsonLine(JSON.parse(line)), 'stdout')
        } catch {
          appendOutput(`${line}\n`, 'stdout')
        }
      }
      const flushStdoutBuffer = () => {
        if (!stdoutBuffer.trim()) {
          stdoutBuffer = ''
          return
        }

        flushStdoutLine(stdoutBuffer)
        stdoutBuffer = ''
      }
      const handleStdout = (chunk: Buffer) => {
        const message = chunk.toString()
        logStream.write(message)
        if (provider.output === 'plain') {
          appendOutput(message, 'stdout')
          return
        }

        stdoutBuffer += message
        const lines = stdoutBuffer.split(/\r?\n/u)
        stdoutBuffer = lines.pop() ?? ''

        for (const line of lines) {
          flushStdoutLine(line)
        }
      }

      child.stdout.on('data', handleStdout)
      child.stderr.on('data', (chunk: Buffer) => {
        const message = chunk.toString()
        logStream.write(message)
        appendOutput(message, 'stderr')
      })
      child.on('error', (error) => {
        completed = true
        clearInterval(heartbeatTimer)
        const run = codexInspectRuns.get(runId)
        if (run) {
          run.completed = true
        }

        logStream.write(`\n[inspect] ${provider.label} failed to start: ${error.message}\n`)
        appendCodexInspectEvent(runId, {
          message: error.message,
          providerId: provider.id,
          providerLabel: provider.label,
          type: 'error',
        })
        logStream.end()
      })
      child.on('exit', (code, signal) => {
        completed = true
        clearInterval(heartbeatTimer)
        flushStdoutBuffer()
        const run = codexInspectRuns.get(runId)
        if (run) {
          run.completed = true
        }

        logStream.write(`\n[inspect] ${provider.label} exited with code=${code ?? 'null'} signal=${signal ?? 'null'}\n`)
        appendCodexInspectEvent(runId, {
          code,
          providerId: provider.id,
          providerLabel: provider.label,
          signal,
          type: 'done',
        })
        logStream.end()
      })
      if (provider.input === 'stdin') {
        child.stdin.end(prompt)
      } else {
        child.stdin.end()
      }

      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          fileName,
          lineNumber,
          logPath,
          pid: child.pid,
          providerId: provider.id,
          providerLabel: provider.label,
          runId,
          success: true,
        }),
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('[inspect] agent edit failed:', message)
      res.statusCode = 500
      res.end(message)
    }
  }
}

export function openInEditorMiddleware(root: string): DevInspectMiddleware {
  return (req, res) => {
    const requestUrl = req.url ? new URL(req.url, 'http://localhost') : null
    const rawTarget = requestUrl?.searchParams.get('file')

    if (!rawTarget) {
      res.statusCode = 400
      res.end('missing file query parameter')
      return
    }

    const editor = resolveLaunchEditor()
    if (!editor) {
      res.statusCode = 500
      res.end('no supported editor found; set LAUNCH_EDITOR explicitly')
      return
    }

    const { columnNumber, fileName, lineNumber } = parseOpenInEditorTarget(rawTarget, root)
    if (!existsSync(fileName)) {
      res.statusCode = 404
      res.end(`source file not found: ${fileName}`)
      return
    }

    try {
      const child = spawn(editor, getEditorArgs(editor, fileName, lineNumber, columnNumber), {
        detached: true,
        stdio: 'ignore',
      })

      child.unref()
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ editor, fileName, lineNumber, columnNumber }))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('[inspect] open-in-editor failed:', message)
      res.statusCode = 500
      res.end(message)
    }
  }
}

export function createDevInspectMiddlewares(root: string, options: DevInspectPluginOptions = {}): DevInspectRoute[] {
  const codexProxy = normalizeProxy(options.codex?.proxy ?? options.proxy)

  return [
    { path: '/__open-in-editor', middleware: openInEditorMiddleware(root) },
    { path: '/__codex-inspect-edit/events', middleware: codexInspectEventsMiddleware() },
    { path: '/__codex-inspect-edit', middleware: codexInspectEditMiddleware(root, options, codexProxy) },
    { path: '/__dev-inspect-agent/events', middleware: codexInspectEventsMiddleware() },
    { path: '/__dev-inspect-agent/runs', middleware: codexInspectRunsMiddleware(root) },
    { path: '/__dev-inspect-agent', middleware: codexInspectEditMiddleware(root, options, codexProxy) },
  ]
}

export function getDevInspectClientCode(input: {
  base?: string
  defaultProvider?: string
  options?: DevInspectPluginOptions
  pluginProxy?: string
  root: string
}) {
  const options = input.options ?? {}
  const pluginProxy = normalizeProxy(input.pluginProxy ?? options.codex?.proxy ?? options.proxy)
  const agentProviders = getClientAgentProviders(input.root, options, pluginProxy)

  return devInspectClientSource
    .replace('__WBX_ROOT__', JSON.stringify(input.root))
    .replace('__WBX_BASE__', JSON.stringify(input.base ?? '/'))
    .replace('__WBX_AGENT_PROXY__', JSON.stringify(getConfiguredCodexProxy(pluginProxy)))
    .replace('__WBX_AGENT_PROVIDERS__', JSON.stringify(agentProviders))
    .replace(
      '__WBX_DEFAULT_AGENT_PROVIDER__',
      JSON.stringify(getDefaultAgentProviderId(agentProviders, input.defaultProvider ?? options.agents?.defaultProvider)),
    )
}
