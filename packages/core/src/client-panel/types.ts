export type AgentProvider = {
  disabledReason?: string
  enabled: boolean
  id: string
  label: string
}

export type ProxyMode = 'custom' | 'off' | 'system'

export type LayerTarget = {
  name: string
  path: string
  range?: string
}

export type AgentRun = {
  agentPrompt?: string
  completed: boolean
  createdAt: number
  id: string
  logPath: string
  output: string
  prompt: string
  providerId: string
  providerLabel: string
  sourceName: string
  sourcePath: string
  status: string
  statusMessage: string
}
