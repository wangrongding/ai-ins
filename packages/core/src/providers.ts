import type { AiInsAgentProviderInput, AiInsClientAgentProvider, AiInsPluginOptions, ResolvedAiInsAgentProvider } from './types'
import { getUnsupportedAgentSession, resolveAgentSession } from './agent-session'
import { resolveCommand } from './editor'
import { getSupportedPermissionModes } from './permissions'
import { getConfiguredAgentProxy } from './proxy'

function getModelArgs(flag: string, model: string) {
  return model ? [flag, model] : []
}

function areSessionsEnabled(options: AiInsPluginOptions) {
  return options.agents?.sessions !== false
}

/**
 * Codex mints its own thread id and only reports it on the wire, so the first
 * turn has to run without `--ephemeral` and we scrape `thread.started`.
 *
 * `exec resume` does not accept `--cd` / `--sandbox` / `--color`; those live on
 * the top-level command instead, which is why resume rebuilds the whole line
 * rather than appending to the fresh one.
 */
function getCodexProvider(root: string, options: AiInsPluginOptions, proxy: string): ResolvedAiInsAgentProvider {
  const model = options.codex?.model || process.env.AI_INS_CODEX_MODEL || ''
  const modelArgs = getModelArgs('--model', model)
  const sessions = areSessionsEnabled(options)
  // Approval and sandbox flags go before `exec` so the same position works for
  // `exec resume`, which does not accept `--sandbox` after the subcommand.
  const args = [
    '{permissionArgs}',
    'exec',
    '--json',
    '--cd',
    root,
    ...(sessions ? [] : ['--ephemeral']),
    '--color',
    'never',
    ...modelArgs,
    '-',
  ]

  return {
    args,
    command: options.codex?.command || process.env.CODEX_CLI || 'codex',
    enabled: true,
    id: 'codex',
    input: 'stdin',
    label: 'Codex Cli',
    output: 'codex-json',
    // `codex exec` cannot pause for approval, so there is no `ask` level.
    permissions: {
      edit: ['--ask-for-approval', 'never', '--sandbox', 'workspace-write'],
      full: ['--dangerously-bypass-approvals-and-sandbox'],
    },
    proxy,
    session: sessions
      ? resolveAgentSession(
          {
            mode: 'capture',
            resumeArgs: [
              '{permissionArgs}',
              '--cd',
              root,
              'exec',
              'resume',
              '{sessionId}',
              '--json',
              ...modelArgs,
              '-',
            ],
            resumeInput: 'stdin',
            sessionIdKeys: ['thread_id'],
          },
          'stdin',
        )
      : getUnsupportedAgentSession(),
  }
}

/** Claude lets us pin the id up front, so turn 0 already knows how to resume. */
function getClaudeProvider(options: AiInsPluginOptions, proxy: string): ResolvedAiInsAgentProvider {
  const model = options.claude?.model || process.env.AI_INS_CLAUDE_MODEL || ''
  const modelArgs = getModelArgs('--model', model)
  const sessions = areSessionsEnabled(options)
  const streamArgs = ['{permissionArgs}', '--output-format', 'stream-json', '--verbose', '--include-partial-messages']

  return {
    args: ['-p', ...streamArgs, ...(sessions ? [] : ['--no-session-persistence']), ...modelArgs],
    command: options.claude?.command || process.env.CLAUDE_CLI || 'claude',
    enabled: true,
    id: 'claude',
    input: 'argument',
    label: 'Claude Cli',
    output: 'jsonl',
    permissions: {
      // `-p` cannot show Claude's own approval prompt; the AI Ins MCP bridge
      // answers it from the panel instead.
      ask: ['--permission-mode', 'acceptEdits', '--permission-prompt-tool', 'mcp__ai_ins__approve', '--mcp-config', '{permissionMcpConfig}'],
      edit: ['--permission-mode', 'acceptEdits'],
      full: ['--permission-mode', 'bypassPermissions'],
    },
    proxy,
    session: sessions
      ? resolveAgentSession(
          {
            assignArgs: ['--session-id', '{sessionId}'],
            mode: 'assign',
            resumeArgs: ['-p', '--resume', '{sessionId}', ...streamArgs, ...modelArgs],
            resumeInput: 'argument',
          },
          'argument',
        )
      : getUnsupportedAgentSession(),
  }
}

/** Copilot reuses one `--session-id` flag for both "pin this id" and "resume it". */
function getCopilotProvider(options: AiInsPluginOptions, proxy: string): ResolvedAiInsAgentProvider {
  const model = options.copilot?.model || process.env.AI_INS_COPILOT_MODEL || ''
  const modelArgs = getModelArgs('--model', model)
  const baseArgs = ['--allow-all-tools', '--no-color', '--silent', '--stream', 'on']

  return {
    args: [...modelArgs, ...baseArgs, '-p'],
    command: options.copilot?.command || process.env.COPILOT_CLI || 'copilot',
    enabled: true,
    id: 'copilot',
    input: 'argument',
    label: 'Github Copilot Cli',
    output: 'plain',
    proxy,
    session: areSessionsEnabled(options)
      ? resolveAgentSession(
          {
            assignArgs: ['--session-id', '{sessionId}'],
            mode: 'assign',
            resumeArgs: [...modelArgs, ...baseArgs, '--resume', '{sessionId}', '-p'],
            resumeInput: 'argument',
          },
          'argument',
        )
      : getUnsupportedAgentSession(),
  }
}

/**
 * Cursor's `--resume` and the session id on its `system/init` event are taken
 * from its docs, not verified against a local CLI. If the id never shows up the
 * panel simply keeps "continue" disabled, so an inaccurate key degrades to
 * today's behaviour instead of silently starting a context-free run.
 */
function getCursorProvider(options: AiInsPluginOptions, proxy: string): ResolvedAiInsAgentProvider {
  const model = options.cursor?.model || process.env.AI_INS_CURSOR_MODEL || ''
  const modelArgs = getModelArgs('--model', model)
  const baseArgs = ['--print', '--output-format', 'stream-json']

  return {
    args: [...baseArgs, ...modelArgs],
    command: options.cursor?.command || process.env.CURSOR_AGENT_CLI || 'cursor-agent',
    enabled: true,
    id: 'cursor',
    input: 'argument',
    label: 'Cursor Cli',
    output: 'jsonl',
    proxy,
    session: areSessionsEnabled(options)
      ? resolveAgentSession(
          {
            mode: 'capture',
            resumeArgs: [...baseArgs, '--resume', '{sessionId}', ...modelArgs],
            resumeInput: 'argument',
            sessionIdKeys: ['chatId', 'chat_id', 'session_id', 'sessionId', 'threadId', 'thread_id'],
          },
          'argument',
        )
      : getUnsupportedAgentSession(),
  }
}

/**
 * Gemini CLI has no resume flag we could verify for non-interactive runs, so it
 * stays single-turn rather than shipping a guess.
 */
function getGeminiProvider(options: AiInsPluginOptions, proxy: string): ResolvedAiInsAgentProvider {
  const model = options.gemini?.model || process.env.AI_INS_GEMINI_MODEL || process.env.GEMINI_MODEL || ''

  return {
    args: ['--output-format', 'json', ...getModelArgs('--model', model)],
    command: options.gemini?.command || process.env.GEMINI_CLI || 'gemini',
    enabled: true,
    id: 'gemini',
    input: 'stdin',
    label: 'Gemini Cli',
    output: 'json',
    proxy,
    session: getUnsupportedAgentSession(),
  }
}

function getBuiltinAgentProviders(root: string, options: AiInsPluginOptions, pluginProxy: string): ResolvedAiInsAgentProvider[] {
  return [
    getCodexProvider(root, options, getConfiguredAgentProxy(options.codex?.proxy, pluginProxy)),
    getClaudeProvider(options, getConfiguredAgentProxy(options.claude?.proxy, pluginProxy)),
    getCopilotProvider(options, getConfiguredAgentProxy(options.copilot?.proxy, pluginProxy)),
    getGeminiProvider(options, getConfiguredAgentProxy(options.gemini?.proxy, pluginProxy)),
    getCursorProvider(options, getConfiguredAgentProxy(options.cursor?.proxy, pluginProxy)),
  ]
}

function mergeAgentProvider(
  base: ResolvedAiInsAgentProvider | undefined,
  input: AiInsAgentProviderInput,
  pluginProxy: string,
): ResolvedAiInsAgentProvider {
  const resolvedInput = input.input ?? base?.input ?? 'stdin'

  return {
    args: input.args ?? base?.args ?? [],
    command: input.command ?? base?.command ?? '',
    disabledReason: input.disabledReason ?? base?.disabledReason,
    enabled: input.enabled ?? base?.enabled ?? true,
    id: input.id,
    input: resolvedInput,
    label: input.label ?? base?.label ?? input.id,
    output: input.output ?? base?.output ?? 'plain',
    // Same rule as `session`: builtin permission flags only make sense with the builtin args.
    permissions: input.permissions ?? (input.args ? undefined : base?.permissions),
    proxy: getConfiguredAgentProxy(input.proxy, base?.proxy || pluginProxy),
    // Overriding `args` without re-declaring `session` would leave the builtin
    // resume line pointing at flags the new command may not accept.
    session: input.session
      ? resolveAgentSession(input.session, resolvedInput, base?.session)
      : input.args && !base?.session
        ? getUnsupportedAgentSession()
        : (base?.session ?? getUnsupportedAgentSession()),
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
        disabledReason: provider.disabledReason || `${provider.label} has no command configured.`,
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
    permissionModes: getSupportedPermissionModes(provider),
    sessionMode: provider.session.mode,
  }))
}

export function getDefaultAgentProviderId(providers: Array<{ enabled: boolean; id: string }>, preferredProviderId = 'codex') {
  return (
    providers.find((provider) => provider.id === preferredProviderId && provider.enabled)?.id ||
    providers.find((provider) => provider.enabled)?.id ||
    providers[0]?.id ||
    'codex'
  )
}
