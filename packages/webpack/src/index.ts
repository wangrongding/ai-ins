import { join } from 'node:path'
import { createDevInspectMiddlewares, getDevInspectClientCode, normalizeProxy } from '@agent-dev/core'
import type { DevInspectPluginOptions } from '@agent-dev/core'

export type { DevInspectPluginOptions }

export type AgentDevWebpackPluginOptions = DevInspectPluginOptions & { clientPath?: string }

type WebpackCompiler = {
  options?: {
    devServer?: { setupMiddlewares?: (middlewares: unknown[], devServer: WebpackDevServerLike) => unknown[] }
    entry?: unknown
    mode?: string
    module?: { rules?: unknown[] }
  }
}

type WebpackDevServerLike = {
  app?: { use: (path: string, middleware: (...args: unknown[]) => unknown) => void }
  compiler?: { context?: string }
}

const packageDirectory = __dirname
const clientEntryPath = join(packageDirectory, 'client-entry.js')
const sourceLoaderPath = join(packageDirectory, 'source-loader.cjs')

function hasEntryValue(entry: unknown, value: string): boolean {
  if (entry === value) return true
  if (Array.isArray(entry)) return entry.some((item) => hasEntryValue(item, value))
  if (entry && typeof entry === 'object') return Object.values(entry).some((item) => hasEntryValue(item, value))
  return false
}

function prependEntry(entry: unknown, value: string): unknown {
  if (hasEntryValue(entry, value)) return entry
  if (!entry) return [value, './src']
  if (typeof entry === 'string') return [value, entry]
  if (Array.isArray(entry)) return [value, ...entry]
  if (typeof entry === 'function') {
    return async () => prependEntry(await entry(), value)
  }
  if (entry && typeof entry === 'object') {
    if ('import' in entry) {
      return { ...entry, import: prependEntry(entry.import, value) }
    }

    return Object.fromEntries(Object.entries(entry).map(([key, childEntry]) => [key, prependEntry(childEntry, value)]))
  }

  return entry
}

export class AgentDevWebpackPlugin {
  readonly name = 'agent-dev:webpack'
  constructor(private readonly options: AgentDevWebpackPluginOptions = {}) {}

  apply(compiler: WebpackCompiler) {
    if (!compiler.options) compiler.options = {}
    if (!compiler.options.devServer) compiler.options.devServer = {}
    if (compiler.options.mode !== 'production') {
      compiler.options.entry = prependEntry(compiler.options.entry, clientEntryPath)
      if (!compiler.options.module) compiler.options.module = {}
      compiler.options.module.rules = [
        {
          enforce: 'pre',
          exclude: /node_modules/u,
          test: /\.[jt]sx$/u,
          use: sourceLoaderPath,
        },
        ...(compiler.options.module.rules || []),
      ]
    }

    const previousSetupMiddlewares = compiler.options.devServer.setupMiddlewares
    const pluginOptions = this.options

    compiler.options.devServer.setupMiddlewares = (middlewares: unknown[], devServer: WebpackDevServerLike) => {
      const root = devServer.compiler?.context || process.cwd()
      const app = devServer.app
      if (app) {
        for (const route of createDevInspectMiddlewares(root, pluginOptions)) {
          app.use(route.path, route.middleware as (...args: unknown[]) => unknown)
        }
        const clientMiddleware = (_req: unknown, res: { setHeader: (key: string, value: string) => void; end: (body: string) => void }) => {
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
          res.end(getDevInspectClientCode({ base: '/', defaultProvider: pluginOptions.agents?.defaultProvider, options: pluginOptions, pluginProxy: normalizeProxy(pluginOptions.codex?.proxy ?? pluginOptions.proxy), root }))
        }
        app.use('/__agent-dev/client.js', clientMiddleware as (...args: unknown[]) => unknown)
        if (pluginOptions.clientPath && pluginOptions.clientPath !== '/__agent-dev/client.js') {
          app.use(pluginOptions.clientPath, clientMiddleware as (...args: unknown[]) => unknown)
        }
      }
      return previousSetupMiddlewares ? previousSetupMiddlewares(middlewares, devServer) : middlewares
    }
  }
}

export function agentDev(options: AgentDevWebpackPluginOptions = {}) {
  return new AgentDevWebpackPlugin(options)
}

export default AgentDevWebpackPlugin
