import { getDisplayPath } from './source'
import type { AiInsEvent, AiInsRun, ResolvedAiInsAgentProvider } from './types'
import type { ServerResponse } from 'http'

const maxBufferedAiInsEvents = 800
const droppedEventsNotice = '[ai-ins] 服务端只保留最近的任务事件；较早输出已从面板缓冲中省略，完整输出请打开上方日志文件。\n\n'

export const aiInsRuns = new Map<string, AiInsRun>()

export function sendAiInsEvent(res: ServerResponse, event: AiInsEvent) {
  res.write(`data: ${JSON.stringify(event)}\n\n`)
}

export function appendAiInsEvent(runId: string, event: AiInsEvent) {
  const run = aiInsRuns.get(runId)
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
  if (run.events.length > maxBufferedAiInsEvents) {
    const droppedCount = run.events.length - maxBufferedAiInsEvents
    run.events.splice(0, droppedCount)
    run.droppedEventCount += droppedCount
  }

  for (const subscriber of run.subscribers) {
    sendAiInsEvent(subscriber, event)
  }
}

export function createAiInsRun(
  runId: string,
  logPath: string,
  provider: Pick<ResolvedAiInsAgentProvider, 'id' | 'label'>,
  metadata: {
    agentPrompt?: string
    fileName: string
    lineNumber: number
    prompt: string
    sourceName: string
    sourcePath: string
  },
) {
  aiInsRuns.set(runId, {
    agentPrompt: metadata.agentPrompt,
    completed: false,
    createdAt: Date.now(),
    droppedEventCount: 0,
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

function getRunOutput(run: AiInsRun, root: string) {
  const output = run.events
    .filter((event) => event.type === 'output' || event.type === 'error')
    .map((event) => {
      const prefix = event.stream === 'stderr' ? '[stderr] ' : ''
      return event.type === 'error' ? `\n[ai-ins] ${event.message || 'Agent failed'}\n` : `${prefix}${event.message || ''}`
    })
    .join('')

  const bufferNotice = run.droppedEventCount ? droppedEventsNotice : ''
  return `${run.providerLabel} 已启动\n日志：${getDisplayPath(run.logPath, root)}\n\n${bufferNotice}${output}`
}

export function getAiInsRunSummary(runId: string, run: AiInsRun, root: string) {
  return {
    agentPrompt: run.agentPrompt || '',
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
