import type { ChildProcess } from 'child_process'
import type { IncomingMessage, ServerResponse } from 'http'

export type DevInspectMiddleware = (req: IncomingMessage, res: ServerResponse, next?: () => void) => void

export type DevInspectRoute = {
  path: string
  middleware: DevInspectMiddleware
}

export type DevInspectRunStatus = 'done' | 'failed' | 'running' | 'starting'

export type CodexInspectEvent = {
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

export type CodexInspectRun = {
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

export type ResolvedDevInspectAgentProvider = {
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

export type DevInspectClientAgentProvider = {
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
