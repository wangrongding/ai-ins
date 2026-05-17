function subscribeAgentRun(run) {
  if (!run.id || runSubscriptions.has(run.id)) {
    return
  }

  const eventSource = new window.EventSource(`${base}__ai-ins-agent/events?id=${encodeURIComponent(run.id)}`)
  runSubscriptions.set(run.id, eventSource)

  eventSource.onmessage = (event) => {
    let payload
    try {
      payload = JSON.parse(event.data)
    } catch {
      appendRunOutput(run, event.data)
      return
    }

    if (payload.type === 'status') {
      run.status = 'running'
      run.statusMessage = payload.message || `${run.providerLabel} 运行中`
    }

    if (payload.type === 'heartbeat') {
      run.status = run.completed ? run.status : 'running'
      run.statusMessage = payload.message || `${run.providerLabel} 运行中`
    }

    if (payload.type === 'output') {
      run.status = run.completed || run.status === 'failed' ? run.status : 'running'
      appendRunOutput(run, payload.message || '', payload.stream)
    }

    if (payload.type === 'error') {
      run.status = 'failed'
      run.completed = true
      run.statusMessage = payload.message || `${run.providerLabel} 启动失败`
      appendRunOutput(run, `\n[ai-ins] ${run.statusMessage}\n`, 'stderr')
      eventSource.close()
      runSubscriptions.delete(run.id)
    }

    if (payload.type === 'done') {
      run.completed = true
      run.status = payload.code === 0 ? 'done' : 'failed'
      run.statusMessage = payload.code === 0 ? `${run.providerLabel} 已完成` : `${run.providerLabel} 退出：code=${payload.code ?? 'null'}`
      eventSource.close()
      runSubscriptions.delete(run.id)
    }

    globalThis.aiInsPanelRuntime?.refreshRunList()
    globalThis.aiInsPanelRuntime?.refreshRunDetail()
  }

  eventSource.onerror = () => {
    if (run.completed) {
      return
    }

    run.status = 'disconnected'
    run.statusMessage = '进度连接断开，可继续看日志文件'
    globalThis.aiInsPanelRuntime?.refreshRunList()
    globalThis.aiInsPanelRuntime?.refreshRunDetail()
  }
}

function upsertRunFromSummary(summary) {
  const existingRun = runs.find((run) => run.id === summary.id)
  const provider = getProvider(summary.providerId)
  const isCompleted = Boolean(summary.completed)
  const run = existingRun || {
    completed: isCompleted,
    createdAt: summary.createdAt || Date.now(),
    id: summary.id,
    logPath: summary.logPath || '',
    output: '',
    prompt: summary.prompt || '',
    providerId: summary.providerId || provider?.id || 'codex',
    providerLabel: summary.providerLabel || provider?.label || 'Agent',
    sourceName: summary.sourceName || '',
    sourcePath: summary.sourcePath || '',
    status: summary.status || (isCompleted ? 'done' : 'running'),
    statusMessage: summary.statusMessage || '',
  }

  run.completed = isCompleted
  run.createdAt = summary.createdAt || run.createdAt
  run.logPath = summary.logPath || run.logPath
  run.prompt = summary.prompt || run.prompt
  run.providerId = summary.providerId || run.providerId
  run.providerLabel = summary.providerLabel || run.providerLabel
  run.sourceName = summary.sourceName || run.sourceName
  run.sourcePath = summary.sourcePath || run.sourcePath
  run.status = summary.status || run.status
  run.statusMessage = summary.statusMessage || run.statusMessage
  run.output = isCompleted ? compactOutputForPanel(summary.output || run.output) : `${run.providerLabel} 已启动\n日志：${getDisplayPath(run.logPath || '')}\n\n`

  if (!existingRun) {
    runs.push(run)
  }

  if (!selectedRunId) {
    selectedRunId = run.id
  }

  if (!run.completed) {
    subscribeAgentRun(run)
  }
}

async function hydrateAgentRuns() {
  try {
    const result = await loadAgentRuns()
    const summaries = Array.isArray(result.runs) ? result.runs : []

    for (const summary of summaries) {
      upsertRunFromSummary(summary)
    }

    globalThis.aiInsPanelRuntime?.refreshRunList()
    globalThis.aiInsPanelRuntime?.refreshRunDetail()
    globalThis.aiInsPanelRuntime?.updateDockButton()
  } catch (error) {
    console.error('[ai-ins] load AI Ins runs failed:', error)
  }
}

function createRun(result, layer, provider, prompt) {
  const run = {
    completed: false,
    createdAt: Date.now(),
    id: result.runId,
    logPath: result.logPath || '',
    output: `${provider.label} 已启动\n日志：${getDisplayPath(result.logPath || '')}\n\n`,
    prompt,
    providerId: provider.id,
    providerLabel: result.providerLabel || provider.label,
    sourceName: layer.name,
    sourcePath: layer.path,
    status: 'starting',
    statusMessage: `${provider.label} 启动中`,
  }

  runs.unshift(run)
  selectedRunId = run.id
  subscribeAgentRun(run)
  globalThis.aiInsPanelRuntime?.refreshRunList()
  globalThis.aiInsPanelRuntime?.refreshRunDetail()
  globalThis.aiInsPanelRuntime?.updateDockButton()
}
