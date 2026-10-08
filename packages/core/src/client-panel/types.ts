export type AgentSessionMode = 'assign' | 'capture' | 'none'

export type PermissionMode = 'ask' | 'edit' | 'full'

export type PermissionDecision = 'allow' | 'always' | 'deny'

/** A tool call the agent is waiting on the user to approve. */
export type PermissionRequest = {
  createdAt: number
  id: string
  input: unknown
  toolName: string
}

export type AgentProvider = {
  disabledReason?: string
  enabled: boolean
  id: string
  label: string
  /** Permission levels the provider supports; empty when its own flags fix them. */
  permissionModes?: PermissionMode[]
  sessionMode?: AgentSessionMode
}

export type ProxyMode = 'custom' | 'off' | 'system'

export type LayerTarget = {
  name: string
  path: string
  range?: string
}

export type ChangedFile = {
  /** Absolute path. */
  path: string
  status: 'added' | 'deleted' | 'modified'
}

export type AgentRunTurn = {
  agentPrompt: string
  /** Files this turn changed; undefined when the project is not a git work tree. */
  changedFiles?: ChangedFile[]
  completed: boolean
  completedAt?: number
  createdAt: number
  index: number
  /** The dev server went away while this turn was running. */
  interrupted?: boolean
  output: string
  /** Permission level this turn ran with, after provider fallback. */
  permissionMode?: PermissionMode
  prompt: string
  /** False for turn 0, true for every turn that resumed the agent session. */
  resumed: boolean
  sourceName: string
  sourcePath: string
  status: string
  statusMessage: string
  /** The user stopped this turn. */
  stopped?: boolean
  /** The agent's visible reasoning (tail kept when long). */
  thinking?: string
  /** Time spent thinking, excluding tool calls and reply streaming. */
  thinkingMs?: number
  /** Client-side start of the thinking stretch still open. */
  thinkingSince?: number
}

export type AgentRun = {
  canResume: boolean
  completed: boolean
  createdAt: number
  /** A stop was requested and the process has not exited yet. */
  stopping?: boolean
  /** True while the settled transcript is being fetched. */
  detailLoading?: boolean
  id: string
  /** The latest turn was cut off by a dev server restart. */
  interrupted: boolean
  /** Highest event sequence number applied, so a reconnect can skip replay. */
  lastSeq: number
  logDisplayPath: string
  logPath: string
  /** False for history entries whose transcript has not been fetched yet. */
  outputLoaded: boolean
  /** Tool calls waiting for the user's decision. */
  pendingPermissions: PermissionRequest[]
  providerId: string
  providerLabel: string
  /** Message key explaining why this conversation cannot take another turn; empty when it can. */
  resumeBlockedCode: string
  sessionMode: AgentSessionMode
  sourceName: string
  sourcePath: string
  status: string
  statusMessage: string
  turns: AgentRunTurn[]
}
