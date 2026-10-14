import { realpathSync } from 'fs'
import { isAbsolute, join, relative, resolve } from 'path'
import type { AiInsChangedFile } from './types'

/*
 * Which turn changed which file, when several run at once in one project.
 *
 * A turn's file list comes from comparing the work tree before and after it,
 * so a turn that overlaps another sees that one's edits too. The agents say
 * which files they edit through their own tools (Claude `Edit` / `Write`,
 * Codex `file_change`), so each running turn records those "claims", and at
 * the end a file is kept, dropped or flagged depending on who claimed it.
 * Edits made through shell commands claim nothing; they are only certain when
 * no other turn ran at the same time.
 */

type TurnRecord = {
  claims: Set<string>
  endedAt?: number
  root: string
  startedAt: number
}

const turns = new Map<string, TurnRecord>()

const editToolNames = new Set(['Edit', 'MultiEdit', 'NotebookEdit', 'Write', 'str_replace_based_edit_tool', 'apply_patch'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Absolute path under `root` for a path an agent reported. Agents may report
 * paths relative to the project or through a symlinked root (macOS /tmp is
 * /private/tmp); both are mapped onto `root`, the form the work tree diff uses.
 */
function normalizeClaimPath(root: string, path: string) {
  const absolute = isAbsolute(path) ? path : resolve(root, path)
  let realRoot = root
  try {
    realRoot = realpathSync(root)
  } catch {
    // Root gone: keep the path as reported.
  }
  const fromReal = relative(realRoot, absolute)
  if (realRoot !== root && fromReal && !fromReal.startsWith('..') && !isAbsolute(fromReal)) {
    return join(root, fromReal)
  }
  return absolute
}

/** Files an agent event says it is editing; empty for everything else. */
export function getEditedPaths(event: unknown, root: string): string[] {
  if (!isRecord(event)) return []
  const paths: string[] = []

  // Claude (and Cursor's compatible stream-json): tool calls in assistant messages.
  if (event.type === 'assistant' && isRecord(event.message) && Array.isArray(event.message.content)) {
    for (const item of event.message.content) {
      if (!isRecord(item) || item.type !== 'tool_use' || typeof item.name !== 'string' || !editToolNames.has(item.name)) continue
      const input = isRecord(item.input) ? item.input : {}
      for (const key of ['file_path', 'notebook_path', 'path']) {
        if (typeof input[key] === 'string' && input[key]) {
          paths.push(input[key] as string)
          break
        }
      }
    }
  }

  // Codex: `file_change` items list every path they touch.
  if (typeof event.type === 'string' && event.type.startsWith('item.') && isRecord(event.item) && event.item.type === 'file_change') {
    for (const change of Array.isArray(event.item.changes) ? event.item.changes : []) {
      if (isRecord(change) && typeof change.path === 'string' && change.path) paths.push(change.path)
    }
  }

  return paths.map((path) => normalizeClaimPath(root, path))
}

export function beginTurnClaims(key: string, root: string, startedAt = Date.now()) {
  turns.set(key, { claims: new Set(), root, startedAt })
}

export function addTurnClaims(key: string, paths: string[]) {
  const record = turns.get(key)
  if (!record) return
  for (const path of paths) record.claims.add(path)
}

export type ChangeAttribution = NonNullable<AiInsChangedFile['attribution']>

/**
 * End a turn and sort its work tree diff:
 * - claimed by this turn → kept (`shared` when an overlapping turn claimed it too);
 * - claimed only by turns that overlapped this one → dropped, it is theirs;
 * - claimed by nobody (a shell edit) → kept, `uncertain` if another turn overlapped.
 */
export function endTurnClaims<T extends { path: string }>(key: string, files: T[], endedAt = Date.now()) {
  const record = turns.get(key)
  if (!record) return files
  record.endedAt = endedAt

  const overlapping = [...turns.entries()]
    .filter(([otherKey, other]) => otherKey !== key && other.root === record.root)
    .filter(([, other]) => other.startedAt < endedAt && (other.endedAt ?? Number.POSITIVE_INFINITY) > record.startedAt)
    .map(([, other]) => other)

  const result: Array<T & { attribution?: ChangeAttribution }> = []
  for (const file of files) {
    const mine = record.claims.has(file.path)
    const theirs = overlapping.some((other) => other.claims.has(file.path))
    if (mine) {
      result.push(theirs ? { ...file, attribution: 'shared' } : file)
    } else if (!theirs) {
      result.push(overlapping.length ? { ...file, attribution: 'uncertain' } : file)
    }
  }

  pruneTurnClaims(record.root)
  return result
}

/** Forget finished turns that no running turn can still overlap with. */
function pruneTurnClaims(root: string) {
  const running = [...turns.values()].filter((turn) => turn.root === root && turn.endedAt === undefined)
  const oldestRunningStart = Math.min(...running.map((turn) => turn.startedAt), Number.POSITIVE_INFINITY)
  for (const [key, turn] of turns) {
    if (turn.root === root && turn.endedAt !== undefined && turn.endedAt <= oldestRunningStart) turns.delete(key)
  }
}

/** For tests. */
export function resetTurnClaims() {
  turns.clear()
}
