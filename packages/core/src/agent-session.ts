import type { AiInsAgentSessionInput, ResolvedAiInsAgentSession } from './types'

const sessionIdPlaceholder = '{sessionId}'
const maxSessionIdScanDepth = 4

const unsupportedSession: ResolvedAiInsAgentSession = {
  assignArgs: [],
  mode: 'none',
  resumeArgs: [],
  resumeInput: 'stdin',
  sessionIdKeys: [],
}

export function getUnsupportedAgentSession(): ResolvedAiInsAgentSession {
  return { ...unsupportedSession }
}

export function resolveAgentSession(
  input: AiInsAgentSessionInput | undefined,
  fallbackInput: 'argument' | 'stdin',
  base?: ResolvedAiInsAgentSession,
): ResolvedAiInsAgentSession {
  const merged: ResolvedAiInsAgentSession = {
    assignArgs: input?.assignArgs ?? base?.assignArgs ?? [],
    mode: input?.mode ?? base?.mode ?? 'none',
    resumeArgs: input?.resumeArgs ?? base?.resumeArgs ?? [],
    resumeInput: input?.resumeInput ?? base?.resumeInput ?? fallbackInput,
    sessionIdKeys: input?.sessionIdKeys ?? base?.sessionIdKeys ?? [],
  }

  // A provider that cannot describe how to resume is not resumable, whatever
  // the declared mode says. Failing closed keeps the panel honest instead of
  // offering a continue button that spawns a context-free run.
  if (merged.mode !== 'none' && !merged.resumeArgs.length) {
    return getUnsupportedAgentSession()
  }

  if (merged.mode === 'assign' && !merged.assignArgs.length) {
    return getUnsupportedAgentSession()
  }

  if (merged.mode === 'capture' && !merged.sessionIdKeys.length) {
    return getUnsupportedAgentSession()
  }

  return merged
}

export function applySessionIdToArgs(args: string[], sessionId: string) {
  return args.map((arg) => (arg.includes(sessionIdPlaceholder) ? arg.split(sessionIdPlaceholder).join(sessionId) : arg))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Pull a session id out of one parsed JSONL event. Providers report it at
 * different depths (codex puts `thread_id` at the root, cursor nests it under
 * the init payload), so this walks a few levels rather than hard-coding a path.
 */
export function readSessionIdFromEvent(event: unknown, sessionIdKeys: string[], depth = 0): string {
  if (!sessionIdKeys.length || depth > maxSessionIdScanDepth) {
    return ''
  }

  if (Array.isArray(event)) {
    for (const item of event) {
      const nested = readSessionIdFromEvent(item, sessionIdKeys, depth + 1)
      if (nested) {
        return nested
      }
    }

    return ''
  }

  if (!isRecord(event)) {
    return ''
  }

  for (const key of sessionIdKeys) {
    const value = event[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  for (const value of Object.values(event)) {
    if (!value || typeof value !== 'object') {
      continue
    }

    const nested = readSessionIdFromEvent(value, sessionIdKeys, depth + 1)
    if (nested) {
      return nested
    }
  }

  return ''
}

export function createSessionId() {
  // Node 18+ everywhere the dev server runs; the fallback keeps the shape valid
  // for exotic runtimes that expose no WebCrypto.
  const globalCrypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (typeof globalCrypto?.randomUUID === 'function') {
    return globalCrypto.randomUUID()
  }

  const hex = '0123456789abcdef'
  let uuid = ''
  for (let index = 0; index < 36; index += 1) {
    if (index === 8 || index === 13 || index === 18 || index === 23) {
      uuid += '-'
    } else if (index === 14) {
      uuid += '4'
    } else if (index === 19) {
      uuid += hex[8 + Math.floor(Math.random() * 4)]
    } else {
      uuid += hex[Math.floor(Math.random() * 16)]
    }
  }

  return uuid
}
