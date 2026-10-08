import { createPermissionToken, parsePermissionMode } from './permissions'
import { aiInsRuns, getAiInsTurnOutput } from './run-store'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { AiInsAgentSessionMode, AiInsPluginOptions, AiInsRun, AiInsRunStatus, AiInsRunTurn } from './types'

const historyVersion = 1
const defaultHistoryLimit = 100
const persistDebounceMs = 1500
// Same head/tail split the panel uses, so a restored transcript reads the same
// as the live one did.
const maxStoredTurnOutputLength = 64000
const storedTurnOutputHeadLength = 12000
// Notices are tokens the panel replaces with text in its own language.
const storedOutputCompactionNotice = '\n\n[ai-ins:notice:historyTruncated]\n\n'
const interruptedTurnMessage = 'interrupted by a dev server restart'

type HistorySettings = {
  enabled: boolean
  limit: number
}

type StoredAiInsRunTurn = Omit<AiInsRunTurn, 'output'> & { output: string }

type StoredAiInsRun = {
  alwaysAllowedTools?: string[]
  createdAt: number
  eventSeq: number
  id: string
  logPath: string
  providerId: string
  providerLabel: string
  root: string
  sessionId?: string
  sessionMode: AiInsAgentSessionMode
  sessionStarted: boolean
  signal?: NodeJS.Signals | null
  turns: StoredAiInsRunTurn[]
  updatedAt: number
  version: number
}

const historySettings = new Map<string, HistorySettings>()
const loadedRoots = new Set<string>()
const pendingWrites = new Map<string, ReturnType<typeof setTimeout>>()

export function configureAiInsRunHistory(root: string, history: NonNullable<AiInsPluginOptions['agents']>['history']) {
  const limit = typeof history === 'object' && typeof history.limit === 'number' && history.limit > 0 ? Math.floor(history.limit) : defaultHistoryLimit
  historySettings.set(root, { enabled: history !== false, limit })
}

function getHistorySettings(root: string): HistorySettings {
  return historySettings.get(root) ?? { enabled: true, limit: defaultHistoryLimit }
}

function getHistoryDirectory(root: string) {
  return join(root, '.ai-ins', 'runs')
}

function getHistoryFile(root: string, runId: string) {
  return join(getHistoryDirectory(root), `${runId}.json`)
}

// Run ids double as file names; anything else in the directory is not ours.
function isSafeRunId(runId: string) {
  return /^[\w.-]+$/u.test(runId)
}

export function compactStoredTurnOutput(output: string) {
  if (output.length <= maxStoredTurnOutputLength) {
    return output
  }

  const tailLength = maxStoredTurnOutputLength - storedTurnOutputHeadLength
  return `${output.slice(0, storedTurnOutputHeadLength)}${storedOutputCompactionNotice}${output.slice(output.length - tailLength)}`
}

function toStoredRun(runId: string, run: AiInsRun): StoredAiInsRun {
  return {
    alwaysAllowedTools: [...run.alwaysAllowedTools],
    createdAt: run.createdAt,
    eventSeq: run.eventSeq,
    id: runId,
    logPath: run.logPath,
    providerId: run.providerId,
    providerLabel: run.providerLabel,
    root: run.root,
    sessionId: run.sessionId,
    sessionMode: run.sessionMode,
    sessionStarted: run.sessionStarted,
    signal: run.signal,
    turns: run.turns.map(({ thinkingSince: _open, ...turn }) => ({ ...turn, output: compactStoredTurnOutput(getAiInsTurnOutput(run, turn.index)) })),
    updatedAt: run.updatedAt,
    version: historyVersion,
  }
}

function writeRunFile(runId: string) {
  pendingWrites.delete(runId)
  const run = aiInsRuns.get(runId)
  if (!run || !getHistorySettings(run.root).enabled || !isSafeRunId(runId)) {
    return
  }

  try {
    const directory = getHistoryDirectory(run.root)
    mkdirSync(directory, { recursive: true })
    const fileName = getHistoryFile(run.root, runId)
    // Write-then-rename so a dev server killed mid-write never leaves a
    // truncated JSON that would hide the run on the next start.
    const temporaryFileName = `${fileName}.tmp`
    writeFileSync(temporaryFileName, JSON.stringify(toStoredRun(runId, run)))
    renameSync(temporaryFileName, fileName)
  } catch (error) {
    console.error('[ai-ins] save task history failed:', error instanceof Error ? error.message : error)
  }
}

/** Persist now: used for state changes (new run/turn, session id, turn end). */
export function persistAiInsRun(runId: string) {
  const pending = pendingWrites.get(runId)
  if (pending) {
    clearTimeout(pending)
  }

  writeRunFile(runId)
}

/** Coalesce the stream of output events into one write every so often. */
export function schedulePersistAiInsRun(runId: string) {
  if (pendingWrites.has(runId)) {
    return
  }

  const timer = setTimeout(() => writeRunFile(runId), persistDebounceMs)
  ;(timer as unknown as { unref?: () => void }).unref?.()
  pendingWrites.set(runId, timer)
}

export function removeAiInsRunHistory(runId: string, run: AiInsRun) {
  const pending = pendingWrites.get(runId)
  if (pending) {
    clearTimeout(pending)
    pendingWrites.delete(runId)
  }

  if (!isSafeRunId(runId)) {
    return
  }

  try {
    rmSync(getHistoryFile(run.root, runId), { force: true })
  } catch (error) {
    console.error('[ai-ins] delete task history failed:', error instanceof Error ? error.message : error)
  }
}

function isRunStatus(value: unknown): value is AiInsRunStatus {
  return value === 'done' || value === 'failed' || value === 'running' || value === 'starting'
}

function restoreTurn(stored: StoredAiInsRunTurn, index: number): AiInsRunTurn {
  const turn: AiInsRunTurn = {
    agentPrompt: typeof stored.agentPrompt === 'string' ? stored.agentPrompt : '',
    changedFiles: Array.isArray(stored.changedFiles) ? stored.changedFiles : undefined,
    code: stored.code,
    completed: Boolean(stored.completed),
    completedAt: typeof stored.completedAt === 'number' ? stored.completedAt : undefined,
    createdAt: typeof stored.createdAt === 'number' ? stored.createdAt : Date.now(),
    index: typeof stored.index === 'number' ? stored.index : index,
    interrupted: Boolean(stored.interrupted),
    lineNumber: typeof stored.lineNumber === 'number' ? stored.lineNumber : 1,
    output: typeof stored.output === 'string' ? stored.output : '',
    permissionMode: parsePermissionMode(stored.permissionMode),
    prompt: typeof stored.prompt === 'string' ? stored.prompt : '',
    resumed: Boolean(stored.resumed),
    sourceName: typeof stored.sourceName === 'string' ? stored.sourceName : '',
    sourcePath: typeof stored.sourcePath === 'string' ? stored.sourcePath : '',
    status: isRunStatus(stored.status) ? stored.status : 'failed',
    statusMessage: typeof stored.statusMessage === 'string' ? stored.statusMessage : '',
    stopped: stored.stopped === true,
    thinking: typeof stored.thinking === 'string' ? stored.thinking : undefined,
    thinkingMs: typeof stored.thinkingMs === 'number' ? stored.thinkingMs : undefined,
  }

  // The process that owned this turn died with the previous dev server. The
  // agent's own session usually survived on disk, so the run stays resumable.
  if (!turn.completed) {
    turn.completed = true
    turn.interrupted = true
    turn.status = 'failed'
    // The panel explains the interruption on the turn card, in its own language.
    turn.statusMessage = interruptedTurnMessage
  }

  return turn
}

function restoreRun(stored: StoredAiInsRun, root: string): AiInsRun | undefined {
  if (!stored || stored.version !== historyVersion || !Array.isArray(stored.turns) || !stored.turns.length) {
    return undefined
  }

  const turns = stored.turns.map(restoreTurn)
  const lastTurn = turns[turns.length - 1]
  const firstTurn = turns[0]

  return {
    agentPrompt: lastTurn.agentPrompt,
    code: lastTurn.code,
    completed: true,
    createdAt: typeof stored.createdAt === 'number' ? stored.createdAt : firstTurn.createdAt,
    droppedEventCount: 0,
    eventSeq: typeof stored.eventSeq === 'number' ? stored.eventSeq : 0,
    // Output now lives on each turn's snapshot; the event buffer only has to
    // serve turns started after the restore.
    events: [],
    fileName: lastTurn.sourcePath,
    lineNumber: lastTurn.lineNumber,
    logPath: typeof stored.logPath === 'string' ? stored.logPath : '',
    prompt: firstTurn.prompt,
    providerId: typeof stored.providerId === 'string' ? stored.providerId : '',
    providerLabel: typeof stored.providerLabel === 'string' ? stored.providerLabel : 'Agent',
    alwaysAllowedTools: new Set(Array.isArray(stored.alwaysAllowedTools) ? stored.alwaysAllowedTools.filter((tool) => typeof tool === 'string') : []),
    // Pending requests died with the previous dev server; the token is per process.
    pendingPermissions: new Map(),
    permissionToken: createPermissionToken(),
    root,
    sessionId: typeof stored.sessionId === 'string' && stored.sessionId ? stored.sessionId : undefined,
    sessionMode: stored.sessionMode === 'assign' || stored.sessionMode === 'capture' ? stored.sessionMode : 'none',
    sessionStarted: Boolean(stored.sessionStarted),
    signal: stored.signal,
    sourceName: lastTurn.sourceName,
    sourcePath: lastTurn.sourcePath,
    status: lastTurn.status,
    statusMessage: lastTurn.statusMessage,
    subscribers: new Set(),
    turns,
    updatedAt: typeof stored.updatedAt === 'number' ? stored.updatedAt : lastTurn.createdAt,
  }
}

/**
 * Pull this root's history into memory the first time anything asks for runs.
 * Lazy so a dev server that never opens the panel never touches the disk.
 */
export function ensureAiInsRunHistoryLoaded(root: string) {
  if (loadedRoots.has(root)) {
    return
  }

  loadedRoots.add(root)
  if (!getHistorySettings(root).enabled) {
    return
  }

  const directory = getHistoryDirectory(root)
  if (!existsSync(directory)) {
    return
  }

  let fileNames: string[] = []
  try {
    fileNames = readdirSync(directory).filter((fileName) => fileName.endsWith('.json'))
  } catch (error) {
    console.error('[ai-ins] read task history failed:', error instanceof Error ? error.message : error)
    return
  }

  const interruptedRunIds: string[] = []
  for (const fileName of fileNames) {
    const runId = fileName.slice(0, -'.json'.length)
    if (aiInsRuns.has(runId) || !isSafeRunId(runId)) {
      continue
    }

    try {
      const stored = JSON.parse(readFileSync(join(directory, fileName), 'utf-8')) as StoredAiInsRun
      const run = restoreRun(stored, root)
      if (!run) {
        continue
      }

      aiInsRuns.set(runId, run)
      if (run.turns.some((turn, index) => turn.interrupted && !stored.turns[index]?.interrupted)) {
        interruptedRunIds.push(runId)
      }
    } catch (error) {
      console.error(`[ai-ins] skip unreadable task history ${fileName}:`, error instanceof Error ? error.message : error)
    }
  }

  // Record the interruption once, so it is not re-derived (and re-appended to
  // the output) on every restart.
  for (const runId of interruptedRunIds) {
    persistAiInsRun(runId)
  }

  pruneAiInsRunHistory(root)
}

export function getAiInsRunActivityAt(run: AiInsRun) {
  return Math.max(run.updatedAt || 0, run.turns[run.turns.length - 1]?.createdAt || 0, run.createdAt)
}

/** Keep at most `limit` runs per root; running runs are never pruned. */
export function pruneAiInsRunHistory(root: string) {
  const { limit } = getHistorySettings(root)
  const rootRuns = [...aiInsRuns.entries()]
    .filter(([, run]) => run.root === root)
    .sort(([, firstRun], [, secondRun]) => getAiInsRunActivityAt(secondRun) - getAiInsRunActivityAt(firstRun))

  let kept = 0
  for (const [runId, run] of rootRuns) {
    if (!run.completed || kept < limit) {
      kept += 1
      continue
    }

    aiInsRuns.delete(runId)
    removeAiInsRunHistory(runId, run)
  }
}
