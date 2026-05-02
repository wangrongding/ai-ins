import { getDisplayPath } from './source'
import type { CodexInspectEvent, CodexInspectRun, ResolvedDevInspectAgentProvider } from './types'
import type { ServerResponse } from 'http'

const maxBufferedCodexInspectEvents = 800

export const codexInspectRuns = new Map<string, CodexInspectRun>()

export function sendCodexInspectEvent(res: ServerResponse, event: CodexInspectEvent) {
  res.write(`data: ${JSON.stringify(event)}\n\n`)
}

export function appendCodexInspectEvent(runId: string, event: CodexInspectEvent) {
  const run = codexInspectRuns.get(runId)
  if (!run) {
    return
  }

  if (event.type === 'status' || event.type === 'heartbeat') {
    run.status = run.completed ? run.status : 'running'
    run.statusMessage = event.message || run.statusMessage
  }

  if (event.type === 'output') {
    run.status = run.completed ? run.status : 'running'
  }

  if (event.type === 'error') {
    run.completed = true
    run.status = 'failed'
    run.statusMessage = event.message || run.statusMessage
  }

  if (event.type === 'done') {
    run.code = event.code
    run.completed = true
    run.signal = event.signal
    run.status = event.code === 0 ? 'done' : 'failed'
    run.statusMessage = event.code === 0 ? `${run.providerLabel} 已完成` : `${run.providerLabel} 退出：code=${event.code ?? 'null'}`
  }

  run.events.push(event)
  if (run.events.length > maxBufferedCodexInspectEvents) {
    run.events.splice(0, run.events.length - maxBufferedCodexInspectEvents)
  }

  for (const subscriber of run.subscribers) {
    sendCodexInspectEvent(subscriber, event)
  }
}

export function createCodexInspectRun(
  runId: string,
  logPath: string,
  provider: Pick<ResolvedDevInspectAgentProvider, 'id' | 'label'>,
  metadata: {
    fileName: string
    lineNumber: number
    prompt: string
    sourceName: string
    sourcePath: string
  },
) {
  codexInspectRuns.set(runId, {
    completed: false,
    createdAt: Date.now(),
    events: [],
    fileName: metadata.fileName,
    lineNumber: metadata.lineNumber,
    logPath,
    prompt: metadata.prompt,
    providerId: provider.id,
    providerLabel: provider.label,
    sourceName: metadata.sourceName,
    sourcePath: metadata.sourcePath,
    status: 'starting',
    statusMessage: `${provider.label} 启动中`,
    subscribers: new Set(),
  })
}

function getRunOutput(run: CodexInspectRun, root: string) {
  const output = run.events
    .filter((event) => event.type === 'output' || event.type === 'error')
    .map((event) => {
      const prefix = event.stream === 'stderr' ? '[stderr] ' : ''
      return event.type === 'error' ? `\n[inspect] ${event.message || 'Agent failed'}\n` : `${prefix}${event.message || ''}`
    })
    .join('')

  return `${run.providerLabel} 已启动\n日志：${getDisplayPath(run.logPath, root)}\n\n${output}`
}

export function getCodexInspectRunSummary(runId: string, run: CodexInspectRun, root: string) {
  return {
    code: run.code,
    completed: run.completed,
    createdAt: run.createdAt,
    id: runId,
    lineNumber: run.lineNumber,
    logPath: run.logPath,
    output: getRunOutput(run, root),
    prompt: run.prompt,
    providerId: run.providerId,
    providerLabel: run.providerLabel,
    signal: run.signal,
    sourceName: run.sourceName,
    sourcePath: run.sourcePath,
    status: run.status,
    statusMessage: run.statusMessage,
  }
}
