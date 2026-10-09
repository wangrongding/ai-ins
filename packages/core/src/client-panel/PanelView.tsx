import { type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  arrowDownIcon,
  checkIcon,
  chevronDownIcon,
  chevronRightIcon,
  closeIcon,
  codeIcon,
  copyIcon,
  externalLinkIcon,
  globeIcon,
  helpIcon,
  Icon,
  IconButton,
  maximizeIcon,
  minimizeIcon,
  pinIcon,
  pinOffIcon,
  moonIcon,
  minusIcon,
  plusIcon,
  refreshIcon,
  searchIcon,
  slidersIcon,
  sunIcon,
  trashIcon,
} from './icons'
import { detectBrowserLocale, getLocale, isMessageKey, type Locale, type LocalePreference, localeNames, locales, t } from './i18n'
import { FileDiff, type FileDiffData } from './FileDiff'
import { MarkdownView } from './markdown'
import { getNotifySupport, type NotifySupport, readNotifyEnabled, setNotifyEnabled } from './notifications'
import { PanelSelect, usePanelDismiss } from './PanelSelect'
import type {
  AgentProvider,
  AgentRun,
  AgentRunTurn,
  ChangedFile,
  WorkspaceChange,
  WorkspaceChanges,
  PermissionDecision,
  PermissionMode,
  PermissionRequest,
  ProxyMode,
} from './types'

const panelThemeStorageKey = 'ai-ins-panel-theme'
const panelSubmitShortcutStorageKey = 'ai-ins-panel-submit-shortcut'
const outputAutoScrollThreshold = 32
type PanelTheme = 'dark' | 'light'
type PanelSubmitShortcut = 'enter' | 'modifier-enter'

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
    globalThis.aiInsRememberSetting?.(panelThemeStorageKey, value)
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
    globalThis.aiInsRememberSetting?.(panelSubmitShortcutStorageKey, value)
  } catch {
    // Ignore storage restrictions in embedded browsers.
  }
}

type PanelSidebarView = 'changes' | 'runs'

const panelSidebarViewStorageKey = 'ai-ins-sidebar-view'

function readPanelSidebarView(): PanelSidebarView {
  try {
    return window.localStorage.getItem(panelSidebarViewStorageKey) === 'changes' ? 'changes' : 'runs'
  } catch {
    return 'runs'
  }
}

function savePanelSidebarView(value: PanelSidebarView) {
  try {
    window.localStorage.setItem(panelSidebarViewStorageKey, value)
  } catch {
    // Ignore storage restrictions in embedded browsers.
  }
}

/** `src/a/b.ts` → `['b.ts', 'src/a']`. */
/** A file can be listed twice (staged and unstaged); this tells the entries apart. */
function panelChangeKey(file: WorkspaceChange) {
  return `${file.staged ? 'staged' : 'unstaged'}:${file.path}`
}

function panelSplitPath(path: string): [string, string] {
  const index = path.lastIndexOf('/')
  return index === -1 ? [path, ''] : [path.slice(index + 1), path.slice(0, index)]
}

const panelHelpSeenStorageKey = 'ai-ins-help-seen'

function readPanelHelpSeen() {
  try {
    return window.localStorage.getItem(panelHelpSeenStorageKey) === '1'
  } catch {
    return true
  }
}

function savePanelHelpSeen() {
  try {
    window.localStorage.setItem(panelHelpSeenStorageKey, '1')
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
  /** Resolved UI language; passed in so memoized labels re-render on a switch. */
  locale: Locale
  localePreference: LocalePreference
  providers: AgentProvider[]
  providerId: string
  proxy: string
  proxyMode: ProxyMode
  /** Permission level the next turn asks for (the provider may narrow it). */
  permissionMode: PermissionMode
  prompt: string
  /** A follow-up waiting for the open conversation's current turn to end. */
  queuedPrompt?: string
  /**
   * The conversation that was open before an Option / Alt pick started a new
   * one; offered as "continue it with this element instead".
   */
  repointRun?: AgentRun
  /** True when the open conversation's next turn focuses a freshly picked element. */
  repointed: boolean
  runs: AgentRun[]
  /** True until the first history fetch settles. */
  runsLoading: boolean
  /** The open conversation; the next submit continues it. Undefined means a new conversation. */
  selectedRunId?: string
  status: string
  submitting: boolean
  targetLabel: string
  targetTitle: string
  onClearFinishedRuns: () => void
  onCancelQueued: () => void
  onClose: () => void
  onDismissStatus: () => void
  onContinueWithTarget: () => void
  onCopyTarget: () => Promise<void>
  onAnswerPermission: (run: AgentRun, request: PermissionRequest, decision: PermissionDecision) => void
  onDeleteRun: (run: AgentRun) => void
  onLocaleChange: (value: LocalePreference) => void
  onNewConversation: () => void
  onPinRun: (run: AgentRun, pinned: boolean) => void
  onPermissionModeChange: (value: PermissionMode) => void
  onLoadFileDiff: (run: AgentRun, turn: AgentRunTurn, path: string) => Promise<FileDiffData>
  onOpenFile: (path: string) => void
  onOpenInEditor: () => Promise<void>
  onPromptChange: (value: string) => void
  onProviderChange: (value: string) => void
  onProxyChange: (value: string) => void
  onProxyModeChange: (value: ProxyMode) => void
  onRetryTurn: (run: AgentRun, turn: AgentRunTurn) => void
  onSelectRun: (runId: string) => void
  onLoadWorkspaceChanges: () => Promise<WorkspaceChanges>
  onLoadWorkspaceFileDiff: (path: string, staged: boolean) => Promise<FileDiffData>
  onStageFiles: (paths: string[], staged: boolean) => Promise<void>
  onStopRun: (run: AgentRun) => void
  onSubmit: () => void
}

function panelGetProxyModeOptions(): Array<{ label: string; value: ProxyMode }> {
  return [
    { label: t('settings.proxyOff'), value: 'off' },
    { label: t('settings.proxySystem'), value: 'system' },
    { label: t('settings.proxyCustom'), value: 'custom' },
  ]
}

function panelGetRunStatusLabel(status: string) {
  switch (status) {
    case 'starting':
      return t('status.starting')
    case 'running':
      return t('status.running')
    case 'done':
      return t('status.done')
    case 'failed':
      return t('status.failed')
    case 'disconnected':
      return t('status.disconnected')
    default:
      return t('status.waiting')
  }
}

function panelIsRunWorking(run: AgentRun) {
  return run.status === 'starting' || run.status === 'running'
}

/** The element a conversation is about. */
function panelGetRunFocusLabel(run: AgentRun, getDisplayPath: (path: string) => string) {
  return run.sourceName || getDisplayPath(run.sourcePath || '')
}

/**
 * Conversations are named by what was asked, not by the element: picking the
 * same element twice is common, asking the same thing twice is not.
 */
function panelGetRunTitle(run: AgentRun, getDisplayPath: (path: string) => string) {
  const firstLine = (run.turns[0]?.prompt || '')
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean)
  return firstLine || panelGetRunFocusLabel(run, getDisplayPath)
}

function panelTruncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value
}

function panelFormatDuration(milliseconds: number) {
  const seconds = Math.max(0, Math.round(milliseconds / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${String(seconds % 60).padStart(2, '0')}s`
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`
}

function panelGetTurnStatusLabel(turn: AgentRunTurn) {
  if (turn.stopped) return t('status.stopped')
  if (turn.interrupted) return t('status.turnInterrupted')
  return panelGetRunStatusLabel(turn.status)
}

const panelChangeStatusLabels: Record<ChangedFile['status'], string> = { added: 'A', deleted: 'D', modified: 'M' }
const panelChangeStatusTitleKeys = { added: 'files.added', deleted: 'files.deleted', modified: 'files.modified' } as const
// Long change lists fold after this many files.
const panelVisibleChangedFiles = 8

function panelFormatRunTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString(getLocale(), {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

const panelDayMs = 24 * 60 * 60 * 1000

function panelGetStartOfDay(timestamp: number) {
  const date = new Date(timestamp)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

/** Matches the runtime's ordering key: the last turn start moves when a task is continued. */
function panelGetRunActivityAt(run: AgentRun) {
  return Math.max(run.turns[run.turns.length - 1]?.createdAt || 0, run.createdAt || 0)
}

function panelGetRunDayGroup(timestamp: number, now: number) {
  const dayDiff = Math.round((panelGetStartOfDay(now) - panelGetStartOfDay(timestamp)) / panelDayMs)
  if (dayDiff <= 0) return t('time.today')
  if (dayDiff === 1) return t('time.yesterday')
  if (dayDiff < 7) return t('time.last7Days')
  return t('time.earlier')
}

/** History outlives the day it was made in, so anything older than today carries its date. */
function panelFormatRunListTime(timestamp: number, now: number) {
  const date = new Date(timestamp)
  const time = date.toLocaleTimeString(getLocale(), { hour: '2-digit', minute: '2-digit' })
  const dayDiff = Math.round((panelGetStartOfDay(now) - panelGetStartOfDay(timestamp)) / panelDayMs)
  if (dayDiff <= 0) return time
  if (dayDiff === 1) return t('time.yesterdayAt', { time })
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return date.getFullYear() === new Date(now).getFullYear() ? `${month}-${day} ${time}` : `${date.getFullYear()}-${month}-${day} ${time}`
}

function panelRunMatchesQuery(run: AgentRun, query: string, getDisplayPath: (path: string) => string) {
  if (!query) return true
  const haystack = [
    run.sourceName,
    getDisplayPath(run.sourcePath || ''),
    run.providerLabel,
    ...run.turns.flatMap((turn) => [turn.prompt, turn.sourceName, getDisplayPath(turn.sourcePath || '')]),
  ]
    .join('\n')
    .toLowerCase()
  return query
    .toLowerCase()
    .split(/\s+/u)
    .filter(Boolean)
    .every((word) => haystack.includes(word))
}

/** Client-made turns carry `file:line:col`, server-made ones the bare file; compare the file. */
function panelStripSourcePosition(sourcePath: string) {
  return (sourcePath || '').replace(/(?::\d+){1,2}$/u, '')
}

/**
 * Continuing is the default, so the list only calls out the exception: a
 * settled conversation that cannot take another turn (the reason is in the tooltip).
 */
function panelIsRunStuck(run: AgentRun) {
  return run.completed && !run.canResume
}

function panelIsOutputNearBottom(output: HTMLElement) {
  return output.scrollHeight - output.scrollTop - output.clientHeight <= outputAutoScrollThreshold
}

function panelScrollOutputToBottom(output: HTMLElement) {
  output.scrollTop = output.scrollHeight
}

type PanelOutputDiagnostic = {
  count: number
  message: string
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
      message: t('diagnostic.codexStateDb'),
    }
  }

  if (/failed to warm featured plugin ids cache|backend-api\/plugins\/featured|__cf_chl|Cloudflare|403 Forbidden/iu.test(message)) {
    return {
      key: 'codex-plugin-sync-403',
      message: t('diagnostic.codexPluginSync'),
    }
  }

  const manifestWarning = message.match(/WARN\s+codex_core_plugins::manifest:\s+ignoring\s+(.+?)(?:\s+path=|$)/iu)
  if (manifestWarning) {
    return {
      key: `plugin-manifest-${manifestWarning[1]}`,
      message: t('diagnostic.pluginManifest', { detail: manifestWarning[1] }),
    }
  }

  const skillWarning = message.match(/WARN\s+codex_core_skills::loader:\s+ignoring\s+(.+?)(?:\s+path=|$)/iu)
  if (skillWarning) {
    return {
      key: `skill-loader-${skillWarning[1]}`,
      message: t('diagnostic.skillLoader', { detail: skillWarning[1] }),
    }
  }

  const analyticsWarning = message.match(/WARN\s+codex_analytics::client:\s+(.+)$/iu)
  if (analyticsWarning) {
    return {
      key: `analytics-${analyticsWarning[1]}`,
      message: t('diagnostic.analytics', { detail: analyticsWarning[1] }),
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
      visibleLines.push(`${t('turn.log')}\`${line.slice('日志：'.length).trim()}\``)
      continue
    }

    // Permission decisions are recorded as tokens too, so history reads in the current language.
    const permissionMatch = line.match(/^\[ai-ins:permission:(allow|always|deny|cancelled)\] (\S+)(?: (.+))?$/u)
    if (permissionMatch) {
      const recordKeys = { allow: 'permission.recordAllow', always: 'permission.recordAlways', cancelled: 'permission.recordCancelled', deny: 'permission.recordDeny' } as const
      const detail = permissionMatch[3] ? ` \`${permissionMatch[3].replace(/`/gu, "'")}\`` : ''
      visibleLines.push(`> ${t(recordKeys[permissionMatch[1] as keyof typeof recordKeys])} · **${panelFormatToolName(permissionMatch[2])}**${detail}`)
      continue
    }

    // Notices are tokens (`[ai-ins:notice:<name>]`) so they read in the panel's language.
    const noticeMatch = line.match(/^\[ai-ins:notice:(\w+)\]$/u)
    if (noticeMatch) {
      const key = `notice.${noticeMatch[1]}`
      visibleLines.push(`> ${isMessageKey(key) ? t(key) : line}`)
      continue
    }

    // Agent bookkeeping (CLI started, retries) is not part of the reply.
    if (line.startsWith('[system] ')) {
      panelAddDiagnostic(diagnostics, line.slice('[system] '.length))
      continue
    }

    // Tool calls render as a compact activity trail between reply paragraphs.
    const toolMatch = line.match(/^\[tool\]\s+(\S+)(?:\s+(.+))?$/u)
    if (toolMatch) {
      visibleLines.push(`> ${t('turn.tool')} · **${toolMatch[1]}**${toolMatch[2] ? ` \`${toolMatch[2].replace(/`/gu, "'")}\`` : ''}`)
      continue
    }

    visibleLines.push(line)
  }

  const reply = visibleLines.join('\n').trim()
  const markdown = reply || (diagnostics.size ? t('turn.noDisplayableReply') : t('turn.waitingOutput'))
  return { diagnostics: Array.from(diagnostics.values()), hasReply: Boolean(reply), markdown }
}

function PanelOutputViewer({ live, onOpenFile, value }: { live: boolean; onOpenFile: (path: string) => void; value: string }) {
  const locale = getLocale()
  // Re-format on a language switch: tool labels and diagnostics are translated.
  const displayOutput = useMemo(() => panelFormatOutputForDisplay(value), [value, locale])
  const hiddenLogCount = displayOutput.diagnostics.reduce((total, diagnostic) => total + diagnostic.count, 0)

  return (
    <>
      {/* A running turn with only startup lines has nothing to say yet; the live line covers it. */}
      {live && !displayOutput.hasReply ? null : <MarkdownView onOpenFile={onOpenFile} value={displayOutput.markdown} />}
      {displayOutput.diagnostics.length ? (
        <details className="ai-ins-output-diagnostics">
          <summary>{t('turn.diagnostics', { count: hiddenLogCount })}</summary>
          <ul>
            {displayOutput.diagnostics.map((diagnostic, index) => (
              <li key={index}>
                <span>{diagnostic.message}</span>
                {diagnostic.count > 1 ? <span className="ai-ins-output-diagnostic-count">×{diagnostic.count}</span> : null}
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
    <svg aria-hidden="true" className="ai-ins-output-state-spinner" fill="none" viewBox="0 0 24 24">
      <circle cx="12" cy="12" opacity="0.22" r="8.5" stroke="currentColor" strokeWidth="3" />
      <path d="M20.5 12a8.5 8.5 0 0 0-8.5-8.5" stroke="currentColor" strokeLinecap="round" strokeWidth="3.2" />
      <path d="M17.4 5.9a8.5 8.5 0 0 1 2.7 4.1" opacity="0.62" stroke="#bfdbfe" strokeLinecap="round" strokeWidth="3.2" />
    </svg>
  )
}

function panelGetRunFirstPrompt(run: AgentRun) {
  return run.turns[0]?.prompt || ''
}

function panelGetTurnStatusTone(turn: AgentRunTurn) {
  if (turn.status === 'starting' || turn.status === 'running') {
    return 'active'
  }

  return turn.status
}

/** Long settled replies collapse behind a toggle so earlier turns stay scannable. */
const panelCollapsibleOutputLength = 1600
const panelCollapsibleOutputLines = 28

function panelCountLines(value: string) {
  let count = 1
  for (let index = value.indexOf('\n'); index !== -1; index = value.indexOf('\n', index + 1)) {
    count += 1
  }
  return count
}

function panelGetRunTone(run: AgentRun) {
  if (run.pendingPermissions?.length) return 'waiting'
  if (panelIsRunWorking(run)) return 'active'
  if (run.turns[run.turns.length - 1]?.stopped) return 'stopped'
  if (run.interrupted) return 'interrupted'
  return run.status
}

const panelPermissionModeKeys = {
  ask: 'settings.permissionAsk',
  edit: 'settings.permissionEdit',
  full: 'settings.permissionFull',
} as const

const panelPermissionNoteKeys = {
  ask: 'settings.permissionAskNote',
  edit: 'settings.permissionEditNote',
  full: 'settings.permissionFullNote',
} as const

// Mirrors the server: an unsupported level falls back to a stricter one.
const panelPermissionFallbacks: Record<PermissionMode, PermissionMode[]> = {
  ask: ['ask', 'edit'],
  edit: ['edit', 'ask'],
  full: ['full', 'edit', 'ask'],
}

function panelResolvePermissionMode(provider: AgentProvider | undefined, requested: PermissionMode) {
  const supported = provider?.permissionModes ?? []
  return panelPermissionFallbacks[requested].find((mode) => supported.includes(mode))
}

/** `mcp__plugin_figma_figma__get_design_context` reads better as `get_design_context (MCP · plugin_figma_figma)`. */
function panelFormatToolName(toolName: string) {
  const parts = toolName.split('__')
  return parts[0] === 'mcp' && parts.length >= 3 ? `${parts.slice(2).join('__')} (MCP · ${parts[1]})` : toolName
}

/** What the tool call would do: the command or path when there is one, else its input. */
function panelDescribePermissionInput(input: unknown) {
  if (!input || typeof input !== 'object') return ''
  const record = input as Record<string, unknown>
  for (const key of ['command', 'file_path', 'path', 'url']) {
    if (typeof record[key] === 'string' && record[key]) return record[key] as string
  }
  const json = JSON.stringify(input, null, 2)
  if (!json || json === '{}') return ''
  return json.length > 800 ? `${json.slice(0, 800)}…` : json
}

function panelGetResumeBlockedMessage(run: AgentRun) {
  return isMessageKey(run.resumeBlockedCode) ? t(run.resumeBlockedCode, { provider: run.providerLabel }) : t('resume.blocked')
}

function panelGetRunStateLabel(run: AgentRun) {
  if (run.pendingPermissions?.length) return t('permission.waiting')
  const lastTurn = run.turns[run.turns.length - 1]
  if (!panelIsRunWorking(run) && lastTurn?.stopped) return t('status.stopped')
  if (run.interrupted) return t('status.interrupted')
  return panelGetRunStatusLabel(run.status)
}

/**
 * Which edges of a scroll area have more content past them, so the area can
 * fade there. Re-measured on scroll, on resize and when `contentKey` changes.
 */
function usePanelScrollEdges(contentKey: unknown) {
  const ref = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ bottom: false, top: false })
  const measure = useCallback(() => {
    const node = ref.current
    if (!node) return
    const top = node.scrollTop > 1
    const bottom = node.scrollHeight - node.scrollTop - node.clientHeight > 1
    setEdges((current) => (current.top === top && current.bottom === bottom ? current : { bottom, top }))
  }, [])

  useEffect(() => {
    measure()
    const node = ref.current
    if (!node || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [contentKey, measure])

  return { edges, measure, ref }
}

export function PanelView(props: PanelViewProps & { getDisplayPath: (path: string) => string }) {
  const {
    defaultProxy,
    getDisplayPath,
    locale,
    localePreference,
    onCancelQueued,
    onClearFinishedRuns,
    onClose,
    onDismissStatus,
    onContinueWithTarget,
    onCopyTarget,
    onAnswerPermission,
    onDeleteRun,
    onLocaleChange,
    onNewConversation,
    onLoadWorkspaceChanges,
    onLoadWorkspaceFileDiff,
    onStageFiles,
    onLoadFileDiff,
    onOpenFile,
    onPermissionModeChange,
    onOpenInEditor,
    onPromptChange,
    onProviderChange,
    onProxyChange,
    onProxyModeChange,
    onRetryTurn,
    onPinRun,
    onSelectRun,
    onStopRun,
    onSubmit,
    prompt,
    providerId,
    providers,
    proxy,
    permissionMode,
    proxyMode,
    queuedPrompt,
    repointRun,
    repointed,
    runs,
    runsLoading,
    selectedRunId,
    status,
    submitting,
    targetLabel,
    targetTitle,
  } = props
  const [copied, setCopied] = useState(false)
  const [runQuery, setRunQuery] = useState('')
  // Sidebar shows either the conversations or the work tree's uncommitted changes.
  const [sidebarView, setSidebarView] = useState<PanelSidebarView>(() => readPanelSidebarView())
  // A file picked in the Changes list; the main area shows its diff instead of the chat.
  const [selectedChangePath, setSelectedChangePath] = useState<string | undefined>()
  // Folded sections of the Changes list ('staged' / 'unstaged').
  const [collapsedChangeSections, setCollapsedChangeSections] = useState<Set<string>>(() => new Set())
  // Paths with a stage/unstage request in flight, so their buttons wait.
  const [stagingPaths, setStagingPaths] = useState<Set<string>>(() => new Set())
  const [workspaceChanges, setWorkspaceChanges] = useState<{ data?: WorkspaceChanges; error: string; loading: boolean; version: number }>({
    error: '',
    loading: false,
    version: 0,
  })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [expandedTurns, setExpandedTurns] = useState<Set<string>>(() => new Set())
  const [agentPromptTurnIndex, setAgentPromptTurnIndex] = useState<number | undefined>(undefined)
  const [outputDetachedFromBottom, setOutputDetachedFromBottom] = useState(false)
  const [outputExpanded, setOutputExpanded] = useState(false)
  const [outputModalDetachedFromBottom, setOutputModalDetachedFromBottom] = useState(false)
  const [theme, setTheme] = useState<PanelTheme>(() => readPanelTheme())
  const [submitShortcut, setSubmitShortcut] = useState<PanelSubmitShortcut>(() => readPanelSubmitShortcut())
  const [, setClockTick] = useState(0)
  const settingsRef = useRef<HTMLDivElement>(null)
  const settingsTriggerRef = useRef<HTMLButtonElement>(null)
  const closeSettings = useCallback(() => setSettingsOpen(false), [])
  usePanelDismiss(settingsOpen, settingsRef, closeSettings)
  const [notifyEnabled, setNotifyEnabledState] = useState(() => readNotifyEnabled())
  const [notifySupport, setNotifySupport] = useState<NotifySupport>(() => getNotifySupport())
  const [helpOpen, setHelpOpen] = useState(false)
  // A dot on the help button until the guide has been opened once.
  const [helpSeen, setHelpSeen] = useState(() => readPanelHelpSeen())
  const helpRef = useRef<HTMLDivElement>(null)
  const helpTriggerRef = useRef<HTMLButtonElement>(null)
  const closeHelp = useCallback(() => setHelpOpen(false), [])
  usePanelDismiss(helpOpen, helpRef, closeHelp)
  // Right-click menu on a history row, positioned inside the panel.
  const [runMenu, setRunMenu] = useState<{ runId: string; x: number; y: number } | null>(null)
  const runMenuRef = useRef<HTMLDivElement>(null)
  const runMenuTriggerRef = useRef<HTMLButtonElement | null>(null)
  const closeRunMenu = useCallback(() => setRunMenu(null), [])
  usePanelDismiss(Boolean(runMenu), runMenuRef, closeRunMenu)
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
  const trimmedRunQuery = runQuery.trim()
  const runGroups = useMemo(() => {
    const now = Date.now()
    const groups: Array<{ label: string; runs: AgentRun[] }> = []
    const matching = runs.filter((run) => panelRunMatchesQuery(run, trimmedRunQuery, getDisplayPath))
    // Pinned conversations lead the list, most recently pinned first.
    const pinned = matching.filter((run) => run.pinnedAt).sort((first, second) => (second.pinnedAt || 0) - (first.pinnedAt || 0))
    if (pinned.length) {
      groups.push({ label: t('sidebar.pinned'), runs: pinned })
    }

    for (const run of matching) {
      if (run.pinnedAt) continue
      const label = panelGetRunDayGroup(panelGetRunActivityAt(run), now)
      const group = groups[groups.length - 1]
      if (group?.label === label) {
        group.runs.push(run)
      } else {
        groups.push({ label, runs: [run] })
      }
    }
    return groups
    // `locale`: day-group labels are translated text.
  }, [getDisplayPath, locale, runs, trimmedRunQuery])
  const runListEdges = usePanelScrollEdges(runGroups)
  const changeListEdges = usePanelScrollEdges(workspaceChanges.data)

  const refreshWorkspaceChanges = useCallback(() => {
    setWorkspaceChanges((current) => ({ ...current, loading: true }))
    onLoadWorkspaceChanges()
      .then((data) => setWorkspaceChanges((current) => ({ data, error: '', loading: false, version: current.version + 1 })))
      .catch((reason: unknown) =>
        setWorkspaceChanges((current) => ({ ...current, error: reason instanceof Error ? reason.message : String(reason), loading: false })),
      )
  }, [onLoadWorkspaceChanges])
  // Re-read after every settled turn, and whenever the tab comes back into
  // view (the user may have committed or edited in the IDE meanwhile).
  const settledTurnsKey = runs.map((run) => `${run.id}:${run.turns.filter((turn) => turn.completed).length}`).join(',')
  useEffect(() => {
    refreshWorkspaceChanges()
  }, [refreshWorkspaceChanges, settledTurnsKey])
  useEffect(() => {
    window.addEventListener('focus', refreshWorkspaceChanges)
    return () => window.removeEventListener('focus', refreshWorkspaceChanges)
  }, [refreshWorkspaceChanges])
  // Opening a conversation, or picking an element, goes back to the chat.
  useEffect(() => {
    setSelectedChangePath(undefined)
  }, [selectedRunId, targetLabel])
  const changedFiles = workspaceChanges.data?.files ?? []
  const selectedChange = selectedChangePath ? changedFiles.find((file) => panelChangeKey(file) === selectedChangePath) : undefined
  const changedFileCount = new Set(changedFiles.map((file) => file.path)).size
  // "Clear finished" keeps pinned conversations.
  const finishedRunCount = runs.filter((run) => run.completed && !run.pinnedAt).length
  // An open conversation is always the one the next submit continues.
  const continuing = Boolean(selectedRun)
  // A follow-up turn always runs on the session's own agent, so the picker is
  // pinned rather than merely ignored.
  const provider = selectedRun
    ? providers.find((candidate) => candidate.id === selectedRun.providerId)
    : providers.find((candidate) => candidate.id === providerId) || providers.find((candidate) => candidate.enabled) || providers[0]
  const providerSwitchTitle = selectedRun
    ? t('agent.lockedTitle', { provider: selectedRun.providerLabel })
    : providers.length
      ? t('agent.availableTitle', {
          providers: providers.map((candidate) => `${candidate.label}${candidate.enabled ? '' : ` (${t('agent.notConfigured')})`}`).join(' / '),
        })
      : t('agent.noneAvailable')
  const providerOptions = useMemo(
    () =>
      providers.map((candidate) => ({
        disabled: !candidate.enabled,
        // Disabled options explain themselves; single-turn agents say so up front,
        // since picking one means the conversation cannot be continued later.
        hint: !candidate.enabled ? t('agent.notConfigured') : candidate.sessionMode === 'none' ? t('agent.singleTurn') : undefined,
        label: candidate.label,
        value: candidate.id,
      })),
    [locale, providers],
  )
  const hasTarget = Boolean(targetTitle) || continuing
  const customProxyMissing = proxyMode === 'custom' && !proxy.trim()
  const selectedRunWorking = Boolean(selectedRun && panelIsRunWorking(selectedRun))
  // While the agent answers, a follow-up can be typed and queued; it goes out
  // when the turn ends. Single-turn agents have nothing to queue into.
  const queueing = Boolean(selectedRun && selectedRunWorking && selectedRun.sessionMode !== 'none')
  const continueBlocked = Boolean(selectedRun && !selectedRun.canResume && !queueing)

  // Elapsed times on a running turn tick every second, not only when output arrives.
  useEffect(() => {
    if (!selectedRunWorking) return
    const timer = window.setInterval(() => setClockTick((tick) => tick + 1), 1000)
    return () => window.clearInterval(timer)
  }, [selectedRunWorking])
  const continueBlockedReason = !selectedRun
    ? ''
    : selectedRunWorking
      ? t('resume.singleTurn', { provider: selectedRun.providerLabel })
      : panelGetResumeBlockedMessage(selectedRun)
  const submitDisabled =
    submitting ||
    !prompt.trim() ||
    !hasTarget ||
    !provider?.enabled ||
    customProxyMissing ||
    continueBlocked ||
    (queueing && (Boolean(queuedPrompt) || !prompt.trim()))
  const selectedRunTurns = selectedRun?.turns ?? []
  const selectedRunScrollId = selectedRun?.id
  // Cheap change signature: enough to drive follow-the-bottom without diffing
  // the whole transcript on every streamed chunk.
  const selectedRunOutputSignature = `${selectedRunScrollId}:${selectedRun?.outputLoaded}:${queuedPrompt?.length ?? 0}:${selectedRunTurns
    .map((turn) => `${turn.output.length}/${turn.changedFiles?.length ?? '-'}`)
    .join('|')}`
  const agentPromptTurn = selectedRunTurns.find((turn) => turn.index === agentPromptTurnIndex)
  const selectedRunLogLabel = selectedRun?.logDisplayPath || selectedRun?.logPath || '.ai-ins/<run-id>.log'
  const selectedRunAgentPrompt = agentPromptTurn?.agentPrompt?.trim() || ''
  const macPlatform = useMemo(() => panelIsMacPlatform(), [])
  const modifierSubmitShortcutLabel = useMemo(() => panelGetModifierSubmitShortcutLabel(macPlatform), [macPlatform])
  const submitShortcutOptions = useMemo<Array<{ label: string; value: PanelSubmitShortcut }>>(
    () => [
      { label: modifierSubmitShortcutLabel, value: 'modifier-enter' },
      { label: panelGetEnterShortcutLabel(), value: 'enter' },
    ],
    [modifierSubmitShortcutLabel],
  )
  const submitShortcutLabel = submitShortcut === 'modifier-enter' ? modifierSubmitShortcutLabel : panelGetEnterShortcutLabel()
  const submitLabel = submitting
    ? t('composer.sending')
    : queueing
      ? t('composer.queue')
      : continuing
        ? t('composer.continue')
        : t('composer.send')

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
  }, [selectedRunOutputSignature])

  useEffect(() => {
    if (!selectedRun) {
      setAgentPromptTurnIndex(undefined)
      setOutputExpanded(false)
    }
  }, [selectedRun])

  useEffect(() => {
    if (agentPromptTurn) {
      agentPromptModalRef.current?.focus()
    }
  }, [agentPromptTurn])

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
  }, [outputExpanded, selectedRunOutputSignature])

  async function handleCopyTarget() {
    await onCopyTarget()
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  function handlePromptChange(value: string) {
    onPromptChange(value)
  }

  function handleThemeChange(next: PanelTheme) {
    setTheme(next)
    savePanelTheme(next)
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
    if (proxyMode === 'custom') return proxy.trim() ? t('settings.proxyCustom') : t('settings.proxyNeedsUrl')
    if (proxyMode === 'system') return defaultProxy ? t('settings.proxyDetected') : t('settings.proxyNotDetected')
    return t('settings.proxyOff')
  }

  /** Composer chip for a proxy in use; nothing when the proxy is off. */
  function renderProxyChip() {
    if (proxyMode === 'off') return null
    const address = proxyMode === 'custom' ? proxy.trim() : defaultProxy
    const missing = !address
    const label = missing
      ? t(proxyMode === 'custom' ? 'composer.proxyMissing' : 'composer.proxySystemMissing')
      : t(proxyMode === 'custom' ? 'composer.proxyCustom' : 'composer.proxySystem')
    return (
      <button
        className={`ai-ins-proxy-chip${missing ? ' ai-ins-proxy-chip-warn' : ''}`}
        onClick={() => {
          setHelpOpen(false)
          setSettingsOpen(true)
        }}
        title={missing ? label : t('composer.proxyTitle', { proxy: address })}
        type="button"
      >
        <Icon paths={globeIcon} />
        <span>{label}</span>
      </button>
    )
  }

  function getProxyInputValue() {
    if (proxyMode === 'system') return defaultProxy
    if (proxyMode === 'custom') return proxy
    return ''
  }

  function getProxyInputPlaceholder() {
    if (proxyMode === 'custom') return 'http://127.0.0.1:7890'
    if (proxyMode === 'system') return t('settings.proxySystemMissing')
    return t('settings.proxyNone')
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

  function renderSegmented<T extends string>(
    name: string,
    label: string,
    options: Array<{ icon?: string[]; label: string; value: T }>,
    value: T,
    onChange: (next: T) => void,
    compact = false,
  ) {
    return (
      <div aria-label={label} className={`ai-ins-segmented${compact ? ' ai-ins-segmented-compact' : ''}`} role="radiogroup">
        {options.map((option) => (
          <label className="ai-ins-segmented-option" key={option.value}>
            <input checked={value === option.value} name={`ai-ins-${name}`} onChange={() => onChange(option.value)} type="radio" value={option.value} />
            <span>
              {option.icon ? <Icon paths={option.icon} /> : null}
              {option.label}
            </span>
          </label>
        ))}
      </div>
    )
  }

  /** Say so when the agent the next turn goes to cannot honor the chosen level. */
  function renderPermissionProviderNote() {
    if (!provider) return null
    if (!provider.permissionModes?.length) {
      return <p className="ai-ins-settings-note">{t('settings.permissionFixed', { provider: provider.label })}</p>
    }

    const actual = panelResolvePermissionMode(provider, permissionMode)
    if (!actual || actual === permissionMode) return null
    return (
      <p className="ai-ins-settings-note">
        {t('settings.permissionFallback', {
          actual: t(panelPermissionModeKeys[actual]),
          provider: provider.label,
          requested: t(panelPermissionModeKeys[permissionMode]),
        })}
      </p>
    )
  }

  function openRunMenu(event: ReactMouseEvent<HTMLButtonElement>, run: AgentRun) {
    event.preventDefault()
    const panel = event.currentTarget.closest('.ai-ins-panel')
    if (!panel) return
    const bounds = panel.getBoundingClientRect()
    // The context-menu key fires with no pointer position: open at the row instead.
    const row = event.currentTarget.getBoundingClientRect()
    const clientX = event.clientX || row.left + 24
    const clientY = event.clientY || row.bottom - 8
    // Keep the menu (about 184 x 100) inside the panel.
    const x = Math.min(clientX - bounds.left, bounds.width - 192)
    const y = Math.min(clientY - bounds.top, bounds.height - 108)
    runMenuTriggerRef.current = event.currentTarget
    setSettingsOpen(false)
    setRunMenu({ runId: run.id, x: Math.max(8, x), y: Math.max(8, y) })
  }

  function renderRunsSidebar() {
    return (
      <>
          {/* Search fills the row; "new conversation" is the compact + at its end. */}
          <div className="ai-ins-sidebar-nav">
            <label className="ai-ins-run-search">
              <Icon paths={searchIcon} />
              <input
                aria-label={t('sidebar.search')}
                onChange={(event) => setRunQuery(event.target.value)}
                onKeyDown={(event) => {
                  // The overlay closes the panel on Escape; with a query typed, Escape
                  // clears the search first. React's root listener sits on the same
                  // overlay node and runs first, hence the immediate stop.
                  if (event.key === 'Escape' && runQuery) {
                    event.nativeEvent.stopImmediatePropagation()
                    setRunQuery('')
                  }
                }}
                placeholder={t('sidebar.searchPlaceholder')}
                type="search"
                value={runQuery}
              />
            </label>
            <button
              aria-label={t('sidebar.newConversation')}
              aria-pressed={!selectedRun && !selectedChange}
              className="ai-ins-icon-button ai-ins-new-chat"
              onClick={() => {
                setSelectedChangePath(undefined)
                onNewConversation()
              }}
              title={t('sidebar.newConversationTitle')}
              type="button"
            >
              <Icon paths={plusIcon} />
            </button>
          </div>
          <div
            className="ai-ins-list"
            data-fade-bottom={runListEdges.edges.bottom}
            data-fade-top={runListEdges.edges.top}
            onScroll={() => {
              runListEdges.measure()
              if (runMenu) closeRunMenu()
            }}
            ref={runListEdges.ref}
          >
            {runGroups.length ? (
              runGroups.map((group) => (
                <div className="ai-ins-run-group" key={group.label}>
                  <p className="ai-ins-run-group-label">{group.label}</p>
                  {group.runs.map((run) => {
                    const stuck = panelIsRunStuck(run)
                    const tone = panelGetRunTone(run)
                    const lastPrompt = run.turns.length > 1 ? run.turns[run.turns.length - 1]?.prompt : ''
                    return (
                      <button
                        aria-current={selectedRun?.id === run.id && !selectedChange ? 'true' : undefined}
                        className={`ai-ins-run${selectedRun?.id === run.id && !selectedChange ? ' ai-ins-run-active' : ''}`}
                        key={run.id}
                        onClick={() => {
                          setSelectedChangePath(undefined)
                          onSelectRun(run.id)
                        }}
                        onContextMenu={(event) => openRunMenu(event, run)}
                        title={stuck ? panelGetResumeBlockedMessage(run) : undefined}
                        type="button"
                      >
                        <div className="ai-ins-run-top">
                          <span className={`ai-ins-dot ai-ins-dot-${tone === 'active' ? run.status : tone}`} />
                          <span className="ai-ins-run-title">{panelGetRunTitle(run, getDisplayPath)}</span>
                          {run.pinnedAt ? (
                            <span className="ai-ins-run-pin" title={t('sidebar.pinned')}>
                              <Icon paths={pinIcon} />
                            </span>
                          ) : null}
                        </div>
                        <div className="ai-ins-run-focus">
                          <span className="ai-ins-run-focus-name">{panelGetRunFocusLabel(run, getDisplayPath)}</span>
                          <span className="ai-ins-run-provider">{run.providerLabel}</span>
                        </div>
                        {lastPrompt ? <div className="ai-ins-run-prompt ai-ins-run-prompt-latest">↳ {lastPrompt}</div> : null}
                        <div className="ai-ins-run-meta">
                          <span className={`ai-ins-run-status ai-ins-run-status-${tone}`}>{panelGetRunStateLabel(run)}</span>
                          <span>{panelFormatRunListTime(panelGetRunActivityAt(run), Date.now())}</span>
                          {run.turns.length > 1 ? <span className="ai-ins-run-turn-count">{t('sidebar.turnCount', { count: run.turns.length })}</span> : null}
                          {stuck ? <span className="ai-ins-run-stuck-tag">{t('sidebar.cannotContinue')}</span> : null}
                        </div>
                      </button>
                    )
                  })}
                </div>
              ))
            ) : (
              <div className="ai-ins-detail-empty">
                {runsLoading ? t('sidebar.loading') : runs.length ? t('sidebar.noMatch') : t('sidebar.empty')}
              </div>
            )}
          </div>
          {/* Rare and destructive: kept out of the way at the bottom. */}
          {finishedRunCount ? (
            <div className="ai-ins-sidebar-foot">
              <button
                className="ai-ins-sidebar-foot-button"
                onClick={() => {
                  if (window.confirm(t('sidebar.clearFinishedConfirm', { count: finishedRunCount }))) {
                    onClearFinishedRuns()
                  }
                }}
                title={t('sidebar.clearFinishedTitle')}
                type="button"
              >
                <Icon paths={trashIcon} />
                <span>{t('sidebar.clearFinished')}</span>
                <span className="ai-ins-sidebar-foot-count">{finishedRunCount}</span>
              </button>
            </div>
          ) : null}
      </>
    )
  }

  function renderChangesList() {
    const { data, error, loading, version } = workspaceChanges
    const additions = changedFiles.reduce((total, file) => total + (file.additions ?? 0), 0)
    const deletions = changedFiles.reduce((total, file) => total + (file.deletions ?? 0), 0)

    return (
      <>
        <div className="ai-ins-changes-head">
          <span className="ai-ins-changes-title">{t('changes.title')}</span>
          {changedFiles.length ? (
            <span className="ai-ins-msg-file-stat">
              {additions ? <span className="ai-ins-msg-file-add">+{additions}</span> : null}
              {deletions ? <span className="ai-ins-msg-file-del">−{deletions}</span> : null}
            </span>
          ) : null}
          <button
            aria-label={t('changes.refresh')}
            className={`ai-ins-icon-button ai-ins-changes-refresh${loading ? ' ai-ins-changes-refresh-busy' : ''}`}
            onClick={refreshWorkspaceChanges}
            title={t('changes.refresh')}
            type="button"
          >
            <Icon paths={refreshIcon} />
          </button>
        </div>
        <div
          className="ai-ins-list"
          data-fade-bottom={changeListEdges.edges.bottom}
          data-fade-top={changeListEdges.edges.top}
          onScroll={changeListEdges.measure}
          ref={changeListEdges.ref}
        >
          {error && !data ? (
            <div className="ai-ins-detail-empty">{error}</div>
          ) : !data ? (
            <div className="ai-ins-detail-empty">{t('changes.loading')}</div>
          ) : !data.available ? (
            <div className="ai-ins-detail-empty">{t('changes.unavailable')}</div>
          ) : !changedFiles.length ? (
            <div className="ai-ins-detail-empty">{t('changes.empty')}</div>
          ) : (
            ([true, false] as const).map((staged) => {
              const section = changedFiles.filter((file) => file.staged === staged)
              if (!section.length) return null
              const sectionKey = staged ? 'staged' : 'unstaged'
              const collapsed = collapsedChangeSections.has(sectionKey)
              const busy = section.some((file) => stagingPaths.has(file.path))
              return (
                <div className="ai-ins-run-group" key={sectionKey}>
                  <div className="ai-ins-changes-section">
                    <button
                      aria-expanded={!collapsed}
                      className="ai-ins-changes-section-toggle"
                      onClick={() =>
                        setCollapsedChangeSections((current) => {
                          const next = new Set(current)
                          if (next.has(sectionKey)) next.delete(sectionKey)
                          else next.add(sectionKey)
                          return next
                        })
                      }
                      type="button"
                    >
                      <span className="ai-ins-changes-section-chevron">
                        <Icon paths={chevronRightIcon} />
                      </span>
                      {staged ? t('changes.staged') : t('changes.unstaged')}
                      <span className="ai-ins-changes-section-count">{section.length}</span>
                    </button>
                    <button
                      aria-label={staged ? t('changes.unstageAll') : t('changes.stageAll')}
                      className="ai-ins-icon-button ai-ins-change-stage"
                      disabled={busy}
                      onClick={() => stageChanges(section, !staged)}
                      title={staged ? t('changes.unstageAll') : t('changes.stageAll')}
                      type="button"
                    >
                      <Icon paths={staged ? minusIcon : plusIcon} />
                    </button>
                  </div>
                  {collapsed
                    ? null
                    : section.map((file) => {
                        const key = panelChangeKey(file)
                        const [name, directory] = panelSplitPath(getDisplayPath(file.path))
                        return (
                          <div className={`ai-ins-change${selectedChangePath === key ? ' ai-ins-change-active' : ''}`} key={`${key}:${version}`}>
                            <button
                              aria-current={selectedChangePath === key ? 'true' : undefined}
                              className="ai-ins-change-main"
                              onClick={() => setSelectedChangePath(key)}
                              title={getDisplayPath(file.path)}
                              type="button"
                            >
                              <span className={`ai-ins-msg-file-status ai-ins-msg-file-status-${file.status}`}>{panelChangeStatusLabels[file.status]}</span>
                              <span className="ai-ins-change-name">
                                <span>{name}</span>
                                {directory ? <span className="ai-ins-change-dir">{directory}</span> : null}
                              </span>
                              {file.additions !== undefined && !file.binary ? (
                                <span className="ai-ins-msg-file-stat">
                                  {file.additions ? <span className="ai-ins-msg-file-add">+{file.additions}</span> : null}
                                  {file.deletions ? <span className="ai-ins-msg-file-del">−{file.deletions}</span> : null}
                                </span>
                              ) : null}
                            </button>
                            <button
                              aria-label={`${staged ? t('changes.unstage') : t('changes.stage')} ${getDisplayPath(file.path)}`}
                              className="ai-ins-icon-button ai-ins-change-stage"
                              disabled={stagingPaths.has(file.path)}
                              onClick={() => stageChanges([file], !staged)}
                              title={staged ? t('changes.unstage') : t('changes.stage')}
                              type="button"
                            >
                              <Icon paths={staged ? minusIcon : plusIcon} />
                            </button>
                          </div>
                        )
                      })}
                </div>
              )
            })
          )}
        </div>
      </>
    )
  }

  /**
   * Stage or unstage files, then re-read the list. The open diff follows its
   * file into the other section rather than closing.
   */
  function stageChanges(files: WorkspaceChange[], stage: boolean) {
    const paths = files.map((file) => file.path)
    setStagingPaths((current) => new Set([...current, ...paths]))
    const selected = files.find((file) => panelChangeKey(file) === selectedChangePath)
    void onStageFiles(paths, stage).then(() => {
      setStagingPaths((current) => new Set([...current].filter((path) => !paths.includes(path))))
      if (selected) setSelectedChangePath(`${stage ? 'staged' : 'unstaged'}:${selected.path}`)
      refreshWorkspaceChanges()
    })
  }

  /** Main area while a file from the Changes list is open: its staged or unstaged diff. */
  function renderChangeDetail(file: WorkspaceChange) {
    const displayPath = getDisplayPath(file.path)
    const [name, directory] = panelSplitPath(displayPath)
    const owner = file.runId ? runs.find((run) => run.id === file.runId) : undefined

    return (
      <main className="ai-ins-main ai-ins-chat">
        <header className="ai-ins-chat-head">
          <div className="ai-ins-chat-head-copy">
            <p className="ai-ins-detail-title" title={displayPath}>
              {name}
            </p>
            <div className="ai-ins-detail-subtitle ai-ins-change-subtitle">
              <span>{[directory, file.staged ? t('changes.stagedVs') : t('changes.unstagedVs')].filter(Boolean).join(' · ')}</span>
              {owner ? (
                <>
                  <span>· {t('changes.fromRun')}</span>
                  <button
                    className="ai-ins-msg-link ai-ins-change-owner"
                    onClick={() => {
                      setSelectedChangePath(undefined)
                      onSelectRun(owner.id)
                    }}
                    title={panelGetRunTitle(owner, getDisplayPath)}
                    type="button"
                  >
                    {panelGetRunTitle(owner, getDisplayPath)}
                  </button>
                </>
              ) : null}
            </div>
          </div>
          <div className="ai-ins-detail-actions">
            {file.additions !== undefined && !file.binary ? (
              <span className="ai-ins-msg-file-stat">
                {file.additions ? <span className="ai-ins-msg-file-add">+{file.additions}</span> : null}
                {file.deletions ? <span className="ai-ins-msg-file-del">−{file.deletions}</span> : null}
              </span>
            ) : null}
            {file.status !== 'deleted' ? (
              <IconButton label={t('files.open', { path: displayPath })} onClick={() => onOpenFile(file.path)}>
                <Icon paths={externalLinkIcon} />
              </IconButton>
            ) : null}
            <button className="ai-ins-button ai-ins-button-small" onClick={() => setSelectedChangePath(undefined)} type="button">
              {t('changes.back')}
            </button>
          </div>
          {renderPanelActions()}
        </header>
        <div className="ai-ins-change-body">
          <FileDiff cacheKey={`workspace:${panelChangeKey(file)}:${workspaceChanges.version}`} fill load={() => onLoadWorkspaceFileDiff(file.path, file.staged)} />
        </div>
      </main>
    )
  }

  function renderPanelActions() {
    return (
      <div className="ai-ins-header-actions">
        {renderHelp()}
        {renderSettings()}
        <IconButton label={t('panel.collapse')} onClick={onClose}>
          <Icon paths={closeIcon} />
        </IconButton>
      </div>
    )
  }

  function renderRunMenu() {
    const run = runMenu ? runs.find((candidate) => candidate.id === runMenu.runId) : undefined
    if (!runMenu || !run) return null

    const close = (restoreFocus: boolean) => {
      setRunMenu(null)
      if (restoreFocus) runMenuTriggerRef.current?.focus()
    }

    return (
      <div
        aria-label={t('sidebar.runMenu')}
        className="ai-ins-context-menu"
        onKeyDown={(event) => {
          const items = Array.from(runMenuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])
          const index = items.indexOf(document.activeElement as HTMLButtonElement)
          if (event.key === 'Escape' || event.key === 'Tab') {
            // Keep the overlay from closing the whole panel; see the search box.
            event.preventDefault()
            event.nativeEvent.stopImmediatePropagation()
            close(true)
          } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            const step = event.key === 'ArrowDown' ? 1 : -1
            items[(index + step + items.length) % items.length]?.focus()
          }
        }}
        ref={(node) => {
          runMenuRef.current = node
          // Focus the first item when the menu opens, like a native context menu.
          if (node && !node.contains(document.activeElement)) {
            node.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
          }
        }}
        role="menu"
        style={{ left: runMenu.x, top: runMenu.y }}
      >
        <button
          className="ai-ins-context-menu-item"
          onClick={() => {
            close(true)
            onPinRun(run, !run.pinnedAt)
          }}
          role="menuitem"
          type="button"
        >
          <Icon paths={run.pinnedAt ? pinOffIcon : pinIcon} />
          {run.pinnedAt ? t('sidebar.unpin') : t('sidebar.pin')}
        </button>
        <div className="ai-ins-context-menu-separator" role="separator" />
        <button
          className="ai-ins-context-menu-item ai-ins-context-menu-item-danger"
          onClick={() => {
            close(false)
            onDeleteRun(run)
          }}
          role="menuitem"
          type="button"
        >
          <Icon paths={trashIcon} />
          {t('sidebar.delete')}
        </button>
      </div>
    )
  }

  /**
   * Proxy and submit shortcut are set once and rarely touched, so they live in
   * a small popover behind one icon instead of crowding the composer. The dot
   * on the icon keeps a non-default proxy (or a missing custom URL) visible.
   */
  function renderSettings() {
    const settingsBadge = customProxyMissing ? 'warn' : proxyMode !== 'off' ? 'on' : ''
    const settingsTitle = t('settings.triggerTitle', { proxy: getProxyModeHint(), shortcut: submitShortcutLabel })

    return (
      <div
        className="ai-ins-settings"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && settingsOpen) {
            // Keep the overlay from closing the whole panel; see the search box.
            event.nativeEvent.stopImmediatePropagation()
            setSettingsOpen(false)
            settingsTriggerRef.current?.focus()
          }
        }}
        ref={settingsRef}
      >
        <button
          aria-expanded={settingsOpen}
          aria-haspopup="dialog"
          aria-label={settingsTitle}
          className={`ai-ins-icon-button ai-ins-settings-trigger${settingsOpen ? ' ai-ins-settings-trigger-open' : ''}`}
          onClick={() => {
            setHelpOpen(false)
            setSettingsOpen((open) => !open)
          }}
          ref={settingsTriggerRef}
          title={settingsTitle}
          type="button"
        >
          <Icon paths={slidersIcon} />
          {settingsBadge ? <span className={`ai-ins-settings-dot ai-ins-settings-dot-${settingsBadge}`} /> : null}
        </button>
        {settingsOpen ? (
          <div aria-label={t('settings.title')} className="ai-ins-settings-popover" role="dialog">
            <div className="ai-ins-settings-head">
              <span>{t('settings.title')}</span>
              <IconButton label={t('settings.close')} onClick={closeSettings}>
                <Icon paths={closeIcon} />
              </IconButton>
            </div>
            <div className="ai-ins-settings-body">
              {/* Grouped like system settings: short choices sit on the row, longer ones below it. */}
              <section className="ai-ins-settings-group">
                <h3 className="ai-ins-settings-group-title">{t('settings.general')}</h3>
                <div className="ai-ins-settings-card">
                  <div className="ai-ins-settings-row">
                    <span className="ai-ins-settings-label">{t('settings.theme')}</span>
                    {renderSegmented<PanelTheme>(
                      'theme',
                      t('settings.theme'),
                      [
                        { icon: moonIcon, label: t('settings.themeDark'), value: 'dark' },
                        { icon: sunIcon, label: t('settings.themeLight'), value: 'light' },
                      ],
                      theme,
                      handleThemeChange,
                      true,
                    )}
                  </div>
                  <div className="ai-ins-settings-row">
                    <span className="ai-ins-settings-label">
                      {t('settings.language')}
                      {locale === 'en' ? null : <span className="ai-ins-label-hint">Language</span>}
                    </span>
                    <div className="ai-ins-settings-select">
                      <PanelSelect
                        ariaLabel={t('settings.language')}
                        block
                        placement="bottom"
                        onChange={(next) => onLocaleChange(next as LocalePreference)}
                        options={[
                          // Say which language "follow browser" resolves to right now.
                          { hint: localeNames[detectBrowserLocale()], label: t('settings.languageAuto'), value: 'auto' },
                          ...locales.map((value) => ({ label: localeNames[value], value })),
                        ]}
                        value={localePreference}
                      />
                    </div>
                  </div>
                  <div className="ai-ins-settings-row ai-ins-settings-row-stack ai-ins-settings-row-switch">
                    <div className="ai-ins-settings-row-line">
                      <span className="ai-ins-settings-label">{t('settings.notify')}</span>
                      <button
                        aria-checked={notifyEnabled}
                        aria-label={t('settings.notify')}
                        className="ai-ins-switch"
                        disabled={notifySupport === 'unsupported' || (notifySupport === 'denied' && !notifyEnabled)}
                        onClick={() => {
                          void setNotifyEnabled(!notifyEnabled).then((enabled) => {
                            setNotifyEnabledState(enabled)
                            setNotifySupport(getNotifySupport())
                          })
                        }}
                        role="switch"
                        type="button"
                      >
                        <span className="ai-ins-switch-thumb" />
                      </button>
                    </div>
                    <p className={`ai-ins-settings-note${notifySupport === 'denied' ? ' ai-ins-settings-note-warn' : ''}`}>
                      {notifySupport === 'unsupported'
                        ? t('settings.notifyUnsupported')
                        : notifySupport === 'denied'
                          ? t('settings.notifyDenied')
                          : t('settings.notifyNote')}
                    </p>
                  </div>
                  <div className="ai-ins-settings-row">
                    <span className="ai-ins-settings-label">{t('settings.shortcut')}</span>
                    {renderSegmented('shortcut', t('settings.shortcut'), submitShortcutOptions, submitShortcut, handleSubmitShortcutChange, true)}
                  </div>
                </div>
              </section>
              <section className="ai-ins-settings-group">
                <h3 className="ai-ins-settings-group-title">{t('settings.agent')}</h3>
                <div className="ai-ins-settings-card">
                  <div className="ai-ins-settings-row ai-ins-settings-row-stack">
                    <span className="ai-ins-settings-label">{t('settings.permission')}</span>
                    {renderSegmented<PermissionMode>(
                      'permission',
                      t('settings.permission'),
                      (['ask', 'edit', 'full'] as const).map((value) => ({ label: t(panelPermissionModeKeys[value]), value })),
                      permissionMode,
                      onPermissionModeChange,
                    )}
                    <p className={`ai-ins-settings-note${permissionMode === 'full' ? ' ai-ins-settings-note-warn' : ''}`}>
                      {t(panelPermissionNoteKeys[permissionMode])}
                    </p>
                    {renderPermissionProviderNote()}
                  </div>
                  <div className="ai-ins-settings-row ai-ins-settings-row-stack">
                    <span className="ai-ins-settings-label">
                      {t('settings.proxy')}
                      <span className="ai-ins-label-hint">{getProxyModeHint()}</span>
                    </span>
                    {renderSegmented('proxy', t('settings.proxy'), panelGetProxyModeOptions(), proxyMode, onProxyModeChange)}
                    {proxyMode !== 'off' ? (
                      <input
                        aria-label={t('settings.proxyAddress')}
                        className="ai-ins-input ai-ins-proxy-input"
                        disabled={proxyMode !== 'custom'}
                        onChange={(event) => onProxyChange(event.target.value)}
                        placeholder={getProxyInputPlaceholder()}
                        required={proxyMode === 'custom'}
                        type="url"
                        value={getProxyInputValue()}
                      />
                    ) : null}
                    <p className="ai-ins-settings-note">{t('settings.proxyNote')}</p>
                  </div>
                </div>
              </section>
            </div>
          </div>
        ) : null}
      </div>
    )
  }

  /** A short guide to the whole flow, one click away in the header. */
  function renderHelp() {
    const steps = [
      { body: t('help.pick'), title: t('help.pickTitle') },
      { body: t('help.ask', { send: submitShortcutLabel }), title: t('help.askTitle') },
      { body: t('help.review'), title: t('help.reviewTitle') },
      { body: t('help.continue'), title: t('help.continueTitle') },
      {
        body: t('help.settings', {
          ask: t(panelPermissionModeKeys.ask),
          edit: t(panelPermissionModeKeys.edit),
          full: t(panelPermissionModeKeys.full),
        }),
        title: t('help.settingsTitle'),
      },
    ]
    const shortcuts = [
      { keys: t('help.keyPickKeys'), label: t('help.keyPick') },
      { keys: submitShortcutLabel, label: t('help.keySend') },
      { keys: 'Esc', label: t('help.keyClose') },
    ]

    return (
      <div
        className="ai-ins-settings"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && helpOpen) {
            // Keep the overlay from closing the whole panel; see the search box.
            event.nativeEvent.stopImmediatePropagation()
            setHelpOpen(false)
            helpTriggerRef.current?.focus()
          }
        }}
        ref={helpRef}
      >
        <button
          aria-expanded={helpOpen}
          aria-haspopup="dialog"
          aria-label={t('help.triggerTitle')}
          className={`ai-ins-icon-button ai-ins-settings-trigger${helpOpen ? ' ai-ins-settings-trigger-open' : ''}`}
          onClick={() => {
            setSettingsOpen(false)
            setHelpOpen((open) => !open)
            if (!helpSeen) {
              setHelpSeen(true)
              savePanelHelpSeen()
            }
          }}
          ref={helpTriggerRef}
          title={t('help.triggerTitle')}
          type="button"
        >
          <Icon paths={helpIcon} />
          {helpSeen ? null : <span className="ai-ins-settings-dot ai-ins-settings-dot-on" />}
        </button>
        {helpOpen ? (
          <div aria-label={t('help.title')} className="ai-ins-settings-popover ai-ins-help-popover" role="dialog">
            <div className="ai-ins-settings-head">
              <span>{t('help.title')}</span>
              <IconButton label={t('help.close')} onClick={closeHelp}>
                <Icon paths={closeIcon} />
              </IconButton>
            </div>
            <div className="ai-ins-settings-body">
              <ol className="ai-ins-help-steps">
                {steps.map((step, index) => (
                  <li key={step.title}>
                    <span className="ai-ins-help-step-index">{index + 1}</span>
                    <div>
                      <p className="ai-ins-help-step-title">{step.title}</p>
                      <p className="ai-ins-help-step-body">{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <section className="ai-ins-settings-group">
                <h3 className="ai-ins-settings-group-title">{t('help.shortcuts')}</h3>
                <div className="ai-ins-settings-card">
                  {shortcuts.map((shortcut) => (
                    <div className="ai-ins-settings-row ai-ins-help-shortcut" key={shortcut.label}>
                      <span className="ai-ins-settings-label">{shortcut.label}</span>
                      <kbd className="ai-ins-help-kbd">{shortcut.keys}</kbd>
                    </div>
                  ))}
                </div>
              </section>
              <p className="ai-ins-settings-note">{t('help.dock')}</p>
            </div>
          </div>
        ) : null}
      </div>
    )
  }

  function toggleTurnExpanded(key: string) {
    setExpandedTurns((current) => {
      const next = new Set(current)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  function renderTurn(run: AgentRun, turn: AgentRunTurn, previousTurn: AgentRunTurn | undefined, isLatest: boolean, expandAll: boolean) {
    const key = `${run.id}:${turn.index}`
    const pendingPermissions = isLatest && !expandAll ? run.pendingPermissions ?? [] : []
    const waiting = pendingPermissions.length > 0
    const tone = waiting ? 'waiting' : turn.stopped ? 'stopped' : turn.interrupted ? 'interrupted' : panelGetTurnStatusTone(turn)
    const working = tone === 'active'
    const output = turn.output || ''
    const lineCount = panelCountLines(output)
    const collapsible = !expandAll && !working && (output.length > panelCollapsibleOutputLength || lineCount > panelCollapsibleOutputLines)
    // The latest reply is what the user is reading; earlier long ones fold.
    const collapsed = collapsible && (isLatest ? expandedTurns.has(`${key}:collapsed`) : !expandedTurns.has(key))
    const toggleKey = isLatest ? `${key}:collapsed` : key
    // Only call out the focus when it is new information: the first turn, or a
    // follow-up that was re-pointed to another element.
    const focusChanged =
      !previousTurn ||
      (Boolean(turn.sourcePath) &&
        (panelStripSourcePosition(turn.sourcePath) !== panelStripSourcePosition(previousTurn.sourcePath) ||
          turn.sourceName !== previousTurn.sourceName))
    const focusLabel = focusChanged ? turn.sourceName || getDisplayPath(turn.sourcePath || '') : ''
    const duration = working
      ? panelFormatDuration(Date.now() - turn.createdAt)
      : turn.completedAt
        ? panelFormatDuration(turn.completedAt - turn.createdAt)
        : ''
    // Retry re-sends the same request into the same session; only the last
    // turn, only when it ended badly, and only if the session can take a turn.
    const canRetry = isLatest && !expandAll && turn.completed && turn.status === 'failed' && run.canResume && !queuedPrompt && !submitting

    return (
      <section className="ai-ins-msg-group" key={key}>
        <div className="ai-ins-msg-user">
          <div className="ai-ins-msg-bubble">{turn.prompt}</div>
          <div className="ai-ins-msg-meta">
            {focusLabel ? (
              <span className="ai-ins-msg-focus" title={turn.sourcePath}>
                {previousTurn ? t('turn.focusChanged', { focus: focusLabel }) : focusLabel}
              </span>
            ) : null}
            <span>{panelFormatRunListTime(turn.createdAt, Date.now())}</span>
            <button className="ai-ins-msg-link" onClick={() => setAgentPromptTurnIndex(turn.index)} type="button">
              {t('turn.fullPrompt')}
            </button>
          </div>
        </div>
        <article className={`ai-ins-msg-card ai-ins-msg-card-${tone}${collapsed ? ' ai-ins-msg-card-collapsed' : ''}`}>
          <header className="ai-ins-msg-card-head">
            <span className="ai-ins-msg-avatar" aria-hidden="true" />
            <span className="ai-ins-msg-author">{run.providerLabel}</span>
            {turn.resumed ? <span className="ai-ins-turn-tag">{t('turn.resumed')}</span> : null}
            {turn.permissionMode === 'full' ? <span className="ai-ins-turn-tag ai-ins-turn-tag-warn">{t('turn.fullAccess')}</span> : null}
            <span className={`ai-ins-turn-status ai-ins-turn-status-${tone}`}>{waiting ? t('permission.waiting') : panelGetTurnStatusLabel(turn)}</span>
            {duration ? <span className="ai-ins-msg-duration" title={t('turn.duration')}>{duration}</span> : null}
            {working ? <PanelLoadingSpinner /> : null}
            <span className="ai-ins-msg-turn">{t('turn.index', { index: turn.index + 1 })}</span>
          </header>
          {working ? null : renderThinking(run, turn, key, false)}
          <div className="ai-ins-msg-card-body">
            {output ? (
              <PanelOutputViewer live={working} onOpenFile={onOpenFile} value={output} />
            ) : working ? null : (
              <p className="ai-ins-msg-waiting">{t('turn.noOutput')}</p>
            )}
            {working ? renderThinking(run, turn, key, true) : null}
          </div>
          {collapsible ? (
            <button className="ai-ins-msg-toggle" onClick={() => toggleTurnExpanded(toggleKey)} type="button">
              {collapsed ? t('turn.expandAll', { count: lineCount }) : t('turn.collapse')}
            </button>
          ) : null}
          {pendingPermissions.map((request) => renderPermissionRequest(run, request))}
          {renderChangedFiles(key, run, turn)}
          {canRetry ? (
            <div className="ai-ins-msg-actions">
              <span>{t(turn.stopped ? 'turn.stoppedNote' : turn.interrupted ? 'turn.interruptedNote' : 'turn.failedNote')}</span>
              <button className="ai-ins-button ai-ins-button-small" onClick={() => onRetryTurn(run, turn)} type="button">
                {t('turn.retry')}
              </button>
            </div>
          ) : null}
        </article>
      </section>
    )
  }

  /**
   * Live: one line at the bottom of a running turn that says what the agent is
   * doing right now (waiting for the model, or thinking plus its latest line).
   * Settled: the reasoning folds into "Thought for 12s" at the top of the card.
   */
  function renderThinking(run: AgentRun, turn: AgentRunTurn, key: string, working: boolean) {
    const thinking = turn.thinking?.trim() || ''
    // While the turn runs the line never disappears: tool calls and pauses
    // between replies would otherwise look like nothing is happening.
    const live = working
    if (!live && !thinking) return null

    const thinkingKey = `${key}:thinking`
    const open = Boolean(thinking) && expandedTurns.has(thinkingKey)
    const latestLine = live && turn.thinkingSince ? thinking.split('\n').map((line) => line.trim()).filter(Boolean).pop() || '' : ''
    // Startup lines ([system] …) fold into diagnostics, so they do not count as a reply yet.
    const hasVisibleReply = Boolean(turn.output.replace(/^\[system\].*$/gmu, '').trim())
    const label = live
      ? turn.thinkingSince
        ? t('thinking.live')
        : hasVisibleReply
          ? t('thinking.working', { provider: run.providerLabel })
          : t('thinking.waiting', { provider: run.providerLabel })
      : turn.thinkingMs && turn.thinkingMs >= 1000
        ? t('thinking.done', { duration: panelFormatDuration(turn.thinkingMs) })
        : t('thinking.title')

    return (
      <div className={`ai-ins-thinking${live ? ' ai-ins-thinking-live' : ''}${open ? ' ai-ins-thinking-open' : ''}`}>
        <button aria-expanded={thinking ? open : undefined} className="ai-ins-thinking-head" disabled={!thinking} onClick={() => toggleTurnExpanded(thinkingKey)} type="button">
          {live ? <span className="ai-ins-thinking-pulse" aria-hidden="true" /> : null}
          <span className="ai-ins-thinking-label">{label}</span>
          {latestLine && !open ? <span className="ai-ins-thinking-snippet">{latestLine}</span> : null}
          {thinking ? <Icon paths={chevronDownIcon} /> : null}
        </button>
        {open ? <div className="ai-ins-thinking-body">{thinking}</div> : null}
      </div>
    )
  }

  function renderPermissionRequest(run: AgentRun, request: PermissionRequest) {
    const detail = panelDescribePermissionInput(request.input)
    return (
      <div className="ai-ins-permission" key={request.id} role="group" aria-label={t('permission.title', { provider: run.providerLabel })}>
        <div className="ai-ins-permission-head">
          <span className="ai-ins-permission-mark" aria-hidden="true" />
          <strong>{t('permission.title', { provider: run.providerLabel })}</strong>
        </div>
        <div className="ai-ins-permission-tool">{t('permission.tool', { tool: panelFormatToolName(request.toolName) })}</div>
        {detail ? <pre className="ai-ins-permission-input">{detail}</pre> : null}
        <div className="ai-ins-permission-actions">
          <button className="ai-ins-button ai-ins-button-primary ai-ins-button-small" onClick={() => onAnswerPermission(run, request, 'allow')} type="button">
            {t('permission.allow')}
          </button>
          <button className="ai-ins-button ai-ins-button-small" onClick={() => onAnswerPermission(run, request, 'always')} type="button">
            {t('permission.always')}
          </button>
          <button className="ai-ins-button ai-ins-button-small ai-ins-button-danger" onClick={() => onAnswerPermission(run, request, 'deny')} type="button">
            {t('permission.deny')}
          </button>
        </div>
      </div>
    )
  }

  function renderChangedFiles(key: string, run: AgentRun, turn: AgentRunTurn) {
    const files = turn.changedFiles
    // Undefined: not a git work tree, or the turn has not settled yet.
    if (!files || !turn.completed) {
      return null
    }

    if (!files.length) {
      return <div className="ai-ins-msg-files ai-ins-msg-files-empty">{t('files.none')}</div>
    }

    const filesKey = `${key}:files`
    const showAll = expandedTurns.has(filesKey) || files.length <= panelVisibleChangedFiles
    const visibleFiles = showAll ? files : files.slice(0, panelVisibleChangedFiles)

    return (
      <div className="ai-ins-msg-files">
        <div className="ai-ins-msg-files-head">{t('files.changed', { count: files.length })}</div>
        <ul>
          {visibleFiles.map((file) => {
            const diffKey = `${key}:diff:${file.path}`
            // Turns recorded before diffs were kept: the row opens the file, as it used to.
            const hasDiff = file.additions !== undefined || file.binary === true
            const open = hasDiff && expandedTurns.has(diffKey)
            const displayPath = getDisplayPath(file.path)
            return (
              <li className={open ? 'ai-ins-msg-file-open' : undefined} key={file.path}>
                <div className="ai-ins-msg-file-row">
                  <button
                    aria-expanded={hasDiff ? open : undefined}
                    className="ai-ins-msg-file"
                    disabled={!hasDiff && file.status === 'deleted'}
                    onClick={() => (hasDiff ? toggleTurnExpanded(diffKey) : onOpenFile(file.path))}
                    title={
                      hasDiff
                        ? t('files.showDiff', { path: displayPath })
                        : file.status === 'deleted'
                          ? t('files.deletedTitle', { path: file.path })
                          : t('files.open', { path: file.path })
                    }
                    type="button"
                  >
                    {hasDiff ? (
                      <span className="ai-ins-msg-file-chevron">
                        <Icon paths={chevronRightIcon} />
                      </span>
                    ) : null}
                    <span className={`ai-ins-msg-file-status ai-ins-msg-file-status-${file.status}`} title={t(panelChangeStatusTitleKeys[file.status])}>
                      {panelChangeStatusLabels[file.status]}
                    </span>
                    <span className="ai-ins-msg-file-path">{displayPath}</span>
                    {file.additions !== undefined && !file.binary ? (
                      <span className="ai-ins-msg-file-stat">
                        {file.additions ? <span className="ai-ins-msg-file-add">+{file.additions}</span> : null}
                        {file.deletions ? <span className="ai-ins-msg-file-del">−{file.deletions}</span> : null}
                      </span>
                    ) : null}
                  </button>
                  {file.status !== 'deleted' ? (
                    <button
                      aria-label={t('files.open', { path: file.path })}
                      className="ai-ins-icon-button ai-ins-msg-file-ide"
                      onClick={() => onOpenFile(file.path)}
                      title={t('files.open', { path: file.path })}
                      type="button"
                    >
                      <Icon paths={externalLinkIcon} />
                    </button>
                  ) : null}
                </div>
                {open ? <FileDiff cacheKey={diffKey} load={() => onLoadFileDiff(run, turn, file.path)} /> : null}
              </li>
            )
          })}
        </ul>
        {files.length > panelVisibleChangedFiles ? (
          <button className="ai-ins-msg-link" onClick={() => toggleTurnExpanded(filesKey)} type="button">
            {showAll ? t('files.collapse') : t('files.more', { count: files.length - panelVisibleChangedFiles })}
          </button>
        ) : null}
      </div>
    )
  }


  function renderTranscript(expandAll: boolean) {
    if (!selectedRun) {
      return null
    }

    if (!selectedRun.outputLoaded) {
      return (
        <div className="ai-ins-chat-empty">
          <p>{selectedRun.detailLoading ? t('empty.loadingTranscript') : t('empty.transcriptNotLoaded')}</p>
        </div>
      )
    }

    return (
      <>
        {selectedRunTurns.map((turn, index) =>
          renderTurn(selectedRun, turn, selectedRunTurns[index - 1], index === selectedRunTurns.length - 1, expandAll),
        )}
        {queuedPrompt && !expandAll ? (
          <div className="ai-ins-msg-user ai-ins-msg-user-queued">
            <div className="ai-ins-msg-bubble">{queuedPrompt}</div>
            <div className="ai-ins-msg-meta">
              <span>{t('turn.queued')}</span>
              <button className="ai-ins-msg-link" onClick={onCancelQueued} type="button">
                {t('turn.withdraw')}
              </button>
            </div>
          </div>
        ) : null}
      </>
    )
  }

  function renderNewConversationIntro() {
    return (
      <div className="ai-ins-chat-empty">
        <span className="ai-ins-brand-mark ai-ins-chat-empty-mark" aria-hidden="true">
          <span className="ai-ins-brand-diamond" />
          <span className="ai-ins-brand-spark" />
        </span>
        {hasTarget ? (
          <>
            <p className="ai-ins-chat-empty-title">{t('empty.newTitle')}</p>
            <p>
              {t('empty.focus')}
              <code title={targetTitle}>{targetLabel}</code>
            </p>
            <p>{t('empty.newWithTarget')}</p>
          </>
        ) : (
          <>
            <p className="ai-ins-chat-empty-title">{runsLoading ? t('sidebar.loading') : t('empty.startTitle')}</p>
            <p>{t('empty.pickHint')}</p>
            {runs.length ? <p>{t('empty.historyHint')}</p> : null}
          </>
        )}
      </div>
    )
  }

  return (
    <div className="ai-ins-panel" data-busy={runs.some(panelIsRunWorking)} data-theme={theme} lang={locale}>
      <div className="ai-ins-body">
        <aside aria-label={t('sidebar.history')} className="ai-ins-sidebar">
          {/* The brand heads the sidebar; its bottom edge lines up with the chat header's. */}
          <div className="ai-ins-heading">
            <span className="ai-ins-brand-mark" aria-hidden="true">
              <span className="ai-ins-brand-diamond" />
              <span className="ai-ins-brand-spark" />
            </span>
            <p className="ai-ins-title">AI Ins</p>
            <div aria-label={t('sidebar.view')} className="ai-ins-view-tabs" role="tablist">
              {(['runs', 'changes'] as const).map((view) => (
                <button
                  aria-selected={sidebarView === view}
                  className="ai-ins-view-tab"
                  key={view}
                  onClick={() => {
                    setSidebarView(view)
                    savePanelSidebarView(view)
                    if (view === 'changes') refreshWorkspaceChanges()
                  }}
                  role="tab"
                  type="button"
                >
                  {view === 'runs' ? t('sidebar.viewRuns') : t('sidebar.viewChanges')}
                  {view === 'changes' && changedFileCount ? <span className="ai-ins-view-tab-count">{changedFileCount}</span> : null}
                </button>
              ))}
            </div>
          </div>
          {sidebarView === 'changes' ? renderChangesList() : renderRunsSidebar()}
        </aside>
        {renderRunMenu()}

        {selectedChange ? renderChangeDetail(selectedChange) : (
        <main className="ai-ins-main ai-ins-chat">
          <header className="ai-ins-chat-head">
            {selectedRun ? (
              <>
                <div className="ai-ins-chat-head-copy">
                  <p className="ai-ins-detail-title" title={panelGetRunTitle(selectedRun, getDisplayPath)}>
                    {panelGetRunTitle(selectedRun, getDisplayPath)}
                  </p>
                  <div className="ai-ins-detail-subtitle" title={`${selectedRun.sourcePath}\n${t('chat.logTitle', { log: selectedRun.logPath })}`}>
                    {t('chat.subtitle', {
                      focus: panelGetRunFocusLabel(selectedRun, getDisplayPath),
                      log: selectedRunLogLabel,
                      provider: selectedRun.providerLabel,
                      turns: t('sidebar.turnCount', { count: selectedRun.turns.length }),
                    })}
                  </div>
                </div>
                <div className="ai-ins-detail-actions">
                  <span className={`ai-ins-pill ai-ins-pill-${panelGetRunTone(selectedRun)}`}>
                    {panelGetRunStateLabel(selectedRun)}
                  </span>
                  <IconButton label={t('chat.expand')} onClick={() => setOutputExpanded(true)}>
                    <Icon paths={maximizeIcon} />
                  </IconButton>
                  {selectedRunWorking ? (
                    <button
                      className="ai-ins-button ai-ins-button-small ai-ins-button-stop"
                      disabled={selectedRun.stopping}
                      onClick={() => onStopRun(selectedRun)}
                      title={t('chat.stopTitle')}
                      type="button"
                    >
                      <span className="ai-ins-stop-mark" aria-hidden="true" />
                      {selectedRun.stopping ? t('status.stopping') : t('chat.stop')}
                    </button>
                  ) : null}
                  <button className="ai-ins-button ai-ins-button-danger ai-ins-button-small" onClick={() => onDeleteRun(selectedRun)} type="button">
                    {t('chat.delete')}
                  </button>
                </div>
              </>
            ) : (
              <div className="ai-ins-chat-head-copy">
                <p className="ai-ins-detail-title">{t('chat.newConversation')}</p>
                <div className="ai-ins-detail-subtitle">{t('chat.newConversationHint', { provider: provider?.label || 'Agent' })}</div>
              </div>
            )}
            {/* Panel-wide controls, after the conversation's own, past a hairline. */}
            {renderPanelActions()}
          </header>

          <div className="ai-ins-chat-scroll-wrap">
            <div className="ai-ins-chat-scroll" onScroll={handleOutputScroll} ref={outputRef}>
              {selectedRun ? renderTranscript(false) : renderNewConversationIntro()}
            </div>
            {selectedRun && outputDetachedFromBottom ? (
              <button className="ai-ins-output-follow" onClick={() => handleFollowOutputBottom(false)} type="button">
                <Icon paths={arrowDownIcon} />
                <span>{t('chat.followLatest')}</span>
              </button>
            ) : null}
          </div>

          <form
            className="ai-ins-composer"
            onSubmit={(event) => {
              event.preventDefault()
              void onSubmit()
            }}
          >
            {repointRun?.canResume ? (
              <p className="ai-ins-composer-note">
                {t('composer.repointQuestion')}
                <button className="ai-ins-msg-link" onClick={onContinueWithTarget} type="button">
                  {t('composer.repointAction', { title: panelTruncate(panelGetRunTitle(repointRun, getDisplayPath), 24) })}
                </button>
              </p>
            ) : null}
            {continueBlocked ? <p className="ai-ins-composer-note ai-ins-composer-note-warn">{continueBlockedReason}</p> : null}
            {selectedRun?.pendingPermissions?.length ? (
              <p className="ai-ins-composer-note ai-ins-composer-note-warn">{t('permission.waitingNote', { provider: selectedRun.providerLabel })}</p>
            ) : null}
            {queueing && !queuedPrompt && !selectedRun?.pendingPermissions?.length ? (
              <p className="ai-ins-composer-note">{t('composer.queueingNote', { provider: selectedRun?.providerLabel || 'Agent' })}</p>
            ) : null}
            {continuing && repointed ? <p className="ai-ins-composer-note">{t('composer.repointedNote')}</p> : null}

            <div className={`ai-ins-composer-box${continueBlocked ? ' ai-ins-composer-box-blocked' : ''}`}>
              <div className="ai-ins-target" title={targetTitle}>
                <span className={`ai-ins-target-badge${continuing ? ' ai-ins-target-badge-continue' : ''}`}>
                  {continuing ? t('composer.badgeContinue', { index: selectedRunTurns.length + 1 }) : t('composer.badgeNew')}
                </span>
                <span className="ai-ins-target-text">{targetLabel}</span>
                <span className="ai-ins-target-actions">
                  <IconButton disabled={!hasTarget} label={copied ? t('composer.copied') : t('composer.copyLocation')} onClick={() => void handleCopyTarget()} success={copied}>
                    <Icon paths={copied ? checkIcon : copyIcon} />
                  </IconButton>
                  <IconButton disabled={!hasTarget} label={t('composer.openInIde')} onClick={() => void onOpenInEditor()}>
                    <Icon paths={codeIcon} />
                  </IconButton>
                </span>
              </div>

              <textarea
                className="ai-ins-textarea"
                onChange={(event) => handlePromptChange(event.target.value)}
                onKeyDown={handlePromptKeyDown}
                placeholder={
                  continuing
                    ? t('composer.placeholderContinue')
                    : hasTarget
                      ? t('composer.placeholderNew')
                      : t('composer.placeholderPick')
                }
                rows={3}
                value={prompt}
              />

              <div className="ai-ins-composer-toolbar">
                <PanelSelect
                  ariaLabel="Agent"
                  disabled={continuing}
                  onChange={onProviderChange}
                  options={providerOptions}
                  title={providerSwitchTitle}
                  value={provider?.id || providerId}
                />
                {provider && !provider.enabled ? (
                  // Standing problem: say it where the user is about to send, not in a toast.
                  <span className="ai-ins-proxy-chip ai-ins-proxy-chip-warn ai-ins-composer-warning" title={provider.disabledReason || t('status.agentNotConfigured')}>
                    <span>{provider.disabledReason || t('status.agentNotConfigured')}</span>
                  </span>
                ) : (
                  renderProxyChip()
                )}
                <button
                  className="ai-ins-button ai-ins-button-primary ai-ins-send-button"
                  disabled={submitDisabled}
                  title={`${submitLabel} · ${submitShortcutLabel}`}
                  type="submit"
                >
                  {submitLabel}
                  <span className="ai-ins-kbd">{submitShortcutLabel}</span>
                </button>
              </div>
            </div>
            {/* Transient news floats over the composer, so nothing below it ever shifts. */}
            {status ? (
              <div className="ai-ins-toast" role="status">
                <span>{status}</span>
                <button aria-label={t('settings.close')} className="ai-ins-toast-close" onClick={onDismissStatus} type="button">
                  <Icon paths={closeIcon} />
                </button>
              </div>
            ) : null}
          </form>
        </main>
        )}
      </div>
      {selectedRun && agentPromptTurn ? (
        <div className="ai-ins-output-modal" onClick={() => setAgentPromptTurnIndex(undefined)}>
          <div
            aria-label={t('modal.promptAria', { provider: selectedRun.providerLabel })}
            aria-modal="true"
            className="ai-ins-output-modal-panel ai-ins-agent-prompt-modal-panel"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                // Close only this dialog: the overlay's own Escape listener would close the panel.
                event.stopPropagation()
                event.nativeEvent.stopImmediatePropagation()
                setAgentPromptTurnIndex(undefined)
              }
            }}
            ref={agentPromptModalRef}
            role="dialog"
            tabIndex={-1}
          >
            <div className="ai-ins-output-modal-head">
              <div>
                <p className="ai-ins-output-modal-title">
                  {t('modal.promptTitle', { index: agentPromptTurn.index + 1, provider: selectedRun.providerLabel })}
                </p>
                <div className="ai-ins-output-modal-subtitle">{panelGetRunTitle(selectedRun, getDisplayPath)}</div>
              </div>
              <div className="ai-ins-detail-actions">
                <button className="ai-ins-button" onClick={() => setAgentPromptTurnIndex(undefined)} type="button">
                  {t('panel.close')}
                </button>
              </div>
            </div>
            <div className="ai-ins-agent-prompt ai-ins-agent-prompt-modal">
              <p>
                {selectedRunAgentPrompt
                  ? agentPromptTurn.resumed
                    ? t('modal.promptResumed')
                    : t('modal.promptFirst', { provider: selectedRun.providerLabel })
                  : t('modal.promptMissing', { log: selectedRunLogLabel })}
              </p>
              <div className="ai-ins-output-code-block ai-ins-agent-prompt-code-block">
                <pre>
                  <code>{selectedRunAgentPrompt || t('modal.logFile', { log: selectedRunLogLabel })}</code>
                </pre>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {selectedRun && outputExpanded ? (
        <div className="ai-ins-output-modal" onClick={() => setOutputExpanded(false)}>
          <div
            aria-label={t('chat.expand')}
            aria-modal="true"
            className="ai-ins-output-modal-panel"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation()
                event.nativeEvent.stopImmediatePropagation()
                setOutputExpanded(false)
              }
            }}
            role="dialog"
          >
            <div className="ai-ins-output-modal-head">
              <div>
                <p className="ai-ins-output-modal-title">{panelGetRunTitle(selectedRun, getDisplayPath)}</p>
                <div className="ai-ins-output-modal-subtitle">
                  {t('modal.transcriptSubtitle', { provider: selectedRun.providerLabel, turns: t('sidebar.turnCount', { count: selectedRun.turns.length }) })}
                </div>
              </div>
              <div className="ai-ins-detail-actions">
                <span className={`ai-ins-pill ai-ins-pill-${panelGetRunTone(selectedRun)}`}>
                  {panelGetRunStateLabel(selectedRun)}
                </span>
                <IconButton label={t('panel.collapse')} onClick={() => setOutputExpanded(false)}>
                  <Icon paths={minimizeIcon} />
                </IconButton>
              </div>
            </div>
            <div
              className="ai-ins-chat-scroll ai-ins-output-expanded"
              onScroll={handleOutputModalScroll}
              ref={outputModalRef}
              tabIndex={-1}
            >
              {renderTranscript(true)}
            </div>
            {outputModalDetachedFromBottom ? (
              <button className="ai-ins-output-follow ai-ins-output-follow-expanded" onClick={() => handleFollowOutputBottom(true)} type="button">
                <Icon paths={arrowDownIcon} />
                <span>{t('chat.followLatest')}</span>
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
