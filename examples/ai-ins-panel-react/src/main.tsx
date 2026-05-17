import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { clearPanelPromptDraft, PanelView } from '../../../packages/core/src/client-panel/PanelView'
import type { AgentProvider, AgentRun, LayerTarget, ProxyMode } from '../../../packages/core/src/client-panel/types'
import '../../../packages/core/src/client/style.css'
import './style.css'

type AiInsConfig = {
  defaultProvider: string
  defaultProxy: string
  providers: AgentProvider[]
  root: string
}

type DraftTarget = {
  layer: LayerTarget
  layers: LayerTarget[]
}

const base = '/'
const proxyStorageKey = 'ai-ins-proxy'
const proxyModeStorageKey = 'ai-ins-proxy-mode'
const providerStorageKey = 'ai-ins-provider'

async function readJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options)

  if (!response.ok) {
    throw new Error(await response.text())
  }

  return response.json()
}

async function openInEditor(layerPath: string) {
  await readJson(`${base}__open-in-editor?file=${encodeURIComponent(layerPath)}`)
}

async function runAiInsAgent(layer: LayerTarget, layers: LayerTarget[], providerId: string, prompt: string, proxyMode: ProxyMode, proxy: string) {
  return readJson<{ logPath?: string; providerLabel?: string; runId: string }>(`${base}__ai-ins-agent`, {
    body: JSON.stringify({
      file: layer.path,
      layers,
      prompt,
      provider: providerId,
      proxy,
      proxyMode,
    }),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  })
}

async function loadAgentRuns() {
  return readJson<{ runs: Array<Partial<AgentRun> & { id: string }> }>(`${base}__ai-ins-agent/runs`)
}

async function deleteAgentRun(runId: string) {
  await readJson(`${base}__ai-ins-agent/runs?id=${encodeURIComponent(runId)}`, { method: 'DELETE' })
}

function readStoredValue(key: string) {
  try {
    return window.localStorage.getItem(key) || ''
  } catch {
    return ''
  }
}

function saveStoredValue(key: string, value: string) {
  try {
    if (value) {
      window.localStorage.setItem(key, value)
    } else {
      window.localStorage.removeItem(key)
    }
  } catch {
    // Ignore storage restrictions in embedded browsers.
  }
}

function isProxyMode(value: string): value is ProxyMode {
  return value === 'custom' || value === 'off' || value === 'system'
}

function getInitialProxyMode(storedProxy: string, defaultProxy: string): ProxyMode {
  const storedProxyMode = readStoredValue(proxyModeStorageKey)
  if (isProxyMode(storedProxyMode)) {
    return storedProxyMode
  }

  if (storedProxy.trim()) {
    return 'custom'
  }

  return defaultProxy ? 'system' : 'off'
}

const maxPanelOutputLength = 70000
const panelOutputHeadLength = 12000
const panelOutputTailLength = 52000
const panelOutputCompactionNotice = '\n\n[ai-ins] 面板输出过长，已保留开头和最新部分；完整输出请打开上方日志文件。\n\n'

function slicePanelOutputHead(output: string) {
  const newlineIndex = output.lastIndexOf('\n', panelOutputHeadLength)
  return output.slice(0, newlineIndex > panelOutputHeadLength * 0.75 ? newlineIndex + 1 : panelOutputHeadLength)
}

function slicePanelOutputTail(output: string) {
  const tailStart = Math.max(0, output.length - panelOutputTailLength)
  const newlineIndex = output.indexOf('\n', tailStart)
  return output.slice(newlineIndex !== -1 && newlineIndex < tailStart + 1000 ? newlineIndex + 1 : tailStart)
}

function compactOutputForPanel(output: string) {
  if (output.length <= maxPanelOutputLength) {
    return output
  }

  return `${slicePanelOutputHead(output)}${panelOutputCompactionNotice}${slicePanelOutputTail(output)}`
}

function getElementName(element: HTMLElement) {
  const tag = element.tagName.toLowerCase()
  const id = element.id ? `#${element.id}` : ''
  const className = Array.from(element.classList).slice(0, 2).map((name) => `.${name}`).join('')
  return `${tag}${id}${className}`
}

function getLayersForElement(element: HTMLElement) {
  let instance: HTMLElement | null = element
  const layers: LayerTarget[] = []

  while (instance) {
    const path = instance.getAttribute('data-ai-ins-source')
    if (path) {
      layers.push({
        name: getElementName(instance),
        path,
        range: instance.getAttribute('data-ai-ins-source-range') || undefined,
      })
    }

    instance = instance.parentElement?.closest('[data-ai-ins-source]') || null
  }

  return layers
}

function getSourceElement(element: HTMLElement) {
  return element.closest('[data-ai-ins-source]')
}

function getPanelTarget(container: HTMLElement | null): DraftTarget | undefined {
  const panel = container?.querySelector('.wbx-ai-ins-panel')
  if (!(panel instanceof HTMLElement)) {
    return undefined
  }

  return getTargetForElement(panel)
}

function getTargetForElement(element: HTMLElement): DraftTarget | undefined {
  const layers = getLayersForElement(element)
  const layer = layers[0]
  return layer ? { layer, layers } : undefined
}

function createRunFromSummary(summary: Partial<AgentRun> & { id: string }, providers: AgentProvider[]) {
  const provider = providers.find((candidate) => candidate.id === summary.providerId) || providers.find((candidate) => candidate.enabled) || providers[0]
  const completed = Boolean(summary.completed)

  return {
    completed,
    createdAt: summary.createdAt || Date.now(),
    id: summary.id,
    logPath: summary.logPath || '',
    output: completed ? compactOutputForPanel(summary.output || '') : `${summary.providerLabel || provider?.label || 'Agent'} 已启动\n日志：${summary.logPath || ''}\n\n`,
    prompt: summary.prompt || '',
    providerId: summary.providerId || provider?.id || 'codex',
    providerLabel: summary.providerLabel || provider?.label || 'Agent',
    sourceName: summary.sourceName || '',
    sourcePath: summary.sourcePath || '',
    status: summary.status || (completed ? 'done' : 'running'),
    statusMessage: summary.statusMessage || '',
  } satisfies AgentRun
}

function getProvider(providers: AgentProvider[], providerId: string) {
  return providers.find((provider) => provider.id === providerId) || providers.find((provider) => provider.enabled) || providers[0]
}

function isMacPlatform() {
  const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform || navigator.platform || ''
  return /mac|iphone|ipad|ipod/i.test(platform)
}

function isOpenSourceShortcut(event: Pick<MouseEvent, 'altKey' | 'ctrlKey' | 'metaKey'>) {
  return isMacPlatform() ? event.altKey && event.metaKey : event.ctrlKey && event.altKey
}

function App() {
  const shellRef = useRef<HTMLDivElement>(null)
  const previewTargetRef = useRef<HTMLElement | null>(null)
  const eventSources = useRef(new Map<string, EventSource>())
  const [config, setConfig] = useState<AiInsConfig>({
    defaultProvider: 'codex',
    defaultProxy: '',
    providers: [{ enabled: true, id: 'codex', label: 'Codex' }],
    root: '',
  })
  const [draftTarget, setDraftTarget] = useState<DraftTarget>()
  const [prompt, setPrompt] = useState('')
  const [providerId, setProviderId] = useState(readStoredValue(providerStorageKey) || 'codex')
  const [proxy, setProxy] = useState(() => readStoredValue(proxyStorageKey))
  const [proxyMode, setProxyMode] = useState<ProxyMode>(() => getInitialProxyMode(readStoredValue(proxyStorageKey), ''))
  const [runs, setRuns] = useState<AgentRun[]>([])
  const [selectedRunId, setSelectedRunId] = useState<string>()
  const [status, setStatus] = useState('正在连接真实 AI Ins dev server...')
  const [submitting, setSubmitting] = useState(false)

  function getDisplayPath(path: string) {
    return config.root && path.startsWith(`${config.root}/`) ? path.slice(config.root.length + 1) : path
  }

  function subscribeRun(run: AgentRun) {
    if (!run.id || run.completed || eventSources.current.has(run.id)) {
      return
    }

    const eventSource = new window.EventSource(`${base}__ai-ins-agent/events?id=${encodeURIComponent(run.id)}`)
    eventSources.current.set(run.id, eventSource)

    eventSource.onmessage = (event) => {
      let payload: { code?: number | null; message?: string; stream?: string; type?: string }
      try {
        payload = JSON.parse(event.data)
      } catch {
        payload = { message: event.data, type: 'output' }
      }

      setRuns((currentRuns) =>
        currentRuns.map((currentRun) => {
          if (currentRun.id !== run.id) {
            return currentRun
          }

          if (payload.type === 'status' || payload.type === 'heartbeat') {
            return {
              ...currentRun,
              status: currentRun.completed ? currentRun.status : 'running',
              statusMessage: payload.message || `${currentRun.providerLabel} 运行中`,
            }
          }

          if (payload.type === 'output') {
            const prefix = payload.stream === 'stderr' ? '[stderr] ' : ''
            return {
              ...currentRun,
              output: compactOutputForPanel(`${currentRun.output}${prefix}${payload.message || ''}`),
              status: currentRun.completed || currentRun.status === 'failed' ? currentRun.status : 'running',
            }
          }

          if (payload.type === 'error') {
            eventSource.close()
            eventSources.current.delete(run.id)
            return {
              ...currentRun,
              completed: true,
              output: compactOutputForPanel(`${currentRun.output}\n[ai-ins] ${payload.message || `${currentRun.providerLabel} 启动失败`}\n`),
              status: 'failed',
              statusMessage: payload.message || `${currentRun.providerLabel} 启动失败`,
            }
          }

          if (payload.type === 'done') {
            eventSource.close()
            eventSources.current.delete(run.id)
            return {
              ...currentRun,
              completed: true,
              status: payload.code === 0 ? 'done' : 'failed',
              statusMessage: payload.code === 0 ? `${currentRun.providerLabel} 已完成` : `${currentRun.providerLabel} 退出：code=${payload.code ?? 'null'}`,
            }
          }

          return currentRun
        }),
      )
    }

    eventSource.onerror = () => {
      setRuns((currentRuns) =>
        currentRuns.map((currentRun) =>
          currentRun.id === run.id && !currentRun.completed
            ? { ...currentRun, status: 'disconnected', statusMessage: '进度连接断开，可继续看日志文件' }
            : currentRun,
        ),
      )
    }
  }

  useEffect(() => {
    let mounted = true

    async function hydrate() {
      try {
        const nextConfig = await readJson<AiInsConfig>(`${base}__ai-ins-config`)
        if (!mounted) return

        setConfig(nextConfig)
        const storedProvider = readStoredValue(providerStorageKey)
        const storedProxy = readStoredValue(proxyStorageKey)
        const nextProviderId = storedProvider || nextConfig.defaultProvider
        setProviderId(nextProviderId)
        setProxy(storedProxy)
        setProxyMode(getInitialProxyMode(storedProxy, nextConfig.defaultProxy))

        const result = await loadAgentRuns()
        if (!mounted) return

        const nextRuns = (Array.isArray(result.runs) ? result.runs : []).map((summary) => createRunFromSummary(summary, nextConfig.providers))
        setRuns(nextRuns)
        setSelectedRunId((current) => current || nextRuns[0]?.id)
        nextRuns.forEach(subscribeRun)
        setStatus(nextRuns.length ? '已连接真实 AI Ins 任务流。' : '已连接真实 AI Ins dev server，可以直接提交修改请求。')
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error))
      }
    }

    void hydrate()
    return () => {
      mounted = false
      for (const eventSource of eventSources.current.values()) {
        eventSource.close()
      }
      eventSources.current.clear()
    }
  }, [])

  useLayoutEffect(() => {
    setDraftTarget(getPanelTarget(shellRef.current))
  }, [config.root, runs.length, selectedRunId, status])

  const provider = getProvider(config.providers, providerId)
  const targetLabel = draftTarget?.layer ? `${draftTarget.layer.name} · ${getDisplayPath(draftTarget.layer.path)}` : '正在读取 PanelView 源码位置...'
  const targetTitle = draftTarget?.layer ? `${draftTarget.layer.name} · ${draftTarget.layer.path}` : ''

  function clearPreviewTarget() {
    if (previewTargetRef.current) {
      delete previewTargetRef.current.dataset.aiInsTarget
      previewTargetRef.current = null
    }
  }

  function selectPreviewTarget(element: HTMLElement, options: { commit?: boolean } = {}) {
    const sourceElement = getSourceElement(element)
    if (!(sourceElement instanceof HTMLElement)) {
      return
    }

    if (previewTargetRef.current !== sourceElement) {
      clearPreviewTarget()
      previewTargetRef.current = sourceElement
      sourceElement.dataset.aiInsTarget = 'true'
    }

    const nextTarget = getTargetForElement(sourceElement)
    if (!nextTarget) {
      return
    }

    setDraftTarget(nextTarget)
    if (options.commit) {
      setStatus(`已选择 ${nextTarget.layer.name}。`)
    }

    return nextTarget
  }

  async function handleSubmit() {
    const rawPrompt = prompt.trim()

    if (!draftTarget?.layer) {
      setStatus('还没有读取到 PanelView 的源码位置。')
      return
    }

    if (!provider?.enabled) {
      setStatus(provider?.disabledReason || '这个 Agent 还没有配置。')
      return
    }

    if (!rawPrompt) {
      setStatus('先写一句你想怎么改。')
      return
    }

    const customProxy = proxy.trim()
    if (proxyMode === 'custom' && !customProxy) {
      setStatus('先填写自定义代理地址。')
      return
    }

    setSubmitting(true)
    setStatus(`正在启动 ${provider.label}...`)
    saveStoredValue(proxyStorageKey, customProxy)
    saveStoredValue(proxyModeStorageKey, proxyMode)
    saveStoredValue(providerStorageKey, provider.id)

    try {
      const result = await runAiInsAgent(draftTarget.layer, draftTarget.layers, provider.id, rawPrompt, proxyMode, customProxy)
      const run = {
        completed: false,
        createdAt: Date.now(),
        id: result.runId,
        logPath: result.logPath || '',
        output: `${result.providerLabel || provider.label} 已启动\n日志：${getDisplayPath(result.logPath || '')}\n\n`,
        prompt: rawPrompt,
        providerId: provider.id,
        providerLabel: result.providerLabel || provider.label,
        sourceName: draftTarget.layer.name,
        sourcePath: draftTarget.layer.path,
        status: 'starting',
        statusMessage: `${provider.label} 启动中`,
      } satisfies AgentRun

      setRuns((currentRuns) => [run, ...currentRuns])
      setSelectedRunId(run.id)
      subscribeRun(run)
      setPrompt('')
      clearPanelPromptDraft()
      setStatus(`${provider.label} 已启动，正在真实修改 core 面板源码。`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="panel-playground-shell wbx-ai-ins-dialog"
      onClickCapture={(event) => {
        if (!event.altKey || !(event.target instanceof HTMLElement)) {
          return
        }

        event.preventDefault()
        event.stopPropagation()
        const nextTarget = selectPreviewTarget(event.target, { commit: true })

        if (nextTarget && isOpenSourceShortcut(event.nativeEvent)) {
          void openInEditor(nextTarget.layer.path)
            .then(() => setStatus('已在 IDE 打开真实面板源码。'))
            .catch((error) => setStatus(error instanceof Error ? error.message : String(error)))
        }
      }}
      onKeyUpCapture={(event) => {
        if (!event.altKey) {
          clearPreviewTarget()
        }
      }}
      onMouseMoveCapture={(event) => {
        if (!event.altKey) {
          clearPreviewTarget()
          return
        }

        if (!(event.target instanceof HTMLElement)) {
          return
        }

        selectPreviewTarget(event.target)
      }}
      onMouseLeave={clearPreviewTarget}
      ref={shellRef}
    >
      <PanelView
        defaultProxy={config.defaultProxy}
        getDisplayPath={getDisplayPath}
        onClose={() => setStatus('Playground 保持常驻；真实面板里的收起按钮会关闭 overlay。')}
        onCopyTarget={async () => {
          if (!draftTarget?.layer) return
          await navigator.clipboard.writeText(getDisplayPath(draftTarget.layer.path))
          setStatus('已复制源码位置。')
        }}
        onDeleteRun={async (run) => {
          try {
            await deleteAgentRun(run.id)
            eventSources.current.get(run.id)?.close()
            eventSources.current.delete(run.id)
            setRuns((currentRuns) => currentRuns.filter((currentRun) => currentRun.id !== run.id))
            setSelectedRunId((current) => (current === run.id ? undefined : current))
            setStatus('已删除任务。')
          } catch (error) {
            setStatus(error instanceof Error ? error.message : String(error))
          }
        }}
        onOpenInEditor={async () => {
          if (!draftTarget?.layer) return
          await openInEditor(draftTarget.layer.path)
          setStatus('已在 IDE 打开真实面板源码。')
        }}
        onPromptChange={setPrompt}
        onProviderChange={(value) => {
          setProviderId(value)
          saveStoredValue(providerStorageKey, value)
          setStatus('已切换 Agent。')
        }}
        onProxyChange={setProxy}
        onProxyModeChange={setProxyMode}
        onSelectRun={setSelectedRunId}
        onSubmit={handleSubmit}
        prompt={prompt}
        providerId={provider?.id || providerId}
        providers={config.providers}
        proxy={proxy}
        proxyMode={proxyMode}
        runCount={runs.length}
        runs={runs}
        selectedRunId={selectedRunId}
        status={status}
        submitting={submitting}
        targetLabel={targetLabel}
        targetTitle={targetTitle}
      />
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
