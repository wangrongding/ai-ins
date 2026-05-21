import { type KeyboardEvent as ReactKeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { arrowDownIcon, checkIcon, codeIcon, copyIcon, Icon, IconButton, maximizeIcon, minimizeIcon, moonIcon, sunIcon } from './icons'
import type { AgentProvider, AgentRun, ProxyMode } from './types'

const promptDraftStorageKey = 'ai-ins-panel-prompt-draft'
const panelThemeStorageKey = 'ai-ins-panel-theme'
const panelSubmitShortcutStorageKey = 'ai-ins-panel-submit-shortcut'
const outputAutoScrollThreshold = 32
type PanelTheme = 'dark' | 'light'
type PanelSubmitShortcut = 'enter' | 'modifier-enter'

function readPanelPromptDraft() {
  try {
    return window.sessionStorage.getItem(promptDraftStorageKey) || ''
  } catch {
    return ''
  }
}

function savePanelPromptDraft(value: string) {
  try {
    if (value) {
      window.sessionStorage.setItem(promptDraftStorageKey, value)
    } else {
      window.sessionStorage.removeItem(promptDraftStorageKey)
    }
  } catch {
    // Ignore storage restrictions in embedded browsers.
  }
}

export function clearPanelPromptDraft() {
  savePanelPromptDraft('')
}

function readPanelStoredTheme() {
  try {
    const value = window.localStorage.getItem(panelThemeStorageKey)
    return value === 'dark' || value === 'light' ? value : ''
  } catch {
    return ''
  }
}

function readPanelTheme(): PanelTheme {
  return readPanelStoredTheme() || 'dark'
}

function savePanelTheme(value: PanelTheme) {
  try {
    window.localStorage.setItem(panelThemeStorageKey, value)
  } catch {
    // Ignore storage restrictions in embedded browsers.
  }
}

function readPanelStoredSubmitShortcut() {
  try {
    const value = window.localStorage.getItem(panelSubmitShortcutStorageKey)
    if (value === 'modifier-enter' || value === 'enter') {
      return value
    }
    if (value === 'platform') {
      return 'modifier-enter'
    }
    if (value === 'shift-enter') {
      return 'enter'
    }
    return ''
  } catch {
    return ''
  }
}

function readPanelSubmitShortcut(): PanelSubmitShortcut {
  return readPanelStoredSubmitShortcut() || 'modifier-enter'
}

function savePanelSubmitShortcut(value: PanelSubmitShortcut) {
  try {
    window.localStorage.setItem(panelSubmitShortcutStorageKey, value)
  } catch {
    // Ignore storage restrictions in embedded browsers.
  }
}

function panelIsMacPlatform() {
  try {
    const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform || navigator.platform || ''
    return /mac|iphone|ipad|ipod/i.test(platform)
  } catch {
    return false
  }
}

function panelGetModifierSubmitShortcutLabel(macPlatform: boolean) {
  return macPlatform ? '⌘ + Enter' : 'Ctrl + Enter'
}

function panelGetEnterShortcutLabel() {
  return 'Enter'
}

export function getPanelDefaultSubmitShortcutLabel() {
  return panelGetModifierSubmitShortcutLabel(panelIsMacPlatform())
}

function panelMatchesSubmitShortcut(
  event: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'key' | 'metaKey' | 'shiftKey'>,
  submitShortcut: PanelSubmitShortcut,
  macPlatform: boolean,
) {
  if (event.key !== 'Enter' || event.altKey) {
    return false
  }

  if (submitShortcut === 'enter') {
    return !event.shiftKey && !event.ctrlKey && !event.metaKey
  }

  if (macPlatform) {
    return event.metaKey && !event.ctrlKey && !event.shiftKey
  }

  return event.ctrlKey && !event.metaKey && !event.shiftKey
}

type PanelViewProps = {
  defaultProxy: string
  providers: AgentProvider[]
  providerId: string
  proxy: string
  proxyMode: ProxyMode
  prompt: string
  runCount: number
  runs: AgentRun[]
  selectedRunId?: string
  status: string
  submitting: boolean
  targetLabel: string
  targetTitle: string
  onClose: () => void
  onCopyTarget: () => Promise<void>
  onDeleteRun: (run: AgentRun) => void
  onOpenInEditor: () => Promise<void>
  onPromptChange: (value: string) => void
  onProviderChange: (value: string) => void
  onProxyChange: (value: string) => void
  onProxyModeChange: (value: ProxyMode) => void
  onSelectRun: (runId: string) => void
  onSubmit: () => Promise<void>
}

const proxyModeOptions: Array<{ label: string; value: ProxyMode }> = [
  { label: '关闭', value: 'off' },
  { label: '系统', value: 'system' },
  { label: '自定义', value: 'custom' },
]

function panelGetRunStatusLabel(status: string) {
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

function panelIsRunWorking(run: AgentRun) {
  return run.status === 'starting' || run.status === 'running'
}

function panelGetRunWorkStatus(run: AgentRun) {
  if (run.status === 'starting') return `${run.providerLabel} 正在启动，马上开始处理这块代码`
  if (run.status === 'running') return run.statusMessage || `${run.providerLabel} 正在分析代码和整理改动`
  if (run.status === 'done') return `${run.providerLabel} 已完成`
  if (run.status === 'failed') return run.statusMessage || `${run.providerLabel} 执行失败`
  if (run.status === 'disconnected') return '进度连接断开，可以继续查看日志或刷新重连'
  return '等待任务输出'
}

function panelGetRunTitle(run: AgentRun, getDisplayPath: (path: string) => string) {
  return run.sourceName || getDisplayPath(run.sourcePath || '')
}

function panelFormatRunTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function panelIsOutputNearBottom(output: HTMLElement) {
  return output.scrollHeight - output.scrollTop - output.clientHeight <= outputAutoScrollThreshold
}

function panelScrollOutputToBottom(output: HTMLElement) {
  output.scrollTop = output.scrollHeight
}

type PanelOutputBlock =
  | { type: 'code'; content: string; language: string }
  | { type: 'heading'; level: number; text: string }
  | { type: 'hr' }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'paragraph'; lines: string[] }
  | { type: 'quote'; lines: string[] }

type PanelOutputDiagnostic = {
  count: number
  message: string
}

function panelIsOutputBlockStart(line: string) {
  return /^```/.test(line) || /^(#{1,3})\s+/.test(line) || /^>\s?/.test(line) || /^\s*(?:[-*+]|\d+[.)])\s+/.test(line) || /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)
}

function panelTrimDiagnosticLine(value: string) {
  return value
    .replace(/<script\b[^>]*>[\s\S]*$/iu, '<script>...</script>')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/giu, '<svg>...</svg>')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 260)
}

function panelDescribeDiagnostic(value: string) {
  const message = panelTrimDiagnosticLine(value)

  if (/state db discrepancy during find_thread_path_by_id_str_in_subdir/iu.test(message)) {
    return {
      key: 'codex-state-db-fallback',
      message: 'Codex 状态索引不一致，已回退到文件查找。',
    }
  }

  if (/failed to warm featured plugin ids cache|backend-api\/plugins\/featured|__cf_chl|Cloudflare|403 Forbidden/iu.test(message)) {
    return {
      key: 'codex-plugin-sync-403',
      message: 'Codex 插件列表预热失败：chatgpt.com 返回 403 / Cloudflare challenge。',
    }
  }

  const manifestWarning = message.match(/WARN\s+codex_core_plugins::manifest:\s+ignoring\s+(.+?)(?:\s+path=|$)/iu)
  if (manifestWarning) {
    return {
      key: `plugin-manifest-${manifestWarning[1]}`,
      message: `插件 manifest 警告：${manifestWarning[1]}`,
    }
  }

  const skillWarning = message.match(/WARN\s+codex_core_skills::loader:\s+ignoring\s+(.+?)(?:\s+path=|$)/iu)
  if (skillWarning) {
    return {
      key: `skill-loader-${skillWarning[1]}`,
      message: `Skill 加载警告：${skillWarning[1]}`,
    }
  }

  const analyticsWarning = message.match(/WARN\s+codex_analytics::client:\s+(.+)$/iu)
  if (analyticsWarning) {
    return {
      key: `analytics-${analyticsWarning[1]}`,
      message: `分析事件上报警告：${analyticsWarning[1]}`,
    }
  }

  return {
    key: message || value,
    message,
  }
}

function panelAddDiagnostic(diagnostics: Map<string, PanelOutputDiagnostic>, value: string) {
  const diagnostic = panelDescribeDiagnostic(value)
  const existing = diagnostics.get(diagnostic.key)
  if (existing) {
    existing.count += 1
    return
  }

  diagnostics.set(diagnostic.key, {
    count: 1,
    message: diagnostic.message,
  })
}

function panelIsMachineEvent(line: string) {
  return /^\[(?:thread|turn)\.[^\]]+\]/u.test(line)
}

function panelIsOutputBoundaryLine(line: string) {
  return /^\[[^\]]+\]/u.test(line) || /^\d{4}-\d{2}-\d{2}T[^\s]+\s+(?:WARN|ERROR)\s+/u.test(line)
}

function panelIsCommandEvent(line: string) {
  const itemMatch = line.match(/^\[item\.(?:started|completed)\]\s+(.+)$/u)
  if (!itemMatch) {
    return false
  }

  return /^\/(?:bin|usr)\//u.test(itemMatch[1]) || /\s-lc\s/u.test(itemMatch[1])
}

function panelFormatOutputForDisplay(value: string) {
  const lines = value.replace(/\r\n?/g, '\n').split('\n')
  const visibleLines: string[] = []
  const diagnostics = new Map<string, PanelOutputDiagnostic>()
  let skippingHtmlDiagnostic = false

  for (const line of lines) {
    if (skippingHtmlDiagnostic) {
      if (!panelIsOutputBoundaryLine(line)) {
        continue
      }

      skippingHtmlDiagnostic = false
    }

    if (line.startsWith('[stderr] ')) {
      panelAddDiagnostic(diagnostics, line.slice('[stderr] '.length))
      if (/failed to warm featured plugin ids cache|<html|__cf_chl|Cloudflare|403 Forbidden/iu.test(line)) {
        skippingHtmlDiagnostic = true
      }
      continue
    }

    if (/^\d{4}-\d{2}-\d{2}T[^\s]+\s+(?:WARN|ERROR)\s+/u.test(line)) {
      panelAddDiagnostic(diagnostics, line)
      continue
    }

    if (panelIsMachineEvent(line) || panelIsCommandEvent(line)) {
      panelAddDiagnostic(diagnostics, line)
      continue
    }

    const itemMessage = line.match(/^\[item\.completed\]\s+(.+)$/u)
    if (itemMessage) {
      visibleLines.push(itemMessage[1])
      continue
    }

    if (line.startsWith('日志：')) {
      visibleLines.push(`日志：\`${line.slice('日志：'.length).trim()}\``)
      continue
    }

    visibleLines.push(line)
  }

  const markdown = visibleLines.join('\n').trim() || (diagnostics.size ? '暂无可展示的回复，已折叠启动诊断日志。' : '等待输出...')
  return { diagnostics: Array.from(diagnostics.values()), markdown }
}

function panelParseOutputBlocks(value: string): PanelOutputBlock[] {
  const lines = value.replace(/\r\n?/g, '\n').split('\n')
  const blocks: PanelOutputBlock[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]

    if (!line.trim()) {
      index += 1
      continue
    }

    const fenceMatch = line.match(/^```(\S*)\s*$/)
    if (fenceMatch) {
      const codeLines: string[] = []
      index += 1
      while (index < lines.length && !/^```\s*$/.test(lines[index])) {
        codeLines.push(lines[index])
        index += 1
      }
      if (index < lines.length) index += 1
      blocks.push({ type: 'code', content: codeLines.join('\n'), language: fenceMatch[1] || '' })
      continue
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/)
    if (headingMatch) {
      blocks.push({ type: 'heading', level: headingMatch[1].length, text: headingMatch[2] })
      index += 1
      continue
    }

    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push({ type: 'hr' })
      index += 1
      continue
    }

    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = []
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^>\s?/, ''))
        index += 1
      }
      blocks.push({ type: 'quote', lines: quoteLines })
      continue
    }

    const listMatch = line.match(/^\s*((?:[-*+])|(?:\d+[.)]))\s+(.+)$/)
    if (listMatch) {
      const ordered = /\d/.test(listMatch[1])
      const items: string[] = []
      while (index < lines.length) {
        const itemMatch = lines[index].match(/^\s*((?:[-*+])|(?:\d+[.)]))\s+(.+)$/)
        if (!itemMatch || /\d/.test(itemMatch[1]) !== ordered) break
        items.push(itemMatch[2])
        index += 1
      }
      blocks.push({ type: 'list', ordered, items })
      continue
    }

    const paragraphLines: string[] = []
    while (index < lines.length && lines[index].trim() && !panelIsOutputBlockStart(lines[index])) {
      paragraphLines.push(lines[index])
      index += 1
    }
    blocks.push({ type: 'paragraph', lines: paragraphLines.length ? paragraphLines : [line] })
    if (!paragraphLines.length) index += 1
  }

  return blocks.length ? blocks : [{ type: 'paragraph', lines: ['等待输出...'] }]
}

function panelRenderInline(value: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const pattern = /(\[[^\]]+\]\(https?:\/\/[^)\s]+\)|`[^`]+`|\*\*[^*]+\*\*)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(value))) {
    if (match.index > lastIndex) {
      nodes.push(value.slice(lastIndex, match.index))
    }

    const token = match[0]
    if (token.startsWith('`')) {
      nodes.push(<code key={`${match.index}-code`}>{token.slice(1, -1)}</code>)
    } else if (token.startsWith('**')) {
      nodes.push(<strong key={`${match.index}-strong`}>{token.slice(2, -2)}</strong>)
    } else {
      const linkMatch = token.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/)
      if (linkMatch) {
        nodes.push(
          <a href={linkMatch[2]} key={`${match.index}-link`} rel="noreferrer" target="_blank">
            {linkMatch[1]}
          </a>,
        )
      } else {
        nodes.push(token)
      }
    }

    lastIndex = pattern.lastIndex
  }

  if (lastIndex < value.length) {
    nodes.push(value.slice(lastIndex))
  }

  return nodes
}

function PanelOutputMarkdown({ value }: { value: string }) {
  const blocks = useMemo(() => panelParseOutputBlocks(value), [value])

  return (
    <div className="wbx-ai-ins-output-markdown">
      {blocks.map((block, index) => {
        if (block.type === 'code') {
          return (
            <div className="wbx-ai-ins-output-code-block" key={index}>
              {block.language ? <div className="wbx-ai-ins-output-code-language">{block.language}</div> : null}
              <pre>
                <code>{block.content || ' '}</code>
              </pre>
            </div>
          )
        }

        if (block.type === 'heading') {
          const Heading = `h${Math.min(block.level + 2, 5)}` as 'h3' | 'h4' | 'h5'
          return <Heading key={index}>{panelRenderInline(block.text)}</Heading>
        }

        if (block.type === 'hr') {
          return <hr key={index} />
        }

        if (block.type === 'list') {
          const List = block.ordered ? 'ol' : 'ul'
          return (
            <List key={index}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{panelRenderInline(item)}</li>
              ))}
            </List>
          )
        }

        if (block.type === 'quote') {
          return (
            <blockquote key={index}>
              {block.lines.map((quoteLine, quoteIndex) => (
                <p key={quoteIndex}>{panelRenderInline(quoteLine)}</p>
              ))}
            </blockquote>
          )
        }

        return (
          <p key={index}>
            {block.lines.map((paragraphLine, lineIndex) => (
              <span key={lineIndex}>
                {lineIndex ? <br /> : null}
                {panelRenderInline(paragraphLine)}
              </span>
            ))}
          </p>
        )
      })}
    </div>
  )
}

function PanelOutputViewer({ value }: { value: string }) {
  const displayOutput = useMemo(() => panelFormatOutputForDisplay(value), [value])
  const hiddenLogCount = displayOutput.diagnostics.reduce((total, diagnostic) => total + diagnostic.count, 0)

  return (
    <>
      <PanelOutputMarkdown value={displayOutput.markdown} />
      {displayOutput.diagnostics.length ? (
        <details className="wbx-ai-ins-output-diagnostics">
          <summary>已折叠 {hiddenLogCount} 条诊断日志</summary>
          <ul>
            {displayOutput.diagnostics.map((diagnostic, index) => (
              <li key={index}>
                <span>{diagnostic.message}</span>
                {diagnostic.count > 1 ? <span className="wbx-ai-ins-output-diagnostic-count">×{diagnostic.count}</span> : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </>
  )
}

function PanelLoadingSpinner() {
  return (
    <svg aria-hidden="true" className="wbx-ai-ins-output-state-spinner" fill="none" viewBox="0 0 24 24">
      <circle cx="12" cy="12" opacity="0.22" r="8.5" stroke="currentColor" strokeWidth="3" />
      <path d="M20.5 12a8.5 8.5 0 0 0-8.5-8.5" stroke="currentColor" strokeLinecap="round" strokeWidth="3.2" />
      <path d="M17.4 5.9a8.5 8.5 0 0 1 2.7 4.1" opacity="0.62" stroke="#bfdbfe" strokeLinecap="round" strokeWidth="3.2" />
    </svg>
  )
}

export function PanelView(props: PanelViewProps & { getDisplayPath: (path: string) => string }) {
  const {
    defaultProxy,
    getDisplayPath,
    onClose,
    onCopyTarget,
    onDeleteRun,
    onOpenInEditor,
    onPromptChange,
    onProviderChange,
    onProxyChange,
    onProxyModeChange,
    onSelectRun,
    onSubmit,
    prompt,
    providerId,
    providers,
    proxy,
    proxyMode,
    runCount,
    runs,
    selectedRunId,
    status,
    submitting,
    targetLabel,
    targetTitle,
  } = props
  const [copied, setCopied] = useState(false)
  const [agentPromptExpanded, setAgentPromptExpanded] = useState(false)
  const [outputDetachedFromBottom, setOutputDetachedFromBottom] = useState(false)
  const [outputExpanded, setOutputExpanded] = useState(false)
  const [outputModalDetachedFromBottom, setOutputModalDetachedFromBottom] = useState(false)
  const [theme, setTheme] = useState<PanelTheme>(() => readPanelTheme())
  const [submitShortcut, setSubmitShortcut] = useState<PanelSubmitShortcut>(() => readPanelSubmitShortcut())
  const promptHydratedRef = useRef(false)
  const outputShouldFollowRef = useRef(true)
  const outputModalShouldFollowRef = useRef(true)
  const agentPromptModalRef = useRef<HTMLDivElement>(null)
  const outputRef = useRef<HTMLDivElement>(null)
  const outputModalRef = useRef<HTMLDivElement>(null)
  const selectedRun = useMemo(() => {
    if (!selectedRunId) {
      return undefined
    }

    return runs.find((run) => run.id === selectedRunId)
  }, [runs, selectedRunId])
  const provider = providers.find((candidate) => candidate.id === providerId) || providers.find((candidate) => candidate.enabled) || providers[0]
  const enabledProviderCount = providers.filter((candidate) => candidate.enabled).length
  const providerSwitchHint =
    enabledProviderCount > 1 ? `多 Agent · ${enabledProviderCount}/${providers.length}` : provider?.enabled ? '单 Agent' : '待配置'
  const providerSwitchTitle = providers.length
    ? `已接入 ${providers.map((candidate) => `${candidate.label}${candidate.enabled ? '' : '（未配置）'}`).join(' / ')}。切换只影响下一次提交。`
    : '还没有可用 Agent。'
  const hasTarget = Boolean(targetTitle)
  const customProxyMissing = proxyMode === 'custom' && !proxy.trim()
  const submitDisabled = submitting || !hasTarget || !provider?.enabled || customProxyMissing
  const selectedRunOutput = selectedRun ? selectedRun.output || selectedRun.statusMessage || '等待输出...' : ''
  const selectedRunLogLabel = selectedRun?.logPath ? getDisplayPath(selectedRun.logPath) : '.ai-ins/<run-id>.log'
  const selectedRunAgentPrompt = selectedRun?.agentPrompt?.trim() || ''
  const selectedRunScrollId = selectedRun?.id
  const lightTheme = theme === 'light'
  const macPlatform = useMemo(() => panelIsMacPlatform(), [])
  const modifierSubmitShortcutLabel = useMemo(() => panelGetModifierSubmitShortcutLabel(macPlatform), [macPlatform])
  const submitShortcutOptions = useMemo<Array<{ label: string; value: PanelSubmitShortcut }>>(
    () => [
      { label: modifierSubmitShortcutLabel, value: 'modifier-enter' },
      { label: panelGetEnterShortcutLabel(), value: 'enter' },
    ],
    [modifierSubmitShortcutLabel],
  )
  const submitShortcutLabel =
    submitShortcut === 'modifier-enter' ? modifierSubmitShortcutLabel : panelGetEnterShortcutLabel()

  useEffect(() => {
    outputShouldFollowRef.current = true
    outputModalShouldFollowRef.current = true
    setOutputDetachedFromBottom(false)
    setOutputModalDetachedFromBottom(false)

    if (outputRef.current) {
      panelScrollOutputToBottom(outputRef.current)
    }
    if (outputModalRef.current) {
      panelScrollOutputToBottom(outputModalRef.current)
    }
  }, [selectedRunScrollId])

  useEffect(() => {
    const output = outputRef.current
    if (!output) return

    if (outputShouldFollowRef.current) {
      panelScrollOutputToBottom(output)
      setOutputDetachedFromBottom(false)
      return
    }

    setOutputDetachedFromBottom(!panelIsOutputNearBottom(output))
  }, [selectedRunOutput])

  useEffect(() => {
    if (!selectedRun) {
      setAgentPromptExpanded(false)
      setOutputExpanded(false)
    }
  }, [selectedRun])

  useEffect(() => {
    if (agentPromptExpanded) {
      agentPromptModalRef.current?.focus()
    }
  }, [agentPromptExpanded])

  useEffect(() => {
    if (outputExpanded) {
      const modalOutput = outputModalRef.current
      if (!modalOutput) return

      modalOutput.focus()
      outputModalShouldFollowRef.current = outputShouldFollowRef.current
      if (outputModalShouldFollowRef.current) {
        panelScrollOutputToBottom(modalOutput)
        setOutputModalDetachedFromBottom(false)
        return
      }

      const inlineOutput = outputRef.current
      if (inlineOutput) {
        modalOutput.scrollTop = Math.min(inlineOutput.scrollTop, Math.max(0, modalOutput.scrollHeight - modalOutput.clientHeight))
      }

      setOutputModalDetachedFromBottom(!panelIsOutputNearBottom(modalOutput))
    }
  }, [outputExpanded, selectedRunScrollId])

  useEffect(() => {
    const output = outputModalRef.current
    if (!outputExpanded || !output) return

    if (outputModalShouldFollowRef.current) {
      panelScrollOutputToBottom(output)
      setOutputModalDetachedFromBottom(false)
      return
    }

    setOutputModalDetachedFromBottom(!panelIsOutputNearBottom(output))
  }, [outputExpanded, selectedRunOutput])

  useEffect(() => {
    if (promptHydratedRef.current) {
      return
    }

    promptHydratedRef.current = true
    if (prompt) {
      savePanelPromptDraft(prompt)
      return
    }

    const draftPrompt = readPanelPromptDraft()
    if (draftPrompt) {
      onPromptChange(draftPrompt)
    }
  }, [onPromptChange, prompt])

  async function handleCopyTarget() {
    await onCopyTarget()
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  function handlePromptChange(value: string) {
    savePanelPromptDraft(value)
    onPromptChange(value)
  }

  function handleThemeToggle() {
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark'
      savePanelTheme(next)
      return next
    })
  }

  function handleOutputScroll() {
    const output = outputRef.current
    if (!output) return

    const shouldFollow = panelIsOutputNearBottom(output)
    outputShouldFollowRef.current = shouldFollow
    setOutputDetachedFromBottom(!shouldFollow)
  }

  function handleOutputModalScroll() {
    const output = outputModalRef.current
    if (!output) return

    const shouldFollow = panelIsOutputNearBottom(output)
    outputModalShouldFollowRef.current = shouldFollow
    setOutputModalDetachedFromBottom(!shouldFollow)
  }

  function handleFollowOutputBottom(expanded: boolean) {
    const output = expanded ? outputModalRef.current : outputRef.current
    if (!output) return

    if (expanded) {
      outputModalShouldFollowRef.current = true
      setOutputModalDetachedFromBottom(false)
    } else {
      outputShouldFollowRef.current = true
      setOutputDetachedFromBottom(false)
    }

    panelScrollOutputToBottom(output)
  }

  function getProxyModeHint() {
    if (proxyMode === 'custom') return proxy.trim() ? '自定义' : '需填写'
    if (proxyMode === 'system') return defaultProxy ? '已检测' : '未检测'
    return '关闭'
  }

  function getProxyInputValue() {
    if (proxyMode === 'system') return defaultProxy
    if (proxyMode === 'custom') return proxy
    return ''
  }

  function getProxyInputPlaceholder() {
    if (proxyMode === 'custom') return 'http://127.0.0.1:7890'
    if (proxyMode === 'system') return '未检测到系统/默认代理'
    return '不为 Agent 设置代理'
  }

  function handleSubmitShortcutChange(value: PanelSubmitShortcut) {
    setSubmitShortcut(value)
    savePanelSubmitShortcut(value)
  }

  function handlePromptKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing || submitDisabled || submitting) {
      return
    }

    if (!panelMatchesSubmitShortcut(event, submitShortcut, macPlatform)) {
      return
    }

    event.preventDefault()
    void onSubmit()
  }

  return (
    <div className="wbx-ai-ins-panel" data-theme={theme}>
      <div className="wbx-ai-ins-header">
        <div className="wbx-ai-ins-heading">
          <span className="wbx-ai-ins-brand-mark" aria-hidden="true">
            <span className="wbx-ai-ins-brand-spark" />
          </span>
          <div className="wbx-ai-ins-heading-copy">
            <div className="wbx-ai-ins-title-row">
              <p className="wbx-ai-ins-title">AI Ins</p>
              <span className="wbx-ai-ins-title-badge">DOM Pilot</span>
            </div>
            <div className="wbx-ai-ins-subtitle">Option 选 DOM；左侧任务只切换输出，每次提交仍是新会话</div>
          </div>
        </div>
        <div className="wbx-ai-ins-header-actions">
          <IconButton label={lightTheme ? '切换到暗色' : '切换到亮色'} onClick={handleThemeToggle}>
            <Icon paths={lightTheme ? moonIcon : sunIcon} />
          </IconButton>
          <button className="wbx-ai-ins-button" onClick={onClose} type="button">
            收起
          </button>
        </div>
      </div>

      <div className="wbx-ai-ins-body">
        <aside className="wbx-ai-ins-sidebar">
          <div className="wbx-ai-ins-sidebar-top">
            <p className="wbx-ai-ins-section-label">任务列表</p>
            <span className="wbx-ai-ins-count">{runCount}</span>
          </div>
          <div className="wbx-ai-ins-list">
            {runs.length ? (
              runs.map((run) => (
                <button
                  className={`wbx-ai-ins-run${selectedRun?.id === run.id ? ' wbx-ai-ins-run-active' : ''}`}
                  key={run.id}
                  onClick={() => onSelectRun(run.id)}
                  type="button"
                >
                  <div className="wbx-ai-ins-run-top">
                    <span className={`wbx-ai-ins-dot wbx-ai-ins-dot-${run.status}`} />
                    <span className="wbx-ai-ins-run-title">{panelGetRunTitle(run, getDisplayPath)}</span>
                    <span className="wbx-ai-ins-run-provider">{run.providerLabel}</span>
                  </div>
                  <div className="wbx-ai-ins-run-prompt">{run.prompt}</div>
                  <div className="wbx-ai-ins-run-meta">
                    {panelGetRunStatusLabel(run.status)} · {panelFormatRunTime(run.createdAt)}
                  </div>
                </button>
              ))
            ) : (
              <div className="wbx-ai-ins-detail-empty">还没有任务</div>
            )}
          </div>
        </aside>

        <main className="wbx-ai-ins-main">
          <form
            className="wbx-ai-ins-composer"
            onSubmit={(event) => {
              event.preventDefault()
              void onSubmit()
            }}
          >
            <div className="wbx-ai-ins-target" title={targetTitle}>
              <span className="wbx-ai-ins-target-text">{targetLabel}</span>
              <span className="wbx-ai-ins-target-actions">
                <IconButton disabled={!hasTarget} label={copied ? '已复制' : '复制源码位置'} onClick={() => void handleCopyTarget()} success={copied}>
                  <Icon paths={copied ? checkIcon : copyIcon} />
                </IconButton>
                <IconButton disabled={!hasTarget} label="IDE 打开" onClick={() => void onOpenInEditor()}>
                  <Icon paths={codeIcon} />
                </IconButton>
              </span>
            </div>
            <div className="wbx-ai-ins-form-grid">
              <div className="wbx-ai-ins-field wbx-ai-ins-proxy-field">
                <span className="wbx-ai-ins-label">
                  <span>Network Proxy</span>
                  <span className="wbx-ai-ins-label-hint">{getProxyModeHint()}</span>
                </span>
                <div className="wbx-ai-ins-proxy-mode" role="radiogroup" aria-label="Network Proxy">
                  {proxyModeOptions.map((option) => (
                    <label className="wbx-ai-ins-proxy-option" key={option.value}>
                      <input
                        checked={proxyMode === option.value}
                        name="wbx-ai-ins-proxy-mode"
                        onChange={() => onProxyModeChange(option.value)}
                        type="radio"
                        value={option.value}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
                <input
                  className="wbx-ai-ins-input wbx-ai-ins-proxy-input"
                  disabled={proxyMode !== 'custom'}
                  onChange={(event) => onProxyChange(event.target.value)}
                  placeholder={getProxyInputPlaceholder()}
                  required={proxyMode === 'custom'}
                  type="url"
                  value={getProxyInputValue()}
                />
              </div>
              <label className="wbx-ai-ins-field">
                <span className="wbx-ai-ins-label">
                  <span>发送快捷键</span>
                  <span className="wbx-ai-ins-label-hint">{submitShortcutLabel}</span>
                </span>
                <select className="wbx-ai-ins-select" onChange={(event) => handleSubmitShortcutChange(event.target.value as PanelSubmitShortcut)} value={submitShortcut}>
                  {submitShortcutOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="wbx-ai-ins-field">
                <span className="wbx-ai-ins-label">
                  <span>Agent</span>
                  <span className="wbx-ai-ins-label-hint" title={providerSwitchTitle}>
                    {providerSwitchHint}
                  </span>
                </span>
                <select
                  className="wbx-ai-ins-select"
                  onChange={(event) => onProviderChange(event.target.value)}
                  title={providerSwitchTitle}
                  value={provider?.id || providerId}
                >
                  {providers.map((candidate) => (
                    <option disabled={!candidate.enabled} key={candidate.id} value={candidate.id}>
                      {candidate.label}
                      {candidate.enabled ? '' : '（未配置）'}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <textarea
              className="wbx-ai-ins-textarea"
              onChange={(event) => handlePromptChange(event.target.value)}
              onKeyDown={handlePromptKeyDown}
              placeholder="描述你想怎么改这个 DOM / 组件；新任务默认不带历史记录，如需延续上一轮，请把结论贴进来。"
              value={prompt}
            />

            <div className="wbx-ai-ins-footer">
              <div className="wbx-ai-ins-status">{status}</div>
              <div className="wbx-ai-ins-actions">
                <button className="wbx-ai-ins-button wbx-ai-ins-button-primary" disabled={submitDisabled} type="submit">
                  {submitting ? '启动中' : `交给 ${provider?.label || 'Agent'} · ${submitShortcutLabel}`}
                </button>
              </div>
            </div>
          </form>

          <section className="wbx-ai-ins-detail">
            {!selectedRun ? (
              <div className="wbx-ai-ins-detail-empty">
                {runs.length ? '点击左侧任务查看输出；提交新任务仍是新会话，不会自动延续它的上下文。' : '还没有任务'}
              </div>
            ) : (
              <div className="wbx-ai-ins-detail-content">
                <div className="wbx-ai-ins-detail-head">
                  <div>
                    <p className="wbx-ai-ins-detail-title">{panelGetRunTitle(selectedRun, getDisplayPath)}</p>
                    <div className="wbx-ai-ins-detail-subtitle">{selectedRun.providerLabel}</div>
                  </div>
                  <div className="wbx-ai-ins-detail-actions">
                    <span className="wbx-ai-ins-pill">{panelGetRunStatusLabel(selectedRun.status)}</span>
                    <button className="wbx-ai-ins-button wbx-ai-ins-button-danger" onClick={() => onDeleteRun(selectedRun)} type="button">
                      {selectedRun.completed ? '删除' : '停止并删除'}
                    </button>
                  </div>
                </div>
                <div className="wbx-ai-ins-prompt">
                  <span className="wbx-ai-ins-prompt-text">{selectedRun.prompt}</span>
                  <button
                    className="wbx-ai-ins-button"
                    onClick={() => {
                      setOutputExpanded(false)
                      setAgentPromptExpanded(true)
                    }}
                    type="button"
                  >
                    查看详情
                  </button>
                </div>
                <div className={`wbx-ai-ins-output-wrap wbx-ai-ins-output-wrap-${panelIsRunWorking(selectedRun) ? 'active' : selectedRun.status}`}>
                  <div className="wbx-ai-ins-output-toolbar">
                    <div className="wbx-ai-ins-output-title">
                      <span>Output</span>
                      <span className="wbx-ai-ins-output-format">Markdown</span>
                    </div>
                    <IconButton
                      label="放大输出"
                      onClick={() => {
                        setAgentPromptExpanded(false)
                        setOutputExpanded(true)
                      }}
                    >
                      <Icon paths={maximizeIcon} />
                    </IconButton>
                  </div>
                  <div
                    className={`wbx-ai-ins-output${selectedRun.status === 'failed' ? ' wbx-ai-ins-output-error' : ''}`}
                    onDoubleClick={() => {
                      setAgentPromptExpanded(false)
                      setOutputExpanded(true)
                    }}
                    onScroll={handleOutputScroll}
                    ref={outputRef}
                  >
                    <PanelOutputViewer value={selectedRunOutput} />
                  </div>
                  {outputDetachedFromBottom ? (
                    <button className="wbx-ai-ins-output-follow" onClick={() => handleFollowOutputBottom(false)} type="button">
                      <Icon paths={arrowDownIcon} />
                      <span>查看最新</span>
                    </button>
                  ) : null}
                  <div className={`wbx-ai-ins-output-state wbx-ai-ins-output-state-${panelIsRunWorking(selectedRun) ? 'active' : selectedRun.status}`}>
                    <span className="wbx-ai-ins-output-state-dot" />
                    <span className="wbx-ai-ins-output-state-text">{panelGetRunWorkStatus(selectedRun)}</span>
                    {panelIsRunWorking(selectedRun) ? <PanelLoadingSpinner /> : null}
                  </div>
                </div>
              </div>
            )}
          </section>
        </main>
      </div>
      {selectedRun && agentPromptExpanded ? (
        <div className="wbx-ai-ins-output-modal" onClick={() => setAgentPromptExpanded(false)}>
          <div
            aria-label={`查看发送给 ${selectedRun.providerLabel} 的完整 prompt`}
            aria-modal="true"
            className="wbx-ai-ins-output-modal-panel wbx-ai-ins-agent-prompt-modal-panel"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation()
                setAgentPromptExpanded(false)
              }
            }}
            ref={agentPromptModalRef}
            role="dialog"
            tabIndex={-1}
          >
            <div className="wbx-ai-ins-output-modal-head">
              <div>
                <p className="wbx-ai-ins-output-modal-title">发送给 {selectedRun.providerLabel} 的完整 prompt</p>
                <div className="wbx-ai-ins-output-modal-subtitle">{panelGetRunTitle(selectedRun, getDisplayPath)}</div>
              </div>
              <div className="wbx-ai-ins-detail-actions">
                <button className="wbx-ai-ins-button" onClick={() => setAgentPromptExpanded(false)} type="button">
                  关闭
                </button>
              </div>
            </div>
            <div className="wbx-ai-ins-agent-prompt wbx-ai-ins-agent-prompt-modal">
              <p>
                {selectedRunAgentPrompt
                  ? `这里是启动这条任务时真正发送给 ${selectedRun.providerLabel} 的完整 prompt，包含源码位置和 DOM source stack。`
                  : `这条任务创建时还没有记录完整 prompt；请打开日志文件 ${selectedRunLogLabel} 检查启动命令和 prompt 正文。`}
              </p>
              <div className="wbx-ai-ins-output-code-block wbx-ai-ins-agent-prompt-code-block">
                <pre>
                  <code>{selectedRunAgentPrompt || `日志文件：${selectedRunLogLabel}`}</code>
                </pre>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {selectedRun && outputExpanded ? (
        <div className="wbx-ai-ins-output-modal" onClick={() => setOutputExpanded(false)}>
          <div
            aria-label="放大输出"
            aria-modal="true"
            className="wbx-ai-ins-output-modal-panel"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation()
                setOutputExpanded(false)
              }
            }}
            role="dialog"
          >
            <div className="wbx-ai-ins-output-modal-head">
              <div>
                <p className="wbx-ai-ins-output-modal-title">{panelGetRunTitle(selectedRun, getDisplayPath)}</p>
                <div className="wbx-ai-ins-output-modal-subtitle">{selectedRun.providerLabel} output</div>
              </div>
              <div className="wbx-ai-ins-detail-actions">
                <span className="wbx-ai-ins-pill">{panelGetRunStatusLabel(selectedRun.status)}</span>
                <IconButton label="收起输出" onClick={() => setOutputExpanded(false)}>
                  <Icon paths={minimizeIcon} />
                </IconButton>
              </div>
            </div>
            <div className={`wbx-ai-ins-output wbx-ai-ins-output-expanded${selectedRun.status === 'failed' ? ' wbx-ai-ins-output-error' : ''}`} onScroll={handleOutputModalScroll} ref={outputModalRef} tabIndex={-1}>
              <PanelOutputViewer value={selectedRunOutput} />
            </div>
            {outputModalDetachedFromBottom ? (
              <button className="wbx-ai-ins-output-follow wbx-ai-ins-output-follow-expanded" onClick={() => handleFollowOutputBottom(true)} type="button">
                <Icon paths={arrowDownIcon} />
                <span>查看最新</span>
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
