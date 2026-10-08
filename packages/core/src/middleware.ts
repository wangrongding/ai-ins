import { startAgentTurn } from './agent-runner'
import { applySessionIdToArgs, createSessionId } from './agent-session'
import { getOpenInEditorCommand, resolveCommand, resolveLaunchEditor, shouldUseShellForCommand } from './editor'
import { getClientAgentProviders, getDefaultAgentProviderId, resolveAgentProviders } from './providers'
import { getConfiguredCodexProxy, normalizeProxy } from './proxy'
import {
  appendAiInsRunTurn,
  aiInsRuns,
  bumpAiInsRunsVersion,
  getAiInsRunsVersion,
  createAiInsRun,
  getAiInsRunResumeBlockedCode,
  getAiInsRunSummary,
  sendAiInsEvent,
} from './run-store'
import {
  applyPermissionArgs,
  cancelPendingPermissions,
  defaultPermissionMode,
  getPermissionMcpConfig,
  parsePermissionMode,
  resolvePermissionMode,
} from './permissions'
import { ensureAiInsRunHistoryLoaded, getAiInsRunActivityAt, pruneAiInsRunHistory, removeAiInsRunHistory } from './run-history'
import {
  buildAgentPrompt,
  buildFollowUpAgentPrompt,
  getDisplayPath,
  getLayerNameForTarget,
  getLayerSummary,
  getSourceContext,
  getSourceRangeForTarget,
  isPathInsideRoot,
  parseOpenInEditorTarget,
  readRequestBody,
} from './source'
import { spawn } from 'child_process'
import { existsSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import type { ServerResponse } from 'http'
import type { AiInsMiddleware, AiInsPluginOptions, AiInsRun, ResolvedAiInsAgentProvider } from './types'


type AiInsProxyMode = 'custom' | 'off' | 'system'

function parseProxyMode(value: unknown): AiInsProxyMode | undefined {
  return value === 'custom' || value === 'off' || value === 'system' ? value : undefined
}

function getRevealInFolderCommand(fileName: string) {
  if (process.platform === 'darwin') {
    return { args: ['-R', fileName], command: 'open' }
  }

  if (process.platform === 'win32') {
    return { args: [`/select,${fileName}`], command: 'explorer.exe' }
  }

  return { args: [dirname(fileName)], command: 'xdg-open' }
}

export function aiInsEventsMiddleware(root?: string): AiInsMiddleware {
  return (req, res) => {
    if (req.method !== 'GET') {
      res.statusCode = 405
      res.end('method not allowed')
      return
    }

    if (root) {
      ensureAiInsRunHistoryLoaded(root)
    }

    const requestUrl = req.url ? new URL(req.url, 'http://localhost') : null
    const runId = requestUrl?.searchParams.get('id') || ''
    const run = aiInsRuns.get(runId)

    if (!run) {
      res.statusCode = 404
      res.end('AI Ins run not found')
      return
    }

    // A run that took another turn reopens its stream. Without a cursor the
    // client would replay — and re-append — every event of the earlier turns.
    const rawSince = Number(requestUrl?.searchParams.get('since') || '0')
    const since = Number.isFinite(rawSince) && rawSince > 0 ? rawSince : 0

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders()
    res.write(': connected\n\n')

    run.subscribers.add(res)
    for (const event of run.events) {
      if ((event.seq ?? 0) > since) {
        sendAiInsEvent(res, event)
      }
    }

    if (run.completed) {
      run.subscribers.delete(res)
      res.end()
      return
    }

    req.on('close', () => {
      run.subscribers.delete(res)
    })
  }
}

function stopAndForgetRun(runId: string, run: AiInsRun) {
  if (!run.completed) {
    run.child?.kill('SIGTERM')
  }

  cancelPendingPermissions(run)

  for (const subscriber of run.subscribers) {
    subscriber.end()
  }

  aiInsRuns.delete(runId)
  removeAiInsRunHistory(runId, run)
  bumpAiInsRunsVersion()
}

// Give the agent a moment to exit cleanly on SIGTERM before forcing it.
const stopGraceMs = 4000

function stopRunningTurn(run: AiInsRun) {
  const child = run.child
  if (run.completed || !child) {
    return false
  }

  run.stopRequested = true
  cancelPendingPermissions(run)
  child.kill('SIGTERM')
  const forceTimer = setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL')
    }
  }, stopGraceMs)
  ;(forceTimer as unknown as { unref?: () => void }).unref?.()
  return true
}

/**
 * Errors the panel shows to the user carry a message key (plus params) so they
 * appear in the panel's language; other clients still get a readable body.
 */
function sendPanelError(res: ServerResponse, error: string, params: Record<string, string> = {}, statusCode = 409) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify({ error, params }))
}

export function aiInsRunsMiddleware(root: string): AiInsMiddleware {
  return (req, res) => {
    const requestUrl = req.url ? new URL(req.url, 'http://localhost') : null
    const runId = requestUrl?.searchParams.get('id') || ''
    ensureAiInsRunHistoryLoaded(root)

    if (req.method === 'GET') {
      res.setHeader('Content-Type', 'application/json')

      if (runId) {
        const run = aiInsRuns.get(runId)
        if (!run || run.root !== root) {
          res.statusCode = 404
          res.end(JSON.stringify({ message: 'AI Ins run not found' }))
          return
        }

        res.end(JSON.stringify({ run: getAiInsRunSummary(runId, run, root) }))
        return
      }

      const version = getAiInsRunsVersion()
      if (requestUrl?.searchParams.get('version') === String(version)) {
        res.end(JSON.stringify({ unchanged: true, version }))
        return
      }

      // Only live runs carry their output in the list: the panel streams those
      // and needs a consistent starting point. Settled transcripts can be large
      // and are fetched one at a time when the user opens them.
      const runs = [...aiInsRuns.entries()]
        .filter(([, run]) => run.root === root)
        .sort(([, firstRun], [, secondRun]) => getAiInsRunActivityAt(secondRun) - getAiInsRunActivityAt(firstRun))
        .map(([id, run]) => getAiInsRunSummary(id, run, root, !run.completed))

      res.end(JSON.stringify({ runs, version }))
      return
    }

    if (req.method === 'POST' && requestUrl?.searchParams.get('action') === 'stop') {
      const run = aiInsRuns.get(runId)
      if (!run || run.root !== root) {
        res.statusCode = 404
        res.end('AI Ins run not found')
        return
      }

      if (!stopRunningTurn(run)) {
        res.statusCode = 409
        sendPanelError(res, 'error.notRunning')
        return
      }

      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ success: true }))
      return
    }

    if (req.method === 'DELETE') {
      if (requestUrl?.searchParams.get('scope') === 'finished') {
        const removedIds: string[] = []
        for (const [id, run] of [...aiInsRuns.entries()]) {
          if (run.root === root && run.completed) {
            stopAndForgetRun(id, run)
            removedIds.push(id)
          }
        }

        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ removedIds, success: true }))
        return
      }

      const run = aiInsRuns.get(runId)

      if (!run || run.root !== root) {
        res.statusCode = 404
        res.end('AI Ins run not found')
        return
      }

      stopAndForgetRun(runId, run)
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ success: true }))
      return
    }

    res.statusCode = 405
    res.end('method not allowed')
  }
}

export function aiInsConfigMiddleware(root: string, options: AiInsPluginOptions, pluginProxy: string): AiInsMiddleware {
  return (_req, res) => {
    const providers = getClientAgentProviders(root, options, pluginProxy)

    res.setHeader('Content-Type', 'application/json')
    res.end(
      JSON.stringify({
        defaultProvider: getDefaultAgentProviderId(providers, options.agents?.defaultProvider),
        defaultProxy: getConfiguredCodexProxy(pluginProxy),
        providers,
        root,
      }),
    )
  }
}

type AiInsAgentRequest = {
  file?: unknown
  layers?: unknown
  permissionMode?: unknown
  prompt?: unknown
  provider?: unknown
  proxy?: unknown
  proxyMode?: unknown
  resumeRunId?: unknown
}

type RequestProxyResult = { ok: false; message: string } | { ok: true; proxy: string; proxyModeSet: boolean }

function resolveRequestProxy(payload: AiInsAgentRequest, provider: ResolvedAiInsAgentProvider): RequestProxyResult {
  const proxyMode = parseProxyMode(payload.proxyMode)
  const requestedProxy = normalizeProxy(payload.proxy)

  if (proxyMode === 'custom' && !requestedProxy) {
    return { message: 'invalid custom proxy URL', ok: false }
  }

  let proxy = requestedProxy || provider.proxy
  if (proxyMode === 'off') {
    proxy = ''
  } else if (proxyMode === 'custom') {
    proxy = requestedProxy
  } else if (proxyMode === 'system') {
    proxy = provider.proxy
  }

  return { ok: true, proxy, proxyModeSet: Boolean(proxyMode) }
}

type ResolvedAgentTarget = {
  columnNumber: number
  context: ReturnType<typeof getSourceContext>
  endColumnNumber?: number
  endLineNumber?: number
  fileName: string
  layerSummary: string
  lineNumber: number
  sourceName: string
}

type AgentTargetResult = { ok: false; message: string; status: number } | { ok: true; target: ResolvedAgentTarget }

function resolveAgentTarget(root: string, rawTarget: string, layers: unknown): AgentTargetResult {
  const { columnNumber, fileName, lineNumber } = parseOpenInEditorTarget(rawTarget, root)

  if (!isPathInsideRoot(fileName, root)) {
    return { message: `source file outside project root: ${fileName}`, ok: false, status: 403 }
  }

  if (!existsSync(fileName)) {
    return { message: `source file not found: ${fileName}`, ok: false, status: 404 }
  }

  const sourceRange = getSourceRangeForTarget(layers, fileName, lineNumber, root)

  return {
    ok: true,
    target: {
      columnNumber,
      context: getSourceContext(fileName, lineNumber, 12, sourceRange?.endLineNumber),
      endColumnNumber: sourceRange?.endColumnNumber,
      endLineNumber: sourceRange?.endLineNumber,
      fileName,
      layerSummary: getLayerSummary(layers, root),
      lineNumber,
      sourceName: getLayerNameForTarget(layers, fileName, lineNumber, root),
    },
  }
}

function toPromptTarget(target: ResolvedAgentTarget, root: string) {
  return {
    columnNumber: target.columnNumber,
    context: target.context,
    endColumnNumber: target.endColumnNumber,
    endLineNumber: target.endLineNumber,
    fileName: target.fileName,
    layerSummary: target.layerSummary,
    lineNumber: target.lineNumber,
    root,
  }
}

export function aiInsEditMiddleware(root: string, options: AiInsPluginOptions, pluginProxy: string): AiInsMiddleware {
  return async (req, res) => {
    if (req.method !== 'POST') {
      res.statusCode = 405
      res.end('method not allowed')
      return
    }

    try {
      const body = await readRequestBody(req)
      const payload = JSON.parse(body || '{}') as AiInsAgentRequest
      const rawTarget = typeof payload.file === 'string' ? payload.file : ''
      const rawPrompt = typeof payload.prompt === 'string' ? payload.prompt.trim() : ''
      const resumeRunId = typeof payload.resumeRunId === 'string' ? payload.resumeRunId.trim() : ''

      if (!rawPrompt) {
        res.statusCode = 400
        res.end('missing prompt')
        return
      }

      ensureAiInsRunHistoryLoaded(root)
      const existingRun = resumeRunId ? aiInsRuns.get(resumeRunId) : undefined
      if (resumeRunId && (!existingRun || existingRun.root !== root)) {
        res.statusCode = 404
        res.end('AI Ins run not found')
        return
      }

      const providers = resolveAgentProviders(root, options, pluginProxy)
      // A follow-up turn is pinned to the provider that owns the session; the
      // panel locks the picker to match, so a mismatch means a stale client.
      const requestedProviderId = existingRun
        ? existingRun.providerId
        : typeof payload.provider === 'string' && payload.provider.trim()
          ? payload.provider.trim()
          : getDefaultAgentProviderId(providers)
      const provider = providers.find((candidate) => candidate.id === requestedProviderId)

      if (!provider) {
        res.statusCode = 400
        res.end(`unknown AI Ins agent provider: ${requestedProviderId}`)
        return
      }

      if (!provider.enabled) {
        res.statusCode = 400
        res.end(provider.disabledReason || `${provider.label} is disabled`)
        return
      }

      const agentCommand = resolveCommand(provider.command)
      if (!agentCommand) {
        res.statusCode = 500
        res.end(`${provider.label} CLI not found: ${provider.command}`)
        return
      }

      // The panel's permission setting, narrowed to what this provider supports.
      const permissionMode = resolvePermissionMode(provider, parsePermissionMode(payload.permissionMode) ?? defaultPermissionMode)
      const requestProxy = resolveRequestProxy(payload, provider)
      if (!requestProxy.ok) {
        res.statusCode = 400
        res.end(requestProxy.message)
        return
      }

      if (existingRun) {
        const blockedCode = getAiInsRunResumeBlockedCode(existingRun)
        if (blockedCode) {
          sendPanelError(res, blockedCode, { provider: existingRun.providerLabel })
          return
        }

        const sessionId = existingRun.sessionId as string
        const previousDisplayPath = `${getDisplayPath(existingRun.sourcePath, root)}:${existingRun.lineNumber}`
        let target: ResolvedAgentTarget | undefined

        if (rawTarget) {
          const resolved = resolveAgentTarget(root, rawTarget, payload.layers)
          if (!resolved.ok) {
            res.statusCode = resolved.status
            res.end(resolved.message)
            return
          }

          target = resolved.target
        }

        const targetChanged = Boolean(
          target && (target.fileName !== existingRun.sourcePath || target.lineNumber !== existingRun.lineNumber),
        )
        const followUpPrompt = buildFollowUpAgentPrompt({
          previousDisplayPath,
          rawPrompt,
          target: targetChanged && target ? toPromptTarget(target, root) : undefined,
          turnNumber: existingRun.turns.length + 1,
        })

        const turn = appendAiInsRunTurn(resumeRunId, existingRun, {
          agentPrompt: followUpPrompt,
          fileName: targetChanged && target ? target.fileName : existingRun.sourcePath,
          lineNumber: targetChanged && target ? target.lineNumber : existingRun.lineNumber,
          permissionMode,
          prompt: rawPrompt,
          resumed: true,
          sourceName: targetChanged && target ? target.sourceName : existingRun.sourceName,
          sourcePath: targetChanged && target ? target.fileName : existingRun.sourcePath,
        })

        const resumedChild = await startAgentTurn({
          agentCommand,
          args: applyPermissionArgs(
            applySessionIdToArgs(provider.session.resumeArgs, sessionId),
            provider,
            permissionMode,
            getPermissionMcpConfig(req, resumeRunId, existingRun),
          ),
          input: provider.session.resumeInput,
          logPath: existingRun.logPath,
          prompt: followUpPrompt,
          provider,
          proxy: requestProxy.proxy,
          proxyModeSet: requestProxy.proxyModeSet,
          root,
          run: existingRun,
          runId: resumeRunId,
        })

        res.setHeader('Content-Type', 'application/json')
        res.end(
          JSON.stringify({
            agentPrompt: followUpPrompt,
            fileName: turn.sourcePath,
            lineNumber: turn.lineNumber,
            logPath: existingRun.logPath,
            pid: resumedChild.pid,
            providerId: provider.id,
            providerLabel: provider.label,
            resumed: true,
            runId: resumeRunId,
            sessionId,
            sourceName: turn.sourceName,
            success: true,
            turnIndex: turn.index,
          }),
        )
        return
      }

      if (!rawTarget) {
        res.statusCode = 400
        res.end('missing file')
        return
      }

      const targetResult = resolveAgentTarget(root, rawTarget, payload.layers)
      if (!targetResult.ok) {
        res.statusCode = targetResult.status
        res.end(targetResult.message)
        return
      }

      const target = targetResult.target
      const prompt = buildAgentPrompt({ ...toPromptTarget(target, root), rawPrompt })
      const logDirectory = join(root, '.ai-ins')
      mkdirSync(logDirectory, { recursive: true })
      const runId = `${new Date().toISOString().replace(/[:.]/gu, '-')}-${provider.id}`
      const logPath = join(logDirectory, `${runId}.log`)

      // `assign` providers let us pin the id before the process exists, which is
      // the only way to stay resumable if the run dies before printing anything.
      const sessionId = provider.session.mode === 'assign' ? createSessionId() : undefined
      const baseArgs = sessionId
        ? [...applySessionIdToArgs(provider.session.assignArgs, sessionId), ...provider.args]
        : [...provider.args]

      const run = createAiInsRun(runId, root, logPath, provider, provider.session.mode, sessionId, {
        agentPrompt: prompt,
        fileName: target.fileName,
        lineNumber: target.lineNumber,
        permissionMode,
        prompt: rawPrompt,
        resumed: false,
        sourceName: target.sourceName,
        sourcePath: target.fileName,
      })
      pruneAiInsRunHistory(root)
      // After the run exists: the permission bridge config carries its token.
      const args = applyPermissionArgs(baseArgs, provider, permissionMode, getPermissionMcpConfig(req, runId, run))

      const child = await startAgentTurn({
        agentCommand,
        args,
        input: provider.input,
        logPath,
        prompt,
        provider,
        proxy: requestProxy.proxy,
        proxyModeSet: requestProxy.proxyModeSet,
        root,
        run,
        runId,
      })

      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          agentPrompt: prompt,
          fileName: target.fileName,
          lineNumber: target.lineNumber,
          logPath,
          pid: child.pid,
          providerId: provider.id,
          providerLabel: provider.label,
          resumed: false,
          runId,
          sessionId,
          sessionMode: provider.session.mode,
          sourceName: target.sourceName,
          success: true,
          turnIndex: 0,
        }),
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('[ai-ins] AI Ins agent failed:', message)
      res.statusCode = 500
      res.end(message)
    }
  }
}

export function openInEditorMiddleware(root: string): AiInsMiddleware {
  return (req, res) => {
    const requestUrl = req.url ? new URL(req.url, 'http://localhost') : null
    const rawTarget = requestUrl?.searchParams.get('file')

    if (!rawTarget) {
      res.statusCode = 400
      res.end('missing file query parameter')
      return
    }

    const editor = resolveLaunchEditor()
    if (!editor) {
      res.statusCode = 500
      res.end('no supported editor found; set LAUNCH_EDITOR explicitly')
      return
    }

    const { columnNumber, fileName, lineNumber } = parseOpenInEditorTarget(rawTarget, root)
    if (!existsSync(fileName)) {
      res.statusCode = 404
      res.end(`source file not found: ${fileName}`)
      return
    }

    try {
      const editorCommand = getOpenInEditorCommand(editor, fileName, lineNumber, columnNumber)
      const child = spawn(editorCommand.command, editorCommand.args, {
        detached: true,
        shell: editorCommand.shell,
        stdio: ['ignore', 'ignore', 'pipe'],
        windowsVerbatimArguments: editorCommand.windowsVerbatimArguments,
      })

      let editorStderr = ''
      child.stderr?.on('data', (chunk) => {
        editorStderr = `${editorStderr}${chunk}`.slice(0, 4000)
      })

      child.on('error', (error) => {
        console.error('[ai-ins] open in editor failed:', error.message)
      })

      // The editor is detached, so a non-zero exit is the only signal that the
      // spawned command was rejected (e.g. wrong CLI flags for this editor).
      child.on('exit', (code) => {
        if (!code) {
          return
        }

        const invocation = [editorCommand.command, ...editorCommand.args].join(' ')
        console.error(`[ai-ins] open in editor exited with code ${code}: ${invocation}${editorStderr.trim() ? `\n${editorStderr.trim()}` : ''}`)
      })

      // Node types the pipe as Readable, but it is a Socket at runtime; keeping
      // it referenced would hold the event loop open after the editor exits.
      ;(child.stderr as { unref?: () => void } | null)?.unref?.()
      child.unref()
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ editor, fileName, lineNumber, columnNumber }))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('[ai-ins] open in editor failed:', message)
      res.statusCode = 500
      res.end(message)
    }
  }
}

export function revealInFolderMiddleware(root: string): AiInsMiddleware {
  return (req, res) => {
    const requestUrl = req.url ? new URL(req.url, 'http://localhost') : null
    const rawTarget = requestUrl?.searchParams.get('file')

    if (!rawTarget) {
      res.statusCode = 400
      res.end('missing file query parameter')
      return
    }

    const { fileName } = parseOpenInEditorTarget(rawTarget, root)
    if (!existsSync(fileName)) {
      res.statusCode = 404
      res.end(`source file not found: ${fileName}`)
      return
    }

    const { args, command } = getRevealInFolderCommand(fileName)

    try {
      const child = spawn(command, args, {
        detached: true,
        shell: shouldUseShellForCommand(command),
        stdio: 'ignore',
      })

      child.on('error', (error) => {
        console.error('[ai-ins] reveal in folder failed:', error.message)
      })

      child.unref()
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ command, fileName }))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('[ai-ins] reveal in folder failed:', message)
      res.statusCode = 500
      res.end(message)
    }
  }
}
