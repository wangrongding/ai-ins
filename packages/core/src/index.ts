import { getAiInsClientSource, getAiInsClientWatchFiles } from './client-source'
import {
  aiInsConfigMiddleware,
  aiInsEditMiddleware,
  aiInsEventsMiddleware,
  aiInsRunsMiddleware,
  openInEditorMiddleware,
  revealInFolderMiddleware,
} from './middleware'
import { aiInsPermissionMiddleware } from './permissions'
import { getClientAgentProviders, getDefaultAgentProviderId } from './providers'
import { getConfiguredCodexProxy, normalizeProxy } from './proxy'
import { configureAiInsRunHistory } from './run-history'
import type { AiInsPluginOptions, AiInsRoute } from './types'

export { ensureLaunchEditor } from './editor'
export {
  aiInsConfigMiddleware,
  aiInsEditMiddleware,
  aiInsEventsMiddleware,
  aiInsRunsMiddleware,
  openInEditorMiddleware,
  revealInFolderMiddleware,
} from './middleware'
export { getClientAgentProviders, getDefaultAgentProviderId } from './providers'
export { getConfiguredCodexProxy, normalizeProxy } from './proxy'
export type {
  AiInsAgentPermissionMode,
  AiInsAgentPermissionsInput,
  AiInsAgentProviderInput,
  AiInsAgentSessionInput,
  AiInsAgentSessionMode,
  AiInsMiddleware,
  AiInsPluginOptions,
  AiInsRoute,
} from './types'

export { getAiInsClientWatchFiles } from './client-source'

export function createAiInsMiddlewares(root: string, options: AiInsPluginOptions = {}): AiInsRoute[] {
  const codexProxy = normalizeProxy(options.codex?.proxy ?? options.proxy)
  configureAiInsRunHistory(root, options.agents?.history)

  return [
    { path: '/__open-in-editor', middleware: openInEditorMiddleware(root) },
    { path: '/__reveal-in-folder', middleware: revealInFolderMiddleware(root) },
    { path: '/__ai-ins-config', middleware: aiInsConfigMiddleware(root, options, codexProxy) },
    { path: '/__ai-ins-agent/events', middleware: aiInsEventsMiddleware(root) },
    { path: '/__ai-ins-agent/runs', middleware: aiInsRunsMiddleware(root) },
    // Registered before `/__ai-ins-agent`, which would otherwise match it as a prefix.
    { path: '/__ai-ins-agent/permission', middleware: aiInsPermissionMiddleware(root) },
    { path: '/__ai-ins-agent', middleware: aiInsEditMiddleware(root, options, codexProxy) },
  ]
}

export function getAiInsClientCode(input: {
  base?: string
  defaultProvider?: string
  options?: AiInsPluginOptions
  pluginProxy?: string
  root: string
}) {
  const options = input.options ?? {}
  const pluginProxy = normalizeProxy(input.pluginProxy ?? options.codex?.proxy ?? options.proxy)
  const agentProviders = getClientAgentProviders(input.root, options, pluginProxy)

  return getAiInsClientSource()
    .replace('__WBX_ROOT__', JSON.stringify(input.root))
    .replace('__WBX_BASE__', JSON.stringify(input.base ?? '/'))
    .replace('__WBX_AGENT_PROXY__', JSON.stringify(getConfiguredCodexProxy(pluginProxy)))
    .replace('__WBX_AGENT_PROVIDERS__', JSON.stringify(agentProviders))
    .replace(
      '__WBX_DEFAULT_AGENT_PROVIDER__',
      JSON.stringify(getDefaultAgentProviderId(agentProviders, input.defaultProvider ?? options.agents?.defaultProvider)),
    )
}
