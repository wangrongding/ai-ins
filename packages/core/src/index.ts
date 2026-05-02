import { getDevInspectClientSource } from './client-source'
import {
  codexInspectEditMiddleware,
  codexInspectEventsMiddleware,
  codexInspectRunsMiddleware,
  openInEditorMiddleware,
} from './middleware'
import { getClientAgentProviders, getDefaultAgentProviderId } from './providers'
import { getConfiguredCodexProxy, normalizeProxy } from './proxy'
import type { DevInspectPluginOptions, DevInspectRoute } from './types'

export { ensureLaunchEditor } from './editor'
export {
  codexInspectEditMiddleware,
  codexInspectEventsMiddleware,
  codexInspectRunsMiddleware,
  openInEditorMiddleware,
} from './middleware'
export { getClientAgentProviders, getDefaultAgentProviderId } from './providers'
export { getConfiguredCodexProxy, normalizeProxy } from './proxy'
export type { DevInspectAgentProviderInput, DevInspectMiddleware, DevInspectPluginOptions, DevInspectRoute } from './types'

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

  return getDevInspectClientSource()
    .replace('__WBX_ROOT__', JSON.stringify(input.root))
    .replace('__WBX_BASE__', JSON.stringify(input.base ?? '/'))
    .replace('__WBX_AGENT_PROXY__', JSON.stringify(getConfiguredCodexProxy(pluginProxy)))
    .replace('__WBX_AGENT_PROVIDERS__', JSON.stringify(agentProviders))
    .replace(
      '__WBX_DEFAULT_AGENT_PROVIDER__',
      JSON.stringify(getDefaultAgentProviderId(agentProviders, input.defaultProvider ?? options.agents?.defaultProvider)),
    )
}
