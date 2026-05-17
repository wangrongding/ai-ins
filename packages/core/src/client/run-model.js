function getRunStatusLabel(status) {
  switch (status) {
    case 'starting':
      return '启动中'
    case 'running':
      return '运行中'
    case 'done':
      return '已完成'
    case 'failed':
      return '失败'
    case 'disconnected':
      return '连接断开'
    default:
      return '等待'
  }
}

function isRunWorking(run) {
  return run.status === 'starting' || run.status === 'running'
}

function getRunWorkStatus(run) {
  if (run.status === 'starting') {
    return `${run.providerLabel} 正在启动，马上开始处理这块代码`
  }

  if (run.status === 'running') {
    return run.statusMessage || `${run.providerLabel} 正在分析代码和整理改动`
  }

  if (run.status === 'done') {
    return `${run.providerLabel} 已完成`
  }

  if (run.status === 'failed') {
    return run.statusMessage || `${run.providerLabel} 执行失败`
  }

  if (run.status === 'disconnected') {
    return '进度连接断开，可以继续查看日志或刷新重连'
  }

  return '等待任务输出'
}

function getRunTitle(run) {
  return run.sourceName || getDisplayPath(run.sourcePath || '')
}

function formatRunTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

const maxPanelOutputLength = 70000
const panelOutputHeadLength = 12000
const panelOutputTailLength = 52000
const panelOutputCompactionNotice = '\n\n[ai-ins] 面板输出过长，已保留开头和最新部分；完整输出请打开上方日志文件。\n\n'

function slicePanelOutputHead(output) {
  const newlineIndex = output.lastIndexOf('\n', panelOutputHeadLength)
  return output.slice(0, newlineIndex > panelOutputHeadLength * 0.75 ? newlineIndex + 1 : panelOutputHeadLength)
}

function slicePanelOutputTail(output) {
  const tailStart = Math.max(0, output.length - panelOutputTailLength)
  const newlineIndex = output.indexOf('\n', tailStart)
  return output.slice(newlineIndex !== -1 && newlineIndex < tailStart + 1000 ? newlineIndex + 1 : tailStart)
}

function compactOutputForPanel(output) {
  if (output.length <= maxPanelOutputLength) {
    return output
  }

  return `${slicePanelOutputHead(output)}${panelOutputCompactionNotice}${slicePanelOutputTail(output)}`
}

function appendRunOutput(run, message, tone) {
  const prefix = tone === 'stderr' ? '[stderr] ' : ''
  run.output = compactOutputForPanel(`${run.output}${prefix}${message}`)

  if (selectedRunId === run.id) {
    globalThis.aiInsPanelRuntime?.refreshRunDetail()
  }
}

function removeClientRun(runId) {
  const index = runs.findIndex((run) => run.id === runId)
  if (index === -1) {
    return
  }

  runSubscriptions.get(runId)?.close()
  runSubscriptions.delete(runId)
  runs.splice(index, 1)

  if (selectedRunId === runId) {
    selectedRunId = runs[0]?.id
  }

  globalThis.aiInsPanelRuntime?.refreshRunList()
  globalThis.aiInsPanelRuntime?.refreshRunDetail()
  globalThis.aiInsPanelRuntime?.updateDockButton()
}

async function deleteRun(run) {
  try {
    await deleteAgentRun(run.id)
    removeClientRun(run.id)
  } catch (error) {
    if (panelRefs) {
      panelRefs.status.textContent = error instanceof Error ? error.message : String(error)
    }
  }
}
