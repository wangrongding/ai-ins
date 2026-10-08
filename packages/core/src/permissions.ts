import { appendAiInsEvent, bumpAiInsRunsVersion, aiInsRuns } from './run-store'
import { createSessionId } from './agent-session'
import { readRequestBody } from './source'
import { existsSync } from 'fs'
import { join } from 'path'
import type { IncomingMessage, ServerResponse } from 'http'
import type {
  AiInsAgentPermissionMode,
  AiInsMiddleware,
  AiInsPermissionDecision,
  AiInsPermissionRequest,
  AiInsRun,
  ResolvedAiInsAgentProvider,
} from './types'

const permissionModes: AiInsAgentPermissionMode[] = ['ask', 'edit', 'full']

// An unsupported level falls back to a stricter one, never a looser one.
const permissionFallbacks: Record<AiInsAgentPermissionMode, AiInsAgentPermissionMode[]> = {
  ask: ['ask', 'edit'],
  edit: ['edit', 'ask'],
  full: ['full', 'edit', 'ask'],
}

export const defaultPermissionMode: AiInsAgentPermissionMode = 'ask'

export function parsePermissionMode(value: unknown): AiInsAgentPermissionMode | undefined {
  return permissionModes.includes(value as AiInsAgentPermissionMode) ? (value as AiInsAgentPermissionMode) : undefined
}

export function getSupportedPermissionModes(provider: Pick<ResolvedAiInsAgentProvider, 'permissions'>) {
  return permissionModes.filter((mode) => provider.permissions?.[mode])
}

/** The level a turn will actually run with; undefined when the provider's args fix it. */
export function resolvePermissionMode(provider: ResolvedAiInsAgentProvider, requested: AiInsAgentPermissionMode) {
  return provider.permissions ? permissionFallbacks[requested].find((mode) => provider.permissions?.[mode]) : undefined
}

/** Splice the level's flags in at `{permissionArgs}` (or append them). */
export function applyPermissionArgs(
  args: string[],
  provider: ResolvedAiInsAgentProvider,
  mode: AiInsAgentPermissionMode | undefined,
  mcpConfig: string,
) {
  const permissionArgs = (mode && provider.permissions?.[mode]) || []
  const expanded = permissionArgs.map((arg) => (arg === '{permissionMcpConfig}' ? mcpConfig : arg))
  const index = args.indexOf('{permissionArgs}')
  return index === -1 ? [...args, ...expanded] : [...args.slice(0, index), ...expanded, ...args.slice(index + 1)]
}

function getBridgeScriptPath() {
  // Built next to index.js; the source path only exists when running from a checkout.
  const built = join(__dirname, 'permission-mcp.js')
  return existsSync(built) ? built : join(__dirname, '..', 'dist', 'permission-mcp.js')
}

/**
 * MCP config handed to the agent CLI for `ask`. The bridge calls back into
 * this dev server, so the URL comes from the connection that started the turn.
 */
export function getPermissionMcpConfig(req: IncomingMessage, runId: string, run: AiInsRun) {
  const socket = req.socket as IncomingMessage['socket'] & { encrypted?: boolean }
  const protocol = socket.encrypted ? 'https' : 'http'
  // The address this connection came in on: always reachable from the same
  // machine, and unlike the Host header it also exists over HTTP/2 (HTTPS dev
  // servers), which only sends `:authority`.
  const address = (socket.localAddress || '127.0.0.1').replace(/^::ffff:/u, '')
  const host = `${address.includes(':') ? `[${address}]` : address}:${socket.localPort}`
  const url = `${protocol}://${host}/__ai-ins-agent/permission?run=${encodeURIComponent(runId)}&token=${run.permissionToken}`
  return JSON.stringify({
    mcpServers: {
      ai_ins: { args: [getBridgeScriptPath()], command: process.execPath, env: { AI_INS_PERMISSION_URL: url } },
    },
  })
}

export function createPermissionToken() {
  return createSessionId()
}

/** Short, human description of what a tool call wants to do, for the transcript record. */
function summarizePermissionInput(input: unknown) {
  if (!input || typeof input !== 'object') return ''
  const record = input as Record<string, unknown>
  for (const key of ['command', 'file_path', 'path', 'url', 'pattern', 'query']) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) {
      const line = value.trim().split('\n', 1)[0]
      return line.length > 160 ? `${line.slice(0, 160)}…` : line
    }
  }
  return ''
}

function sendJson(res: ServerResponse, value: unknown, statusCode = 200) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(value))
}

/** Resolve every request still waiting on a run (agent exited, run stopped or deleted). */
export function cancelPendingPermissions(run: AiInsRun) {
  for (const pending of [...run.pendingPermissions.values()]) {
    pending.resolve('cancelled')
  }
}

function waitForDecision(runId: string, run: AiInsRun, request: AiInsPermissionRequest, res: ServerResponse) {
  let settled = false
  const resolve = (decision: AiInsPermissionDecision) => {
    if (settled) return
    settled = true
    run.pendingPermissions.delete(request.id)
    if (decision === 'always') {
      run.alwaysAllowedTools.add(request.toolName)
    }

    const allowed = decision === 'allow' || decision === 'always'
    if (!res.writableEnded) {
      sendJson(res, allowed ? { behavior: 'allow' } : { behavior: 'deny', message: decision === 'cancelled' ? 'The request was cancelled.' : 'The user denied this tool call.' })
    }

    appendAiInsEvent(runId, { permissionDecision: decision, permissionId: request.id, type: 'permission-resolved' })
    // A token line keeps the decision in the transcript (and history), shown in the panel's language.
    const summary = summarizePermissionInput(request.input)
    appendAiInsEvent(runId, { message: `\n[ai-ins:permission:${decision}] ${request.toolName}${summary ? ` ${summary}` : ''}\n`, stream: 'stdout', type: 'output' })
    bumpAiInsRunsVersion()
  }

  run.pendingPermissions.set(request.id, { request, resolve })
  // The agent process died (stopped, crashed): nobody is waiting for the answer any more.
  res.on('close', () => resolve('cancelled'))
  appendAiInsEvent(runId, { permission: request, type: 'permission' })
  bumpAiInsRunsVersion()
}

/**
 * `POST ?run=&token=` — the bridge asking on behalf of the agent; held open
 * until the user answers. `POST ?run=&request=&decision=` — the panel answering.
 */
export function aiInsPermissionMiddleware(root: string): AiInsMiddleware {
  return async (req, res) => {
    if (req.method !== 'POST') {
      res.statusCode = 405
      res.end('method not allowed')
      return
    }

    const requestUrl = new URL(req.url || '', 'http://localhost')
    const runId = requestUrl.searchParams.get('run') || ''
    const run = aiInsRuns.get(runId)
    const requestId = requestUrl.searchParams.get('request')

    if (requestId) {
      const decision = requestUrl.searchParams.get('decision')
      const pending = run?.root === root ? run.pendingPermissions.get(requestId) : undefined
      if (!pending || (decision !== 'allow' && decision !== 'always' && decision !== 'deny')) {
        sendJson(res, { error: 'error.permissionGone', params: {} }, 409)
        return
      }

      pending.resolve(decision)
      sendJson(res, { success: true })
      return
    }

    if (!run || requestUrl.searchParams.get('token') !== run.permissionToken) {
      sendJson(res, { behavior: 'deny', message: 'Unknown AI Ins run.' }, 403)
      return
    }

    try {
      const body = JSON.parse((await readRequestBody(req)) || '{}') as { input?: unknown; toolName?: unknown }
      const toolName = typeof body.toolName === 'string' && body.toolName ? body.toolName : 'unknown'
      if (run.alwaysAllowedTools.has(toolName)) {
        sendJson(res, { behavior: 'allow' })
        return
      }

      waitForDecision(runId, run, { createdAt: Date.now(), id: createSessionId(), input: body.input ?? {}, toolName }, res)
    } catch (error) {
      sendJson(res, { behavior: 'deny', message: error instanceof Error ? error.message : String(error) }, 400)
    }
  }
}
