import { createRoot, type Root } from 'react-dom/client'
import { clearPanelPromptDraft, getPanelDefaultSubmitShortcutLabel, PanelView } from './PanelView'
import type { AgentProvider, AgentRun, LayerTarget, ProxyMode } from './types'

declare global {
  var aiInsPanelRuntime:
    | {
        refreshComposer: () => void
        refreshRunDetail: () => void
        refreshRunList: () => void
        showAiInsPanel: (layer?: LayerTarget, layers?: LayerTarget[]) => void
        unmountAiInsPanel: () => void
        updateDockButton: () => void
      }
    | undefined
}

declare const defaultAgentProviderId: string
declare const defaultProxy: string
declare let aiInsPanel: HTMLElement | undefined
declare let dockButton: HTMLButtonElement | undefined
declare let draftTarget: { layer: LayerTarget; layers: LayerTarget[] } | undefined
declare let panelRefs: { status: { textContent: string } } | undefined
declare let selectedRunId: string | undefined
declare let submitting: boolean
declare let suppressDockClick: boolean
declare const providers: AgentProvider[]
declare const runs: AgentRun[]

declare function applyDockPosition(): void
declare function closeAiInsPanel(): void
declare function createElement(tag: string, className?: string, text?: string): HTMLElement
declare function createRun(
  result: { agentPrompt?: string; logPath?: string; providerLabel?: string; runId: string },
  layer: LayerTarget,
  provider: AgentProvider,
  prompt: string,
): void
declare function deleteRun(run: AgentRun): Promise<void>
declare function deleteAgentRun(runId: string): Promise<unknown>
declare function getDisplayPath(layerPath: string): string
declare function getProvider(providerId: string): AgentProvider
declare function installDockDrag(): void
declare function openInEditor(layerPath: string): Promise<void>
declare function readStoredProviderId(): string
declare function readStoredProxy(): string
declare function readStoredProxyMode(): string
declare function runAiInsAgent(
  layer: LayerTarget,
  layers: LayerTarget[],
  providerId: string,
  prompt: string,
  proxyMode: ProxyMode,
  proxy: string,
): Promise<{ agentPrompt?: string; logPath?: string; providerLabel?: string; runId: string }>
declare function saveStoredProviderId(providerId: string): void
declare function saveStoredProxy(proxy: string): void
declare function saveStoredProxyMode(proxyMode: ProxyMode): void

let panelRoot: Root | undefined
let panelStatus = ''
let promptValue = ''
let providerValue = ''
let proxyModeValue: ProxyMode = 'off'
let proxyValue = ''
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

  const provider = getCurrentProvider()
  if (!provider?.enabled) {
    return provider?.disabledReason || '这个 Agent 还没有配置'
  }

  return draftTarget?.layer ? `默认 ${getPanelDefaultSubmitShortcutLabel()} 发送，可切换成 Enter，关闭面板不会中断任务` : '先 Option / Alt 点击一个 DOM'
}

function setPanelStatus(value: string) {
  panelStatus = value
  renderAiInsPanel()
}

function renderAiInsPanel() {
  if (!panelRoot) {
    return
  }

  const targetLabel = draftTarget?.layer ? `${draftTarget.layer.name} · ${getDisplayPath(draftTarget.layer.path)}` : 'Option / Alt 点击页面元素选择组件'
  const targetTitle = draftTarget?.layer ? `${draftTarget.layer.name} · ${draftTarget.layer.path}` : ''

  panelRoot.render(
    <PanelView
      defaultProxy={defaultProxy}
      getDisplayPath={getDisplayPath}
      onClose={closeAiInsPanel}
      onCopyTarget={async () => {
        if (!draftTarget?.layer) return
        await copyTextToClipboard(getDisplayPath(draftTarget.layer.path))
        setPanelStatus('已复制源码位置。')
      }}
      onDeleteRun={(run) => {
        void deleteRun(run)
      }}
      onOpenInEditor={async () => {
        if (!draftTarget?.layer) return
        await openInEditor(draftTarget.layer.path)
        setPanelStatus('已在 IDE 打开。')
      }}
      onPromptChange={(value) => {
        promptValue = value
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
      onSelectRun={(runId) => {
        selectedRunId = runId
        renderAiInsPanel()
      }}
      onSubmit={submitAiInsPrompt}
      prompt={promptValue}
      providerId={getCurrentProvider()?.id || defaultAgentProviderId}
      providers={providers}
      proxy={proxyValue}
      proxyMode={proxyModeValue}
      runCount={runs.length}
      runs={[...runs]}
      selectedRunId={selectedRunId}
      status={getPanelStatus()}
      submitting={submitting}
      targetLabel={targetLabel}
      targetTitle={targetTitle}
    />,
  )
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
      throw new Error('复制失败。')
    }
  } finally {
    textarea.remove()
  }
}

async function submitAiInsPrompt() {
  const prompt = promptValue.trim()
  const provider = getCurrentProvider()

  if (!draftTarget?.layer) {
    setPanelStatus('先 Option / Alt 点击一个 DOM。')
    return
  }

  if (!provider?.enabled) {
    setPanelStatus(provider?.disabledReason || '这个 Agent 还没有配置。')
    return
  }

  if (!prompt) {
    setPanelStatus('先写一句你想怎么改。')
    return
  }

  const proxy = proxyValue.trim()
  if (proxyModeValue === 'custom' && !proxy) {
    setPanelStatus('先填写自定义代理地址。')
    return
  }

  submitting = true
  panelStatus = `正在启动 ${provider.label}...`
  saveStoredProxy(proxy)
  saveStoredProxyMode(proxyModeValue)
  saveStoredProviderId(provider.id)
  renderAiInsPanel()

  try {
    const result = await runAiInsAgent(draftTarget.layer, draftTarget.layers, provider.id, prompt, proxyModeValue, proxy)
    createRun(result, draftTarget.layer, provider, prompt)
    promptValue = ''
    clearPanelPromptDraft()
    panelStatus = `${provider.label} 已启动，可以继续点别的 DOM 发新任务。`
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

  dockButton = createElement('button', 'wbx-ai-ins-dock') as HTMLButtonElement
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
  dockButton.classList.toggle('wbx-ai-ins-dock-running', runningCount > 0)
  dockButton.textContent = runningCount ? `${runningCount} 个任务运行中` : `${runs.length} 个 AI Ins 任务`
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
    selectedRunId = undefined
    panelStatus = ''
  }

  if (aiInsPanel) {
    renderAiInsPanel()
    return
  }

  providerValue = readStoredProviderId()
  proxyValue = readStoredProxy()
  proxyModeValue = getInitialProxyMode(proxyValue)
  const overlay = createElement('div', 'wbx-ai-ins-dialog')
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
    const textarea = overlay.querySelector('.wbx-ai-ins-textarea')
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

globalThis.aiInsPanelRuntime = {
  refreshComposer,
  refreshRunDetail,
  refreshRunList,
  showAiInsPanel,
  unmountAiInsPanel,
  updateDockButton,
}
