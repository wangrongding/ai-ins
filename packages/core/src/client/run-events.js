function subscribeAgentRun(run) {
  if (!run.id || runSubscriptions.has(run.id)) {
    return
  }

  // `since` keeps a reopened stream (a completed run taking another turn) from
  // replaying — and re-appending — every event of the earlier turns.
  const since = run.lastSeq || 0
  const eventSource = new window.EventSource(
    `${base}__ai-ins-agent/events?id=${encodeURIComponent(run.id)}&since=${since}`,
  )
  runSubscriptions.set(run.id, eventSource)

  const closeSubscription = () => {
    eventSource.close()
    if (runSubscriptions.get(run.id) === eventSource) {
      runSubscriptions.delete(run.id)
    }
  }

  eventSource.onmessage = (event) => {
    let payload
    try {
      payload = JSON.parse(event.data)
    } catch {
      appendRunOutput(run, event.data)
      return
    }

    if (typeof payload.seq === 'number') {
      if (payload.seq <= (run.lastSeq || 0)) {
        return
      }

      run.lastSeq = payload.seq
    }

    const turn = getRunTurnAt(run, payload.turn)

    if (payload.type === 'turn') {
      // The server opened a new turn; mirror it locally if the POST response
      // has not already created it.
      if (!run.turns.some((candidate) => candidate.index === payload.turn)) {
        run.turns.push(createClientRunTurn(payload.turn, payload.message || '', { label: run.providerLabel }, undefined, true))
      }

      run.completed = false
      run.interrupted = false
      run.status = 'starting'
      run.canResume = false
      globalThis.aiInsPanelRuntime?.refreshRunList()
      globalThis.aiInsPanelRuntime?.refreshRunDetail()
      return
    }

    if (payload.type === 'permission' && payload.permission) {
      if (!run.pendingPermissions.some((request) => request.id === payload.permission.id)) {
        run.pendingPermissions.push(payload.permission)
        globalThis.aiInsPanelRuntime?.notifyRun(run, 'waiting')
      }
    }

    if (payload.type === 'permission-resolved') {
      run.pendingPermissions = run.pendingPermissions.filter((request) => request.id !== payload.permissionId)
    }

    if (payload.type === 'thinking' && turn) {
      const thinking = `${turn.thinking || ''}${payload.message || ''}`
      // Keep the recent part, as the server does.
      turn.thinking = thinking.length > 30000 ? `…${thinking.slice(thinking.length - 24000)}` : thinking
      turn.thinkingSince = turn.thinkingSince || Date.now()
      if (!turn.completed) turn.status = 'running'
      run.status = run.completed ? run.status : 'running'
    } else if (turn?.thinkingSince && (payload.type === 'output' || payload.type === 'done' || payload.type === 'error')) {
      turn.thinkingMs = (turn.thinkingMs || 0) + (Date.now() - turn.thinkingSince)
      turn.thinkingSince = undefined
    }

    if (payload.type === 'status' || payload.type === 'heartbeat') {
      const statusMessage = payload.message || `${run.providerLabel} running`
      run.status = run.completed ? run.status : 'running'
      run.statusMessage = statusMessage
      if (turn && !turn.completed) {
        turn.status = 'running'
        turn.statusMessage = statusMessage
      }
    }

    if (payload.type === 'output') {
      run.status = run.completed || run.status === 'failed' ? run.status : 'running'
      if (turn && !turn.completed) {
        turn.status = 'running'
      }
      appendRunOutput(run, payload.message || '', payload.stream, payload.turn)
    }

    // Only a live transition notifies: a settled run replaying its events must not.
    const wasRunning = !run.completed

    if (payload.type === 'error') {
      if (wasRunning) globalThis.aiInsPanelRuntime?.notifyRun(run, 'failed')
      run.status = 'failed'
      run.completed = true
      run.statusMessage = payload.message || `${run.providerLabel} failed to start`
      if (turn) {
        turn.completed = true
        turn.completedAt = payload.completedAt || Date.now()
        turn.status = 'failed'
        turn.statusMessage = run.statusMessage
      }
      appendRunOutput(run, `\n[ai-ins] ${run.statusMessage}\n`, 'stderr', payload.turn)
      // Same as `done`: the server knows whether a session exists to go back to.
      run.canResume = false
      void refreshRunResumability(run)
      closeSubscription()
    }

    if (payload.type === 'done') {
      const succeeded = payload.code === 0 && !payload.stopped
      // A stop is the user's own action; nothing to tell them.
      if (wasRunning && !payload.stopped) globalThis.aiInsPanelRuntime?.notifyRun(run, succeeded ? 'done' : 'failed')
      run.completed = true
      run.status = succeeded ? 'done' : 'failed'
      run.stopping = false
      run.pendingPermissions = []
      run.statusMessage = payload.stopped
        ? 'stopped by user'
        : succeeded
          ? `${run.providerLabel} done`
          : `${run.providerLabel} exited with code=${payload.code ?? 'null'}`
      if (turn) {
        turn.changedFiles = payload.changedFiles
        turn.completed = true
        turn.completedAt = payload.completedAt || Date.now()
        turn.status = run.status
        turn.statusMessage = run.statusMessage
        turn.stopped = Boolean(payload.stopped)
      }
      // Whether this run can take another turn depends on server-side session
      // state, so re-read the authoritative summary instead of guessing.
      void refreshRunResumability(run)
      closeSubscription()
    }

    globalThis.aiInsPanelRuntime?.refreshRunList()
    globalThis.aiInsPanelRuntime?.refreshRunDetail()
  }

  eventSource.onerror = () => {
    // Do not let EventSource auto-reconnect: after a dev server restart the
    // stream URL carries a stale cursor, and a settled run would be replayed
    // and closed in a loop. Re-read the summary instead and resubscribe from it.
    closeSubscription()
    if (run.completed) {
      return
    }

    run.status = 'disconnected'
    run.statusMessage = 'reconnecting'
    scheduleRunResync(run)
    globalThis.aiInsPanelRuntime?.refreshRunList()
    globalThis.aiInsPanelRuntime?.refreshRunDetail()
  }
}

function scheduleRunResync(run) {
  const previous = runResyncTimers.get(run.id)
  if (previous?.timer) {
    return
  }

  const attempt = (previous?.attempt || 0) + 1
  const delay = Math.min(15000, 1000 * 2 ** Math.min(attempt - 1, 4))
  const timer = window.setTimeout(async () => {
    runResyncTimers.set(run.id, { attempt })

    try {
      const result = await loadAgentRun(run.id)
      if (!runs.includes(run)) {
        runResyncTimers.delete(run.id)
        return
      }

      if (!result.run) {
        runResyncTimers.delete(run.id)
        run.canResume = false
        run.completed = true
        run.resumeBlockedCode = 'resume.gone'
        run.status = 'failed'
        run.statusMessage = 'run not found on the dev server'
        const turn = getRunCurrentTurn(run)
        if (turn && !turn.completed) {
          turn.completed = true
          turn.status = 'failed'
          turn.statusMessage = run.statusMessage
        }
      } else {
        if (result.run.completed) {
          runResyncTimers.delete(run.id)
        }

        upsertRunFromSummary(result.run)
        sortClientRuns()
      }
    } catch {
      // Server still down: keep backing off until it comes back.
      scheduleRunResync(run)
      return
    }

    globalThis.aiInsPanelRuntime?.refreshRunList()
    globalThis.aiInsPanelRuntime?.refreshRunDetail()
    globalThis.aiInsPanelRuntime?.refreshComposer()
    globalThis.aiInsPanelRuntime?.updateDockButton()
  }, delay)

  runResyncTimers.set(run.id, { attempt, timer })
}

/** Settled transcripts are not part of the task list payload; fetch one when it is opened. */
async function loadRunDetail(run) {
  if (!run || run.outputLoaded || run.detailLoading) {
    return
  }

  run.detailLoading = true
  globalThis.aiInsPanelRuntime?.refreshRunDetail()

  try {
    const result = await loadAgentRun(run.id)
    if (result.run) {
      upsertRunFromSummary(result.run)
    } else {
      removeClientRun(run.id)
    }
  } catch (error) {
    console.error('[ai-ins] load AI Ins run failed:', error)
  } finally {
    run.detailLoading = false
    globalThis.aiInsPanelRuntime?.refreshRunDetail()
    globalThis.aiInsPanelRuntime?.refreshComposer()
  }
}

async function refreshRunResumability(run) {
  try {
    const result = await loadAgentRun(run.id)
    const summary = result.run
    if (!summary) {
      return
    }

    run.canResume = Boolean(summary.canResume)
    run.resumeBlockedCode = summary.resumeBlockedCode || ''
    run.sessionMode = summary.sessionMode || run.sessionMode
    globalThis.aiInsPanelRuntime?.refreshRunList()
    globalThis.aiInsPanelRuntime?.refreshRunDetail()
    globalThis.aiInsPanelRuntime?.refreshComposer()
    // A follow-up typed while this turn ran goes out now that the session is free.
    globalThis.aiInsPanelRuntime?.flushQueuedPrompt(run)
  } catch (error) {
    console.error('[ai-ins] refresh AI Ins run failed:', error)
  }
}

function mergeTurnsFromSummary(run, summaryTurns) {
  if (!Array.isArray(summaryTurns) || !summaryTurns.length) {
    return
  }

  run.turns = summaryTurns.map((summaryTurn, index) => {
    const existing = run.turns.find((candidate) => candidate.index === (summaryTurn.index ?? index))

    // List summaries leave output out; a live turn's output belongs to the SSE
    // stream once we have one, but a turn seen for the first time (page reload
    // mid-run) has to start from the server snapshot — the stream resumes after it.
    const hasSummaryOutput = typeof summaryTurn.output === 'string'
    const output =
      hasSummaryOutput && (summaryTurn.completed || !existing)
        ? compactOutputForPanel(summaryTurn.output)
        : existing?.output || ''

    return {
      agentPrompt: summaryTurn.agentPrompt || existing?.agentPrompt || '',
      changedFiles: Array.isArray(summaryTurn.changedFiles) ? summaryTurn.changedFiles : existing?.changedFiles,
      completed: Boolean(summaryTurn.completed),
      completedAt: summaryTurn.completedAt || existing?.completedAt,
      createdAt: summaryTurn.createdAt || existing?.createdAt || Date.now(),
      index: summaryTurn.index ?? index,
      interrupted: Boolean(summaryTurn.interrupted),
      permissionMode: summaryTurn.permissionMode || existing?.permissionMode,
      // Like output: a live turn's thinking belongs to the stream once we have one.
      thinking:
        typeof summaryTurn.thinking === 'string' && (summaryTurn.completed || !existing) ? summaryTurn.thinking : existing?.thinking,
      thinkingMs: summaryTurn.completed ? summaryTurn.thinkingMs : existing?.thinkingMs ?? summaryTurn.thinkingMs,
      thinkingSince: summaryTurn.completed ? undefined : existing?.thinkingSince,
      output,
      prompt: summaryTurn.prompt || existing?.prompt || '',
      resumed: Boolean(summaryTurn.resumed),
      sourceName: summaryTurn.sourceName || existing?.sourceName || '',
      sourcePath: summaryTurn.sourcePath || existing?.sourcePath || '',
      status: summaryTurn.status || existing?.status || 'running',
      statusMessage: summaryTurn.statusMessage || existing?.statusMessage || '',
      stopped: Boolean(summaryTurn.stopped),
    }
  })
}

function upsertRunFromSummary(summary) {
  const existingRun = runs.find((run) => run.id === summary.id)
  const provider = getProvider(summary.providerId)
  const isCompleted = Boolean(summary.completed)
  const run = existingRun || {
    canResume: false,
    completed: isCompleted,
    createdAt: summary.createdAt || Date.now(),
    id: summary.id,
    interrupted: false,
    lastSeq: 0,
    logDisplayPath: summary.logDisplayPath || '',
    logPath: summary.logPath || '',
    outputLoaded: false,
    pendingPermissions: [],
    providerId: summary.providerId || provider?.id || 'codex',
    providerLabel: summary.providerLabel || provider?.label || 'Agent',
    resumeBlockedCode: '',
    sessionMode: 'none',
    sourceName: summary.sourceName || '',
    sourcePath: summary.sourcePath || '',
    status: summary.status || (isCompleted ? 'done' : 'running'),
    statusMessage: summary.statusMessage || '',
    turns: [],
  }

  run.canResume = Boolean(summary.canResume)
  run.completed = isCompleted
  run.createdAt = summary.createdAt || run.createdAt
  run.interrupted = Boolean(summary.interrupted)
  // A settled summary is a full snapshot, so its cursor wins even when it is
  // lower than ours — after a dev server restart the server counts from where
  // it last saved, and keeping a higher local cursor would drop the next turn.
  if (typeof summary.lastSeq === 'number') {
    run.lastSeq = isCompleted ? summary.lastSeq : Math.max(run.lastSeq || 0, summary.lastSeq)
  }
  run.outputLoaded = Boolean(run.outputLoaded || summary.detail)
  run.pinnedAt = typeof summary.pinnedAt === 'number' ? summary.pinnedAt : undefined
  run.pendingPermissions = Array.isArray(summary.pendingPermissions) ? summary.pendingPermissions : []
  run.logDisplayPath = summary.logDisplayPath || run.logDisplayPath
  run.logPath = summary.logPath || run.logPath
  run.providerId = summary.providerId || run.providerId
  run.providerLabel = summary.providerLabel || run.providerLabel
  run.resumeBlockedCode = summary.resumeBlockedCode || ''
  run.sessionMode = summary.sessionMode || run.sessionMode
  run.sourceName = summary.sourceName || run.sourceName
  run.sourcePath = summary.sourcePath || run.sourcePath
  run.status = summary.status || run.status
  run.statusMessage = summary.statusMessage || run.statusMessage
  mergeTurnsFromSummary(run, summary.turns)

  if (!existingRun) {
    runs.push(run)
  }

  if (!run.completed) {
    subscribeAgentRun(run)
  }
}

async function hydrateAgentRuns() {
  try {
    const result = await loadAgentRuns()
    const summaries = Array.isArray(result.runs) ? result.runs : []
    runsVersion = result.version || 0

    for (const summary of summaries) {
      upsertRunFromSummary(summary)
    }

    sortClientRuns()
    globalThis.aiInsPanelRuntime?.restoreQueuedPrompts()
  } catch (error) {
    console.error('[ai-ins] load AI Ins runs failed:', error)
  } finally {
    runsHydrated = true
    scheduleRunListSync()
    globalThis.aiInsPanelRuntime?.refreshRunList()
    globalThis.aiInsPanelRuntime?.refreshRunDetail()
    globalThis.aiInsPanelRuntime?.updateDockButton()
  }
}

function createRun(result, layer, provider, prompt) {
  const run = {
    canResume: false,
    completed: false,
    createdAt: Date.now(),
    id: result.runId,
    interrupted: false,
    lastSeq: 0,
    logDisplayPath: getDisplayPath(result.logPath || ''),
    logPath: result.logPath || '',
    outputLoaded: true,
    pendingPermissions: [],
    providerId: provider.id,
    providerLabel: result.providerLabel || provider.label,
    resumeBlockedCode: '',
    sessionMode: result.sessionMode || provider.sessionMode || 'none',
    sourceName: layer?.name || result.sourceName || '',
    sourcePath: layer?.path || '',
    status: 'starting',
    statusMessage: `${provider.label} starting`,
    turns: [createClientRunTurn(0, prompt, provider, layer, false)],
  }

  run.turns[0].agentPrompt = result.agentPrompt || ''
  runs.unshift(run)
  selectedRunId = run.id
  subscribeAgentRun(run)
  globalThis.aiInsPanelRuntime?.refreshRunList()
  globalThis.aiInsPanelRuntime?.refreshRunDetail()
  globalThis.aiInsPanelRuntime?.updateDockButton()
}

/** Attach a follow-up turn to the run the user chose to continue. */
function appendRunTurn(result, layer, provider, prompt) {
  const run = runs.find((candidate) => candidate.id === result.runId)
  if (!run) {
    createRun(result, layer, provider, prompt)
    return
  }

  const turnIndex = typeof result.turnIndex === 'number' ? result.turnIndex : run.turns.length
  let turn = run.turns.find((candidate) => candidate.index === turnIndex)

  if (!turn) {
    turn = createClientRunTurn(turnIndex, prompt, provider, undefined, true)
    run.turns.push(turn)
  }

  turn.agentPrompt = result.agentPrompt || turn.agentPrompt
  turn.prompt = prompt
  turn.sourceName = result.sourceName || layer?.name || run.sourceName
  turn.sourcePath = result.fileName || layer?.path || run.sourcePath

  run.canResume = false
  run.completed = false
  run.interrupted = false
  run.resumeBlockedCode = ''
  run.sourceName = turn.sourceName
  run.sourcePath = turn.sourcePath
  run.status = 'starting'
  run.statusMessage = `${run.providerLabel} starting`

  selectedRunId = run.id
  sortClientRuns()
  subscribeAgentRun(run)
  globalThis.aiInsPanelRuntime?.refreshRunList()
  globalThis.aiInsPanelRuntime?.refreshRunDetail()
  globalThis.aiInsPanelRuntime?.updateDockButton()
}

/**
 * Keep the list in step with other tabs (and other browsers) on the same dev
 * server. The server answers "unchanged" for a matching version, so polling is
 * one tiny request most of the time; it runs faster while the panel is open
 * and pauses while the tab is hidden.
 */
function scheduleRunListSync(delay) {
  window.clearTimeout(runListSyncTimer)
  runListSyncTimer = window.setTimeout(syncRunList, delay ?? (aiInsPanel ? 4000 : 15000))
}

async function syncRunList() {
  if (document.visibilityState === 'hidden') {
    scheduleRunListSync()
    return
  }

  const requestedAt = Date.now()
  try {
    const result = await loadAgentRuns(runsVersion)
    if (!result.unchanged) {
      applyRunListSnapshot(result, requestedAt)
    }
  } catch {
    // Dev server restarting; the next tick tries again.
  }

  scheduleRunListSync()
}

function applyRunListSnapshot(result, requestedAt) {
  const summaries = Array.isArray(result.runs) ? result.runs : []
  const serverIds = new Set(summaries.map((summary) => summary.id))
  runsVersion = result.version || 0

  for (const summary of summaries) {
    const existing = runs.find((run) => run.id === summary.id)
    // This tab may already be past the snapshot (its own SSE delivered the
    // turn's end first); a stale summary must not drag the run back to running.
    if (existing && typeof summary.lastSeq === 'number' && summary.lastSeq < (existing.lastSeq || 0)) {
      continue
    }

    upsertRunFromSummary(summary)
  }

  // Deleted elsewhere. Runs this tab created after the request went out are
  // not in the snapshot yet, so they are left alone.
  for (const run of [...runs]) {
    if (!serverIds.has(run.id) && run.createdAt < requestedAt) {
      removeClientRun(run.id)
    }
  }

  sortClientRuns()
  for (const run of runs) {
    if (run.completed) {
      globalThis.aiInsPanelRuntime?.flushQueuedPrompt(run)
    }
  }

  globalThis.aiInsPanelRuntime?.refreshRunList()
  globalThis.aiInsPanelRuntime?.refreshRunDetail()
  globalThis.aiInsPanelRuntime?.refreshComposer()
  globalThis.aiInsPanelRuntime?.updateDockButton()
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && runsHydrated) {
    scheduleRunListSync(0)
  }
})

async function stopRun(run) {
  try {
    await stopAgentRun(run.id)
    run.stopping = true
    globalThis.aiInsPanelRuntime?.refreshRunDetail()
  } catch (error) {
    if (panelRefs) {
      panelRefs.status.textContent = error instanceof Error ? error.message : String(error)
    }
  }
}
