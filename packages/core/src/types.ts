import type { ChildProcess } from 'child_process'
import type { IncomingMessage, ServerResponse } from 'http'

export type AiInsMiddleware = (req: IncomingMessage, res: ServerResponse, next?: () => void) => void

export type AiInsRoute = {
  path: string
  middleware: AiInsMiddleware
}

export type AiInsRunStatus = 'done' | 'failed' | 'running' | 'starting'

/**
 * How a provider hands us a conversation id we can resume later.
 *
 * - `assign`: the CLI lets us pin the id up front (claude `--session-id`,
 *   copilot `--session-id`), so the first turn already knows it.
 * - `capture`: the CLI mints the id itself and reports it in its JSON output
 *   (codex emits `{"type":"thread.started","thread_id":"…"}`), so we read it
 *   off the stream.
 * - `none`: no verified resume path; follow-up turns stay disabled.
 */
export type AiInsAgentSessionMode = 'assign' | 'capture' | 'none'

/**
 * How much an agent may do without asking.
 *
 * - `ask`: file edits run; anything else that needs approval is asked in the
 *   panel (Claude, through `--permission-prompt-tool`).
 * - `edit`: file edits run; anything else that needs approval is denied.
 * - `full`: nothing is asked; commands and tools run unrestricted.
 */
export type AiInsAgentPermissionMode = 'ask' | 'edit' | 'full'

/**
 * Per-mode arguments spliced in at the `{permissionArgs}` placeholder of
 * `args` / `session.resumeArgs` (appended when there is no placeholder). A
 * mode left out is unsupported and falls back to a stricter one, never a
 * looser one. `{permissionMcpConfig}` is replaced with the MCP config JSON of
 * the AI Ins permission bridge (only meaningful for `ask`).
 */
export type AiInsAgentPermissionsInput = Partial<Record<AiInsAgentPermissionMode, string[]>>

/** A tool call waiting for the panel user's approval. */
export type AiInsPermissionRequest = {
  createdAt: number
  id: string
  input: unknown
  toolName: string
}

export type AiInsPermissionDecision = 'allow' | 'always' | 'cancelled' | 'deny'

/**
 * Declarative resume wiring. Kept JSON-serializable so it can be written in a
 * `vite.config.ts` for a custom provider. `{sessionId}` is substituted in every
 * argument template.
 */
export type AiInsAgentSessionInput = {
  /** First-turn arguments that pin a session id we generated. Only for `assign`. */
  assignArgs?: string[]
  mode?: AiInsAgentSessionMode
  /** Full argument list for a follow-up turn. Replaces `args` entirely. */
  resumeArgs?: string[]
  /** Where the follow-up prompt goes. Defaults to the provider's `input`. */
  resumeInput?: 'argument' | 'stdin'
  /** For `capture`: JSON keys that may hold the session id on any streamed event. */
  sessionIdKeys?: string[]
}

export type ResolvedAiInsAgentSession = {
  assignArgs: string[]
  mode: AiInsAgentSessionMode
  resumeArgs: string[]
  resumeInput: 'argument' | 'stdin'
  sessionIdKeys: string[]
}

/** A file whose git state changed while one turn ran. `path` is absolute. */
export type AiInsChangedFile = {
  /** Lines added / removed by the turn; undefined when no diff was taken. */
  additions?: number
  binary?: boolean
  deletions?: number
  /**
   * Unified diff of what the turn did to this file (hunks only, no file
   * headers). Stored with the history; summaries leave it out and the panel
   * fetches it when the file is expanded.
   */
  patch?: string
  path: string
  status: 'added' | 'deleted' | 'modified'
  /** The patch was cut short, or dropped because the turn's diff budget ran out. */
  truncated?: boolean
}

export type AiInsEvent = {
  /** On `done`: files this turn touched, or undefined when the root is not in a git work tree. */
  changedFiles?: AiInsChangedFile[]
  code?: number | null
  /** On `done` / `error`: when the turn settled. */
  completedAt?: number
  logPath?: string
  message?: string
  pid?: number
  providerId?: string
  providerLabel?: string
  /** Monotonic per-run sequence number; lets a reconnecting client skip replay. */
  seq?: number
  signal?: NodeJS.Signals | null
  /** On `permission`: the request now waiting for the user. */
  permission?: AiInsPermissionRequest
  /** On `permission-resolved`: which request, and how it ended. */
  permissionDecision?: AiInsPermissionDecision
  permissionId?: string
  /** On `done`: the user stopped this turn. */
  stopped?: boolean
  stream?: 'stderr' | 'stdout'
  /** Zero-based index of the conversation turn this event belongs to. */
  turn?: number
  type: 'done' | 'error' | 'heartbeat' | 'output' | 'permission' | 'permission-resolved' | 'status' | 'thinking' | 'turn'
}

/** One user request inside a run. A fresh run starts at turn 0. */
export type AiInsRunTurn = {
  agentPrompt: string
  /** Files this turn changed; undefined when change tracking was unavailable. */
  changedFiles?: AiInsChangedFile[]
  code?: number | null
  completed: boolean
  completedAt?: number
  createdAt: number
  index: number
  /** Set when the dev server went away while this turn was still running. */
  interrupted?: boolean
  lineNumber: number
  /** Formatted output of this turn, accumulated as it streams (head/tail compacted when long). */
  output?: string
  prompt: string
  /** True when this turn resumed an existing agent session rather than starting one. */
  resumed: boolean
  sourceName: string
  sourcePath: string
  status: AiInsRunStatus
  statusMessage: string
  /** The permission level this turn actually ran with (after provider fallback). */
  permissionMode?: AiInsAgentPermissionMode
  /** The user stopped this turn from the panel. */
  stopped?: boolean
  /** The agent's visible reasoning for this turn (tail kept when long). */
  thinking?: string
  /** Time spent thinking: consecutive thinking events, closed by the next reply text, tool call or turn end. */
  thinkingMs?: number
  /** Start of the thinking stretch still open, if any (not persisted). */
  thinkingSince?: number
}

export type AiInsRun = {
  agentPrompt?: string
  child?: ChildProcess
  code?: number | null
  completed: boolean
  createdAt: number
  droppedEventCount: number
  eventSeq: number
  events: AiInsEvent[]
  fileName: string
  lineNumber: number
  logPath: string
  prompt: string
  providerId: string
  providerLabel: string
  /** Why this run cannot take another turn, when it cannot. */
  resumeBlockedReason?: string
  /** Project root the run belongs to; history is listed and stored per root. */
  root: string
  sessionId?: string
  sessionMode: AiInsAgentSessionMode
  /**
   * For `assign` providers the id exists before the CLI does; it only names a
   * real conversation once the CLI produced output for it.
   */
  sessionStarted: boolean
  signal?: NodeJS.Signals | null
  sourceName: string
  sourcePath: string
  status: AiInsRunStatus
  statusMessage: string
  /** Tools the user allowed "for this conversation"; asked again never. */
  alwaysAllowedTools: Set<string>
  /** Tool calls waiting for the panel; resolving one answers the agent. */
  pendingPermissions: Map<string, { request: AiInsPermissionRequest; resolve: (decision: AiInsPermissionDecision) => void }>
  /** Shared secret the permission bridge sends back, so only our agent process can ask. */
  permissionToken: string
  /** When the user pinned the run to the top of the list; pinned runs are never pruned or bulk-cleared. */
  pinnedAt?: number
  /** Set between a stop request and the process actually exiting. */
  stopRequested?: boolean
  subscribers: Set<ServerResponse>
  turns: AiInsRunTurn[]
  /** Last time anything happened on the run, for history ordering and pruning. */
  updatedAt: number
}

export type AiInsAgentProviderInput = {
  args?: string[]
  command?: string
  disabledReason?: string
  enabled?: boolean
  id: string
  input?: 'argument' | 'stdin'
  label?: string
  output?: 'codex-json' | 'json' | 'jsonl' | 'plain'
  permissions?: AiInsAgentPermissionsInput
  proxy?: string
  session?: AiInsAgentSessionInput
}

export type ResolvedAiInsAgentProvider = {
  args: string[]
  command: string
  disabledReason?: string
  enabled: boolean
  id: string
  input: 'argument' | 'stdin'
  label: string
  output: 'codex-json' | 'json' | 'jsonl' | 'plain'
  /** Undefined: the provider's own args fix its permissions (not configurable). */
  permissions?: AiInsAgentPermissionsInput
  proxy: string
  session: ResolvedAiInsAgentSession
}

export type AiInsClientAgentProvider = {
  disabledReason?: string
  enabled: boolean
  id: string
  label: string
  /** Permission levels this provider supports; empty when its args fix them. */
  permissionModes: AiInsAgentPermissionMode[]
  /** Mirrors `session.mode`; the panel uses it to enable the continue affordance. */
  sessionMode: AiInsAgentSessionMode
}

export type AiInsPluginOptions = {
  agents?: {
    defaultProvider?: string
    providers?: AiInsAgentProviderInput[]
    /**
     * Multi-turn follow-ups need the agent CLI to persist its session to disk.
     * Set to `false` to keep every run ephemeral (codex `--ephemeral`, claude
     * `--no-session-persistence`) at the cost of losing "continue this task".
     *
     * @default true
     */
    sessions?: boolean
    /**
     * Task history is written to `<root>/.ai-ins/runs/*.json` so the panel's
     * task list — and the ability to continue a session — survives dev server
     * restarts. `false` keeps it in memory only; `limit` caps how many runs are
     * kept per project (oldest finished runs are pruned first).
     *
     * @default { limit: 100 }
     */
    history?: boolean | { limit?: number }
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
  cursor?: {
    command?: string
    model?: string
    proxy?: string
  }
  gemini?: {
    command?: string
    model?: string
    proxy?: string
  }
  /**
   * Disable source attributes when they would conflict with framework SSR hydration.
   */
  disableSourceAttributes?: boolean
  proxy?: string
  /**
   * Repository root that AI Ins agents are allowed to inspect and edit.
   * Defaults to the bundler dev server root.
   */
  root?: string
}
