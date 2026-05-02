import type { DevInspectAgentProviderInput, DevInspectClientAgentProvider, DevInspectPluginOptions, ResolvedDevInspectAgentProvider } from './types'
import { resolveCommand } from './editor'
import { getConfiguredAgentProxy } from './proxy'

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

export function resolveAgentProviders(root: string, options: DevInspectPluginOptions, pluginProxy: string) {
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
