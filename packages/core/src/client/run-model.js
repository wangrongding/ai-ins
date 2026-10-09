function getRunCurrentTurn(run) {
  return run.turns?.[run.turns.length - 1]
}

/** Last turn start is the stable "activity" time: it moves when a task is continued, not on every heartbeat. */
function getRunActivityAt(run) {
  return Math.max(run.turns?.[run.turns.length - 1]?.createdAt || 0, run.createdAt || 0)
}

function sortClientRuns() {
  runs.sort((first, second) => getRunActivityAt(second) - getRunActivityAt(first))
}

const maxPanelOutputLength = 70000
const panelOutputHeadLength = 12000
const panelOutputTailLength = 52000
// A token, not text: the panel renders it in the current language.
const panelOutputCompactionNotice = '\n\n[ai-ins:notice:panelTruncated]\n\n'

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

function createClientRunTurn(index, prompt, provider, layer, resumed) {
  return {
    agentPrompt: '',
    completed: false,
    createdAt: Date.now(),
    index,
    output: '',
    prompt,
    resumed,
    sourceName: layer?.name || '',
    sourcePath: layer?.path || '',
    status: 'starting',
    statusMessage: `${provider?.label || 'Agent'} starting`,
  }
}

/** Events carry their turn index, so late output never lands on the wrong turn. */
function getRunTurnAt(run, turnIndex) {
  const index = typeof turnIndex === 'number' ? turnIndex : run.turns.length - 1
  return run.turns[index] || run.turns[run.turns.length - 1]
}

function appendRunOutput(run, message, tone, turnIndex) {
  const turn = getRunTurnAt(run, turnIndex)
  if (!turn) {
    return
  }

  const prefix = tone === 'stderr' ? '[stderr] ' : ''
  turn.output = compactOutputForPanel(`${turn.output}${prefix}${message}`)

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
  window.clearTimeout(runResyncTimers.get(runId)?.timer)
  runResyncTimers.delete(runId)
  runs.splice(index, 1)

  if (selectedRunId === runId) {
    selectedRunId = undefined
    continueTarget = undefined
  }

  if (repointRunId === runId) {
    repointRunId = undefined
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

async function pinRun(run, pinned) {
  try {
    const result = await pinAgentRun(run.id, pinned)
    run.pinnedAt = typeof result.pinnedAt === 'number' ? result.pinnedAt : undefined
    globalThis.aiInsPanelRuntime?.refreshRunList()
  } catch (error) {
    if (panelRefs) {
      panelRefs.status.textContent = error instanceof Error ? error.message : String(error)
    }
  }
}

async function clearFinishedRuns() {
  try {
    const result = await clearFinishedAgentRuns()
    const removedIds = Array.isArray(result.removedIds) ? result.removedIds : []
    for (const runId of removedIds) {
      removeClientRun(runId)
    }

    if (panelRefs) {
      panelRefs.status.textContent = removedIds.length
        ? globalThis.aiInsI18n.t('sidebar.clearedCount', { count: removedIds.length })
        : globalThis.aiInsI18n.t('sidebar.clearedNone')
    }
  } catch (error) {
    if (panelRefs) {
      panelRefs.status.textContent = error instanceof Error ? error.message : String(error)
    }
  }
}
