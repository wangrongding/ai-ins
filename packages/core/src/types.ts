import type { ChildProcess } from 'child_process'
import type { IncomingMessage, ServerResponse } from 'http'

export type AiInsMiddleware = (req: IncomingMessage, res: ServerResponse, next?: () => void) => void

export type AiInsRoute = {
  path: string
  middleware: AiInsMiddleware
}

export type AiInsRunStatus = 'done' | 'failed' | 'running' | 'starting'

export type AiInsEvent = {
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

export type AiInsRun = {
  child?: ChildProcess
  code?: number | null
  completed: boolean
  createdAt: number
  events: AiInsEvent[]
  fileName: string
  lineNumber: number
  logPath: string
  prompt: string
  providerId: string
  providerLabel: string
  signal?: NodeJS.Signals | null
  sourceName: string
  sourcePath: string
  status: AiInsRunStatus
  statusMessage: string
  subscribers: Set<ServerResponse>
}

export type AiInsAgentProviderInput = {
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

export type ResolvedAiInsAgentProvider = {
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

export type AiInsClientAgentProvider = {
  disabledReason?: string
  enabled: boolean
  id: string
  label: string
}

export type AiInsPluginOptions = {
  agents?: {
    defaultProvider?: string
    providers?: AiInsAgentProviderInput[]
  }
  codex?: {
    command?: string
    model?: string
    proxy?: string
  }
  claude?: {
    command?: string
    model?: string
    proxy?: string
  }
  copilot?: {
    command?: string
    model?: string
    proxy?: string
  }
  /**
   * Disable source attributes when they would conflict with framework SSR hydration.
   */
  disableSourceAttributes?: boolean
  proxy?: string
}
