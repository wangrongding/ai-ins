import type { AiInsAgentProviderInput, AiInsClientAgentProvider, AiInsPluginOptions, ResolvedAiInsAgentProvider } from './types'
import { resolveCommand } from './editor'
import { getConfiguredAgentProxy, normalizeProxy } from './proxy'

function getCodexArgs(root: string, options: AiInsPluginOptions) {
  const args = ['--ask-for-approval', 'never', 'exec', '--json', '--cd', root, '--sandbox', 'workspace-write', '--ephemeral', '--color', 'never']
  const model = options.codex?.model || process.env.AI_INS_CODEX_MODEL

  if (model) {
    args.push('--model', model)
  }

  args.push('-')
  return args
}

function getCopilotArgs(options: AiInsPluginOptions) {
  const args = ['--allow-all-tools', '--no-color', '--silent', '--stream', 'on', '-p']
  const model = options.copilot?.model || process.env.AI_INS_COPILOT_MODEL

  if (model) {
    args.unshift('--model', model)
  }

  return args
}

function getClaudeArgs(options: AiInsPluginOptions) {
  const args = [
    '-p',
    '--permission-mode',
    'acceptEdits',
    '--output-format',
    'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--no-session-persistence',
  ]
  const model = options.claude?.model || process.env.AI_INS_CLAUDE_MODEL

  if (model) {
    args.push('--model', model)
  }

  return args
}

function getBuiltinAgentProviders(root: string, options: AiInsPluginOptions, pluginProxy: string): ResolvedAiInsAgentProvider[] {
  const codexProxy = getConfiguredAgentProxy(options.codex?.proxy, pluginProxy)
  const claudeProxy = getConfiguredAgentProxy(options.claude?.proxy, pluginProxy)
  const copilotProxy = getConfiguredAgentProxy(options.copilot?.proxy, pluginProxy)

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
      args: getClaudeArgs(options),
      command: options.claude?.command || process.env.CLAUDE_CLI || 'claude',
      enabled: true,
      id: 'claude',
      input: 'argument',
      label: 'Claude',
      output: 'jsonl',
      proxy: claudeProxy,
    },
    {
      args: getCopilotArgs(options),
      command: options.copilot?.command || process.env.COPILOT_CLI || 'copilot',
      enabled: true,
      id: 'copilot',
      input: 'argument',
      label: 'Copilot',
      output: 'plain',
      proxy: copilotProxy,
    },
  ]
}

function mergeAgentProvider(
  base: ResolvedAiInsAgentProvider | undefined,
  input: AiInsAgentProviderInput,
  pluginProxy: string,
): ResolvedAiInsAgentProvider {
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

export function resolveAgentProviders(root: string, options: AiInsPluginOptions, pluginProxy: string) {
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

export function getClientAgentProviders(root: string, options: AiInsPluginOptions, pluginProxy: string): AiInsClientAgentProvider[] {
  return resolveAgentProviders(root, options, pluginProxy).map((provider) => ({
    disabledReason: provider.disabledReason,
    enabled: provider.enabled,
    id: provider.id,
    label: provider.label,
  }))
}

export function getDefaultAgentProviderId(providers: AiInsClientAgentProvider[], preferredProviderId = 'codex') {
  return (
    providers.find((provider) => provider.id === preferredProviderId && provider.enabled)?.id ||
    providers.find((provider) => provider.enabled)?.id ||
    providers[0]?.id ||
    'codex'
  )
}
