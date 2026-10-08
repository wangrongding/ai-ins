import { createRoot, type Root } from 'react-dom/client'
import {
  newConversationDraftKey,
  readPermissionMode,
  readPromptDraft,
  readQueuedPrompts,
  savePermissionMode,
  savePromptDraft,
  saveQueuedPrompts,
} from './composer-storage'
import { getLocale, getLocalePreference, isMessageKey, onLocaleChange, setLocalePreference, t } from './i18n'
import { getPanelDefaultSubmitShortcutLabel, PanelView } from './PanelView'
import type { AgentProvider, AgentRun, LayerTarget, PermissionDecision, PermissionMode, PermissionRequest, ProxyMode } from './types'

declare global {
  var aiInsPanelRuntime:
    | {
        flushQueuedPrompt: (run: AgentRun) => void
        refreshComposer: () => void
        refreshRunDetail: () => void
        refreshRunList: () => void
        restoreQueuedPrompts: () => void
        showAiInsPanel: (layer?: LayerTarget, layers?: LayerTarget[]) => void
        unmountAiInsPanel: () => void
        updateDockButton: () => void
      }
    | undefined
}

type AgentTurnResult = {
  agentPrompt?: string
  fileName?: string
  logPath?: string
  providerLabel?: string
  resumed?: boolean
  runId: string
  sessionMode?: string
  sourceName?: string
  turnIndex?: number
}

declare const defaultAgentProviderId: string
declare const defaultProxy: string
declare let aiInsPanel: HTMLElement | undefined
declare let continueTarget: { layer: LayerTarget; layers: LayerTarget[] } | undefined
declare let dockButton: HTMLButtonElement | undefined
declare let draftTarget: { layer: LayerTarget; layers: LayerTarget[] } | undefined
declare let panelRefs: { status: { textContent: string } } | undefined
declare let repointRunId: string | undefined
declare let runsHydrated: boolean
declare let selectedRunId: string | undefined
declare let submitting: boolean
declare let suppressDockClick: boolean
declare const providers: AgentProvider[]
declare const runs: AgentRun[]

declare function appendRunTurn(result: AgentTurnResult, layer: LayerTarget | undefined, provider: AgentProvider, prompt: string): void
declare function applyDockPosition(): void
declare function closeAiInsPanel(): void
declare function createElement(tag: string, className?: string, text?: string): HTMLElement
declare function createRun(result: AgentTurnResult, layer: LayerTarget, provider: AgentProvider, prompt: string): void
declare function clearFinishedRuns(): Promise<void>
declare function deleteRun(run: AgentRun): Promise<void>
declare function answerAgentPermission(runId: string, requestId: string, decision: PermissionDecision): Promise<unknown>
declare function deleteAgentRun(runId: string): Promise<unknown>
declare function getDisplayPath(layerPath: string): string
declare function getProvider(providerId: string): AgentProvider
declare function installDockDrag(): void
declare function loadRunDetail(run: AgentRun): Promise<void>
declare function scheduleRunListSync(delay?: number): void
declare function stopRun(run: AgentRun): Promise<void>
declare function openInEditor(layerPath: string): Promise<void>
declare function readStoredProviderId(): string
declare function readStoredProxy(): string
declare function readStoredProxyMode(): string
declare function runAiInsAgent(
  layer: LayerTarget | undefined,
  layers: LayerTarget[] | undefined,
  providerId: string,
  prompt: string,
  proxyMode: ProxyMode,
  proxy: string,
  resumeRunId?: string,
  permissionMode?: PermissionMode,
): Promise<AgentTurnResult>
declare function saveStoredProviderId(providerId: string): void
declare function saveStoredProxy(proxy: string): void
declare function saveStoredProxyMode(proxyMode: ProxyMode): void

let panelRoot: Root | undefined
let panelStatus = ''
let promptValue = ''
// Which conversation `promptValue` belongs to; drafts are kept per conversation.
let promptKey: string | undefined
// Follow-ups typed while their conversation was still answering, keyed by run id.
const queuedPrompts = readQueuedPrompts()
let providerValue = ''
let proxyModeValue: ProxyMode = 'off'
let proxyValue = ''
let permissionModeValue: PermissionMode = readPermissionMode()
const statusRef = {
  get textContent() {
    return panelStatus
  },
  set textContent(value: string) {
    setPanelStatus(value)
  },
}

function getCurrentProvider() {
  return getProvider(providerValue || readStoredProviderId() || defaultAgentProviderId)
}

function getSelectedRun() {
  return selectedRunId ? runs.find((run) => run.id === selectedRunId) : undefined
}

/**
 * The open conversation is the one the next submit continues. There is no
 * separate "mode": picking a task in the list always means "keep talking to
 * it", and a fresh Option / Alt pick always means a new conversation.
 */
function getContinueRun() {
  return getSelectedRun()
}

function openConversation(runId: string, target?: { layer: LayerTarget; layers: LayerTarget[] }) {
  const run = runs.find((candidate) => candidate.id === runId)
  if (!run) {
    return
  }

  selectedRunId = runId
  continueTarget = target
  repointRunId = undefined
  panelStatus = ''
  renderAiInsPanel()
  focusPanelTextarea()
  if (!run.outputLoaded) {
    void loadRunDetail(run)
  }
}

/** A blank conversation: the focus only ever comes from an Option / Alt pick. */
function startNewConversation() {
  selectedRunId = undefined
  continueTarget = undefined
  draftTarget = undefined
  repointRunId = undefined
  panelStatus = ''
  renderAiInsPanel()
  focusPanelTextarea()
}

function focusPanelTextarea() {
  window.setTimeout(() => {
    const textarea = aiInsPanel?.querySelector('.ai-ins-textarea')
    if (textarea instanceof HTMLTextAreaElement && !textarea.disabled) {
      textarea.focus()
    }
  }, 0)
}

function isProxyMode(value: string): value is ProxyMode {
  return value === 'custom' || value === 'off' || value === 'system'
}

function getInitialProxyMode(storedProxy: string): ProxyMode {
  const storedProxyMode = readStoredProxyMode()
  if (isProxyMode(storedProxyMode)) {
    return storedProxyMode
  }

  if (storedProxy.trim()) {
    return 'custom'
  }

  return defaultProxy ? 'system' : 'off'
}

function getPanelStatus() {
  if (panelStatus) {
    return panelStatus
  }

  const continueRun = getContinueRun()
  if (continueRun) {
    return continueRun.canResume ? t('status.hintContinue', { shortcut: getPanelDefaultSubmitShortcutLabel() }) : ''
  }

  const provider = getCurrentProvider()
  if (!provider?.enabled) {
    return provider?.disabledReason || t('status.agentNotConfigured')
  }

  return draftTarget?.layer ? t('status.hintNew', { shortcut: getPanelDefaultSubmitShortcutLabel() }) : t('status.pickFirst')
}

function setPanelStatus(value: string) {
  panelStatus = value
  renderAiInsPanel()
}

function getTargetLabels(layerTarget: { layer: LayerTarget } | undefined) {
  if (!layerTarget?.layer) {
    return { targetLabel: t('composer.pickTarget'), targetTitle: '' }
  }

  return {
    targetLabel: `${layerTarget.layer.name} · ${getDisplayPath(layerTarget.layer.path)}`,
    targetTitle: `${layerTarget.layer.name} · ${layerTarget.layer.path}`,
  }
}

function isRunWorking(run: AgentRun) {
  return run.status === 'starting' || run.status === 'running'
}

function getResumeBlockedMessage(run: AgentRun) {
  return isMessageKey(run.resumeBlockedCode) ? t(run.resumeBlockedCode, { provider: run.providerLabel }) : t('resume.blocked')
}

function getDraftKey() {
  return selectedRunId || newConversationDraftKey
}

/**
 * Every way of switching conversations (list click, new conversation, Option
 * pick, deletion) ends in a render, so the draft swap happens here once: the
 * text typed for one conversation never leaks into another.
 */
function syncPromptDraft() {
  const key = getDraftKey()
  if (key === promptKey) {
    return
  }

  if (promptKey && (promptKey === newConversationDraftKey || runs.some((run) => run.id === promptKey))) {
    savePromptDraft(promptKey, promptValue)
  }

  promptKey = key
  promptValue = readPromptDraft(key)
}

function setPromptValue(value: string) {
  promptValue = value
  savePromptDraft(getDraftKey(), value)
}

/** Put text back into a conversation's draft, after whatever is already there. */
function returnTextToDraft(runId: string, text: string) {
  const key = runId
  const current = key === promptKey ? promptValue : readPromptDraft(key)
  const merged = current.trim() ? `${current.trimEnd()}\n\n${text}` : text
  if (key === promptKey) {
    promptValue = merged
  }
  savePromptDraft(key, merged)
}

function queuePrompt(run: AgentRun, prompt: string) {
  queuedPrompts.set(run.id, prompt)
  saveQueuedPrompts(queuedPrompts)
}

function cancelQueuedPrompt(runId: string) {
  const prompt = queuedPrompts.get(runId)
  if (!prompt) return
  queuedPrompts.delete(runId)
  saveQueuedPrompts(queuedPrompts)
  returnTextToDraft(runId, prompt)
  renderAiInsPanel()
}

/** Called whenever a conversation settles: send its queued follow-up, or hand it back. */
function flushQueuedPrompt(run: AgentRun) {
  const prompt = queuedPrompts.get(run.id)
  if (!prompt || !run.completed) {
    return
  }

  queuedPrompts.delete(run.id)
  saveQueuedPrompts(queuedPrompts)

  if (run.canResume) {
    void sendTurn(prompt, run, undefined)
    return
  }

  returnTextToDraft(run.id, prompt)
  if (selectedRunId === run.id) {
    panelStatus = t('status.queueReturned')
  }
  renderAiInsPanel()
}

/**
 * After a reload, a queued follow-up whose turn already ended is not sent
 * behind the user's back; it goes back into that conversation's draft.
 */
function restoreQueuedPrompts() {
  let changed = false
  for (const [runId, prompt] of [...queuedPrompts]) {
    const run = runs.find((candidate) => candidate.id === runId)
    if (run && isRunWorking(run)) continue
    queuedPrompts.delete(runId)
    if (run) returnTextToDraft(runId, prompt)
    changed = true
  }

  if (changed) {
    saveQueuedPrompts(queuedPrompts)
    renderAiInsPanel()
  }
}

function renderAiInsPanel() {
  if (!panelRoot) {
    return
  }

  syncPromptDraft()

  const continueRun = getContinueRun()
  const activeTarget = continueRun ? continueTarget : draftTarget
  const repointRun = !continueRun && draftTarget && repointRunId ? runs.find((run) => run.id === repointRunId) : undefined
  const { targetLabel, targetTitle } = continueRun
    ? continueTarget
      ? getTargetLabels(continueTarget)
      : {
          targetLabel: t('composer.keepFocus', { focus: continueRun.sourceName || getDisplayPath(continueRun.sourcePath) }),
          targetTitle: continueRun.sourcePath,
        }
    : getTargetLabels(draftTarget)

  panelRoot.render(
    <PanelView
      defaultProxy={defaultProxy}
      locale={getLocale()}
      localePreference={getLocalePreference()}
      onLocaleChange={setLocalePreference}
      getDisplayPath={getDisplayPath}
      onClearFinishedRuns={() => {
        void clearFinishedRuns()
      }}
      onClose={closeAiInsPanel}
      onContinueWithTarget={() => {
        if (repointRun && draftTarget) {
          openConversation(repointRun.id, draftTarget)
        }
      }}
      onCopyTarget={async () => {
        const layerPath = activeTarget?.layer?.path || continueRun?.sourcePath
        if (!layerPath) return
        await copyTextToClipboard(getDisplayPath(layerPath))
        setPanelStatus(t('status.copied'))
      }}
      onCancelQueued={() => {
        if (selectedRunId) cancelQueuedPrompt(selectedRunId)
      }}
      onDeleteRun={(run) => {
        if (isRunWorking(run) && !window.confirm(t('chat.deleteRunningConfirm'))) {
          return
        }
        void deleteRun(run)
      }}
      onOpenFile={(path) => {
        void openInEditor(path)
          .then(() => setPanelStatus(t('status.openedInIde')))
          .catch((error: unknown) => setPanelStatus(error instanceof Error ? error.message : String(error)))
      }}
      onRetryTurn={(run, turn) => {
        void sendTurn(turn.prompt, run, undefined)
      }}
      onStopRun={(run) => {
        void stopRun(run)
      }}
      onAnswerPermission={(run, request, decision) => {
        void answerPermission(run, request, decision)
      }}
      onNewConversation={startNewConversation}
      onPermissionModeChange={(value) => {
        permissionModeValue = value
        savePermissionMode(value)
        renderAiInsPanel()
      }}
      onOpenInEditor={async () => {
        const layerPath = activeTarget?.layer?.path || continueRun?.sourcePath
        if (!layerPath) return
        await openInEditor(layerPath)
        setPanelStatus(t('status.openedInIde'))
      }}
      onPromptChange={(value) => {
        setPromptValue(value)
        renderAiInsPanel()
      }}
      onProviderChange={(value) => {
        providerValue = value
        panelStatus = ''
        saveStoredProviderId(value)
        renderAiInsPanel()
      }}
      onProxyChange={(value) => {
        proxyValue = value
        renderAiInsPanel()
      }}
      onProxyModeChange={(value) => {
        proxyModeValue = value
        renderAiInsPanel()
      }}
      onSelectRun={(runId) => openConversation(runId)}
      onSubmit={submitAiInsPrompt}
      permissionMode={permissionModeValue}
      prompt={promptValue}
      queuedPrompt={selectedRunId ? queuedPrompts.get(selectedRunId) : undefined}
      providerId={getCurrentProvider()?.id || defaultAgentProviderId}
      providers={providers}
      proxy={proxyValue}
      proxyMode={proxyModeValue}
      repointRun={repointRun}
      repointed={Boolean(continueRun && continueTarget)}
      runCount={runs.length}
      runs={[...runs]}
      runsLoading={!runsHydrated}
      selectedRunId={selectedRunId}
      status={getPanelStatus()}
      submitting={submitting}
      targetLabel={targetLabel}
      targetTitle={targetTitle}
    />,
  )
}

async function answerPermission(run: AgentRun, request: PermissionRequest, decision: PermissionDecision) {
  // Optimistic: the card goes away at once; the SSE `permission-resolved` confirms it.
  run.pendingPermissions = run.pendingPermissions.filter((candidate) => candidate.id !== request.id)
  renderAiInsPanel()
  updateDockButton()

  try {
    await answerAgentPermission(run.id, request.id, decision)
  } catch (error) {
    setPanelStatus(error instanceof Error ? error.message : String(error))
  }
}

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  textarea.style.top = '0'
  document.body.append(textarea)
  textarea.select()

  try {
    const copied = document.execCommand('copy')
    if (!copied) {
      throw new Error(t('status.copyFailed'))
    }
  } finally {
    textarea.remove()
  }
}

function submitAiInsPrompt() {
  const prompt = promptValue.trim()
  const continueRun = getContinueRun()

  if (!prompt) {
    setPanelStatus(t('status.writeSomething'))
    return
  }

  // Typing ahead while the agent answers: hold the message and send it the
  // moment this turn ends, rather than making the user wait to hit send.
  if (continueRun && isRunWorking(continueRun) && continueRun.sessionMode !== 'none') {
    if (queuedPrompts.has(continueRun.id)) {
      setPanelStatus(t('status.alreadyQueued'))
      return
    }

    queuePrompt(continueRun, prompt)
    setPromptValue('')
    panelStatus = ''
    renderAiInsPanel()
    return
  }

  void sendTurn(prompt, continueRun, continueRun ? continueTarget : draftTarget)
}

/**
 * Start a turn: a new conversation when `continueRun` is undefined, otherwise
 * the next turn of that conversation. Shared by the composer, retry and the
 * queued-follow-up flush, so all three validate and report the same way.
 */
async function sendTurn(
  prompt: string,
  continueRun: AgentRun | undefined,
  submitTarget: { layer: LayerTarget; layers: LayerTarget[] } | undefined,
) {
  // A follow-up turn belongs to the session's own agent; the picker is locked
  // to match, so never let a stale selection retarget it.
  const provider = continueRun ? getProvider(continueRun.providerId) : getCurrentProvider()
  const fromComposer = prompt === promptValue.trim()

  if (continueRun && !continueRun.canResume) {
    setPanelStatus(getResumeBlockedMessage(continueRun))
    return
  }

  if (!continueRun && !submitTarget?.layer) {
    setPanelStatus(t('status.pickFirst'))
    return
  }

  if (!provider?.enabled) {
    setPanelStatus(provider?.disabledReason || t('status.agentNotConfigured'))
    return
  }

  const proxy = proxyValue.trim()
  if (proxyModeValue === 'custom' && !proxy) {
    setPanelStatus(t('status.customProxyMissing'))
    return
  }

  submitting = true
  panelStatus = t(continueRun ? 'status.continuingProvider' : 'status.startingProvider', { provider: provider.label })
  saveStoredProxy(proxy)
  saveStoredProxyMode(proxyModeValue)
  if (!continueRun) {
    saveStoredProviderId(provider.id)
  }
  renderAiInsPanel()

  const draftKey = getDraftKey()
  try {
    const result = await runAiInsAgent(
      submitTarget?.layer,
      submitTarget?.layers,
      provider.id,
      prompt,
      proxyModeValue,
      proxy,
      continueRun?.id,
      permissionModeValue,
    )

    if (continueRun) {
      appendRunTurn(result, submitTarget?.layer, provider, prompt)
      continueTarget = undefined
    } else {
      createRun(result, submitTarget!.layer, provider, prompt)
    }

    panelStatus = ''
    if (fromComposer) {
      savePromptDraft(draftKey, '')
      if (promptKey === draftKey) {
        promptValue = ''
      }
    }
  } catch (error) {
    panelStatus = error instanceof Error ? error.message : String(error)
  } finally {
    submitting = false
    renderAiInsPanel()
  }
}

function ensureDockButton() {
  if (dockButton || !runs.length || aiInsPanel) {
    return
  }

  dockButton = createElement('button', 'ai-ins-dock') as HTMLButtonElement
  dockButton.type = 'button'
  dockButton.addEventListener('click', (event) => {
    if (suppressDockClick) {
      event.preventDefault()
      event.stopPropagation()
      suppressDockClick = false
      return
    }

    showAiInsPanel()
  })
  dockButton.style.visibility = 'hidden'
  installDockDrag()
  document.body.append(dockButton)
  updateDockButton()
  applyDockPosition()
  dockButton.style.visibility = ''
}

function updateDockButton() {
  if (aiInsPanel) {
    dockButton?.remove()
    dockButton = undefined
    return
  }

  if (!runs.length) {
    dockButton?.remove()
    dockButton = undefined
    return
  }

  if (!dockButton) {
    ensureDockButton()
    return
  }

  const runningCount = runs.filter((run) => run.status === 'running' || run.status === 'starting').length
  // A conversation blocked on the user matters more than one that is merely busy.
  const waitingCount = runs.filter((run) => run.pendingPermissions?.length).length
  dockButton.classList.toggle('ai-ins-dock-running', runningCount > 0)
  dockButton.classList.toggle('ai-ins-dock-waiting', waitingCount > 0)
  dockButton.textContent = waitingCount
    ? t('dock.waitingPermission', { count: waitingCount })
    : runningCount
      ? t('dock.running', { count: runningCount })
      : t('dock.total', { count: runs.length })
  window.requestAnimationFrame(() => applyDockPosition())
}

function refreshRunList() {
  if (!panelRefs) {
    updateDockButton()
    return
  }

  renderAiInsPanel()
  updateDockButton()
}

function refreshRunDetail() {
  renderAiInsPanel()
}

function refreshComposer() {
  renderAiInsPanel()
}

function showAiInsPanel(layer?: LayerTarget, layers?: LayerTarget[]) {
  if (layer) {
    draftTarget = { layer, layers: layers || [layer] }
    panelStatus = ''

    // A fresh pick always opens a new conversation. The conversation that was
    // open is remembered so the panel can offer "continue it with this element
    // instead" as an explicit, secondary choice.
    repointRunId = selectedRunId || repointRunId
    selectedRunId = undefined
    continueTarget = undefined
  }

  if (aiInsPanel) {
    renderAiInsPanel()
    return
  }

  // Catch up with anything other tabs did while the panel was closed.
  scheduleRunListSync(0)
  providerValue = readStoredProviderId()
  proxyValue = readStoredProxy()
  proxyModeValue = getInitialProxyMode(proxyValue)
  const overlay = createElement('div', 'ai-ins-dialog')
  document.body.append(overlay)

  aiInsPanel = overlay
  panelRefs = { status: statusRef }
  panelRoot = createRoot(overlay)

  let backdropPointerDown = false
  overlay.addEventListener(
    'pointerdown',
    (event) => {
      backdropPointerDown = event.target === overlay
    },
    true,
  )
  overlay.addEventListener('pointercancel', () => {
    backdropPointerDown = false
  })
  overlay.addEventListener('click', (event) => {
    const shouldClose = event.target === overlay && (backdropPointerDown || event.detail === 0)
    backdropPointerDown = false
    if (shouldClose) {
      closeAiInsPanel()
    }
  })
  overlay.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeAiInsPanel()
    }
  })

  renderAiInsPanel()
  updateDockButton()
  window.setTimeout(() => {
    const textarea = overlay.querySelector('.ai-ins-textarea')
    if (textarea instanceof HTMLTextAreaElement) {
      textarea.focus()
    }
  }, 0)
}

function unmountAiInsPanel() {
  panelRoot?.unmount()
  panelRoot = undefined
  panelStatus = ''
}

// Switching language re-renders everything the runtime draws outside React too.
onLocaleChange(() => {
  renderAiInsPanel()
  updateDockButton()
})

globalThis.aiInsPanelRuntime = {
  flushQueuedPrompt,
  refreshComposer,
  refreshRunDetail,
  refreshRunList,
  restoreQueuedPrompts,
  showAiInsPanel,
  unmountAiInsPanel,
  updateDockButton,
}
