import { createDevInspectMiddlewares, getDevInspectClientCode, normalizeProxy } from '@agent-dev/core'
import type { DevInspectPluginOptions } from '@agent-dev/core'

export type { DevInspectPluginOptions }

export type AgentDevWebpackPluginOptions = DevInspectPluginOptions & { clientPath?: string }

type WebpackCompiler = {
  options?: { devServer?: { setupMiddlewares?: (middlewares: unknown[], devServer: WebpackDevServerLike) => unknown[] } }
}

type WebpackDevServerLike = {
  app?: { use: (path: string, middleware: (...args: unknown[]) => unknown) => void }
  compiler?: { context?: string }
}

export class AgentDevWebpackPlugin {
  readonly name = 'agent-dev:webpack'
  constructor(private readonly options: AgentDevWebpackPluginOptions = {}) {}

  apply(compiler: WebpackCompiler) {
    if (!compiler.options) compiler.options = {}
    if (!compiler.options.devServer) compiler.options.devServer = {}
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
        app.use(pluginOptions.clientPath || '/__agent-dev/client.js', clientMiddleware as (...args: unknown[]) => unknown)
      }
      return previousSetupMiddlewares ? previousSetupMiddlewares(middlewares, devServer) : middlewares
    }
  }
}

export function agentDev(options: AgentDevWebpackPluginOptions = {}) {
  return new AgentDevWebpackPlugin(options)
}

export default AgentDevWebpackPlugin
