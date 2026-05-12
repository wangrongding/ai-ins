import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { createAiInsMiddlewares, getAiInsClientCode, normalizeProxy } from '@ai-ins/core'
import type { AiInsMiddleware, AiInsPluginOptions } from '@ai-ins/core'

export type { AiInsPluginOptions }

export type AiInsNextPluginOptions = AiInsPluginOptions & {
  middlewarePort?: number
}

type NextConfig = import('next').NextConfig & {
  rewrites?: NextRewrites
  turbopack?: {
    rules?: Record<string, unknown>
  } & import('next').NextConfig['turbopack']
}

type NextConfigExport = NextConfig | ((phase: string, context?: unknown) => NextConfig | Promise<NextConfig>)

type NextRewrites =
  | (() => Promise<Rewrite[] | { afterFiles?: Rewrite[]; beforeFiles?: Rewrite[]; fallback?: Rewrite[] }>)
  | Rewrite[]
  | { afterFiles?: Rewrite[]; beforeFiles?: Rewrite[]; fallback?: Rewrite[] }

type Rewrite = {
  destination: string
  source: string
}

type WebpackConfig = {
  entry?: unknown
  module?: {
    rules?: unknown[]
  }
}

type WebpackContext = {
  dev?: boolean
  dir?: string
  isServer?: boolean
}

type AiInsServerState = {
  port: number
  server: Server
}

const packageDirectory = __dirname
const developmentPhase = 'phase-development-server'
const aiInsServers = new Map<string, Promise<AiInsServerState>>()

function getBundledAssetPath(fileName: string) {
  const sourcePath = join(packageDirectory, '..', 'src', fileName)
  return existsSync(sourcePath) ? sourcePath : join(packageDirectory, fileName)
}

const clientEntryPath = getBundledAssetPath('client-entry.js')
const sourceLoaderPath = getBundledAssetPath('source-loader.cjs')

function hasEntryValue(entry: unknown, value: string): boolean {
  if (entry === value) return true
  if (Array.isArray(entry)) return entry.some((item) => hasEntryValue(item, value))
  if (entry && typeof entry === 'object') return Object.values(entry).some((item) => hasEntryValue(item, value))
  return false
}

function prependEntry(entry: unknown, value: string): unknown {
  if (hasEntryValue(entry, value)) return entry
  if (!entry) return [value]
  if (typeof entry === 'string') return [value, entry]
  if (Array.isArray(entry)) return [value, ...entry]
  if (typeof entry === 'function') {
    return async (...args: unknown[]) => prependEntry(await entry(...args), value)
  }
  if (entry && typeof entry === 'object') {
    if ('import' in entry) {
      return { ...entry, import: prependEntry((entry as { import?: unknown }).import, value) }
    }

    return Object.fromEntries(Object.entries(entry).map(([key, childEntry]) => [key, prependEntry(childEntry, value)]))
  }

  return entry
}

function normalizeRoot(root: string | undefined) {
  return root || process.cwd()
}

function getServerKey(root: string, options: AiInsNextPluginOptions) {
  return `${root}:${options.middlewarePort ?? 0}`
}

function dispatch(routes: Array<{ middleware: AiInsMiddleware; path: string }>, req: IncomingMessage, res: ServerResponse) {
  const pathname = req.url ? new URL(req.url, 'http://localhost').pathname : '/'
  const route = routes.find((candidate) => pathname === candidate.path || pathname.startsWith(`${candidate.path}/`))

  if (!route) {
    res.statusCode = 404
    res.end('AI Ins route not found')
    return
  }

  route.middleware(req, res)
}

function startAiInsServer(root: string, options: AiInsNextPluginOptions) {
  const key = getServerKey(root, options)
  const existing = aiInsServers.get(key)
  if (existing) {
    return existing
  }

  const promise = new Promise<AiInsServerState>((resolve, reject) => {
    const pluginProxy = normalizeProxy(options.codex?.proxy ?? options.proxy)
    const routes = [
      {
        path: '/__ai-ins/client.js',
        middleware: (_req: IncomingMessage, res: ServerResponse) => {
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
          res.end(getAiInsClientCode({ base: '/', defaultProvider: options.agents?.defaultProvider, options, pluginProxy, root }))
        },
      },
      ...createAiInsMiddlewares(root, options),
    ].sort((left, right) => right.path.length - left.path.length)

    const server = createServer((req, res) => dispatch(routes, req, res))
    server.once('error', reject)
    server.listen(options.middlewarePort ?? 0, '127.0.0.1', () => {
      server.off('error', reject)
      const address = server.address()
      if (!address || typeof address === 'string') {
        reject(new Error('failed to start AI Ins middleware server'))
        return
      }

      resolve({ port: address.port, server })
    })
  })

  aiInsServers.set(key, promise)
  return promise
}

function appendWebpackRule(config: WebpackConfig) {
  if (!config.module) config.module = {}
  const rules = config.module.rules ?? []
  config.module.rules = [
    ...rules,
    {
      enforce: 'pre',
      exclude: /node_modules/u,
      test: /\.[cm]?[jt]sx$/u,
      use: sourceLoaderPath,
    },
  ]
}

function withWebpackConfig(config: NextConfig, options: AiInsNextPluginOptions): NextConfig {
  const previousWebpack = config.webpack as ((config: WebpackConfig, context: WebpackContext) => WebpackConfig) | null | undefined

  return {
    ...config,
    webpack(webpackConfig: WebpackConfig, context: WebpackContext) {
      const nextWebpackConfig = previousWebpack ? previousWebpack(webpackConfig, context) : webpackConfig
      if (context.dev && !context.isServer) {
        nextWebpackConfig.entry = prependEntry(nextWebpackConfig.entry, clientEntryPath)
      }
      if (context.dev && !options.disableSourceAttributes) {
        appendWebpackRule(nextWebpackConfig)
      }
      return nextWebpackConfig
    },
  }
}

function withTurbopackConfig(config: NextConfig, options: AiInsNextPluginOptions): NextConfig {
  if (options.disableSourceAttributes) {
    return config
  }

  const turbopack = config.turbopack ?? {}
  const rules = turbopack.rules ?? {}

  return {
    ...config,
    turbopack: {
      ...turbopack,
      rules: {
        ...rules,
        '*.{jsx,tsx}': {
          as: '*.js',
          loaders: [sourceLoaderPath],
        },
      },
    },
  }
}

async function resolveRewrites(rewrites: NextRewrites | undefined) {
  const value = typeof rewrites === 'function' ? await rewrites() : rewrites
  if (!value) {
    return []
  }

  return value
}

async function mergeRewrites(rewrites: NextRewrites | undefined, middlewarePort: number) {
  const aiInsRewrites: Rewrite[] = [
    {
      source: '/__ai-ins/:path*',
      destination: `http://127.0.0.1:${middlewarePort}/__ai-ins/:path*`,
    },
    {
      source: '/__ai-ins-agent/:path*',
      destination: `http://127.0.0.1:${middlewarePort}/__ai-ins-agent/:path*`,
    },
    {
      source: '/__open-in-editor',
      destination: `http://127.0.0.1:${middlewarePort}/__open-in-editor`,
    },
    {
      source: '/__reveal-in-folder',
      destination: `http://127.0.0.1:${middlewarePort}/__reveal-in-folder`,
    },
  ]
  const existing = await resolveRewrites(rewrites)

  if (Array.isArray(existing)) {
    return [...aiInsRewrites, ...existing]
  }

  return {
    ...existing,
    beforeFiles: [...aiInsRewrites, ...(existing.beforeFiles ?? [])],
  }
}

export function withAiIns(nextConfig: NextConfigExport = {}, options: AiInsNextPluginOptions = {}) {
  return async (phase: string, context?: unknown) => {
    const resolvedConfig = typeof nextConfig === 'function' ? await nextConfig(phase, context) : nextConfig
    const root = normalizeRoot(typeof context === 'object' && context && 'dir' in context ? String((context as { dir?: unknown }).dir ?? '') : undefined)
    const config = withTurbopackConfig(withWebpackConfig(resolvedConfig, options), options)

    if (phase !== developmentPhase) {
      return config
    }

    const { port } = await startAiInsServer(root, options)
    const previousRewrites = config.rewrites

    return {
      ...config,
      async rewrites() {
        return mergeRewrites(previousRewrites, port)
      },
    }
  }
}

export const aiIns = withAiIns
export default withAiIns
