import { formatAgentJsonLine } from './agent-output'
import { getOpenInEditorCommand, resolveCommand, resolveLaunchEditor, shouldUseShellForCommand } from './editor'
import { getClientAgentProviders, getDefaultAgentProviderId, resolveAgentProviders } from './providers'
import { getAgentEnv, getConfiguredCodexProxy, normalizeProxy } from './proxy'
import { appendAiInsEvent, aiInsRuns, createAiInsRun, getAiInsRunSummary, sendAiInsEvent } from './run-store'
import {
  buildAgentPrompt,
  getLayerNameForTarget,
  getLayerSummary,
  getSourceContext,
  getSourceRangeForTarget,
  isPathInsideRoot,
  parseOpenInEditorTarget,
  readRequestBody,
} from './source'
import { spawn } from 'child_process'
import { createWriteStream, existsSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import type { AiInsMiddleware, AiInsPluginOptions } from './types'

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

export function aiInsEventsMiddleware(): AiInsMiddleware {
  return (req, res) => {
    if (req.method !== 'GET') {
      res.statusCode = 405
      res.end('method not allowed')
      return
    }

    const requestUrl = req.url ? new URL(req.url, 'http://localhost') : null
    const runId = requestUrl?.searchParams.get('id') || ''
    const run = aiInsRuns.get(runId)

    if (!run) {
      res.statusCode = 404
      res.end('AI Ins run not found')
      return
    }

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders()
    res.write(': connected\n\n')

    run.subscribers.add(res)
    for (const event of run.events) {
      sendAiInsEvent(res, event)
    }

    if (run.completed) {
      res.end()
      return
    }

    req.on('close', () => {
      run.subscribers.delete(res)
    })
  }
}

export function aiInsRunsMiddleware(root: string): AiInsMiddleware {
  return (req, res) => {
    const requestUrl = req.url ? new URL(req.url, 'http://localhost') : null

    if (req.method === 'GET') {
      const runs = [...aiInsRuns.entries()]
        .sort(([, firstRun], [, secondRun]) => secondRun.createdAt - firstRun.createdAt)
        .map(([runId, run]) => getAiInsRunSummary(runId, run, root))

      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ runs }))
      return
    }

    if (req.method === 'DELETE') {
      const runId = requestUrl?.searchParams.get('id') || ''
      const run = aiInsRuns.get(runId)

      if (!run) {
        res.statusCode = 404
        res.end('AI Ins run not found')
        return
      }

      if (!run.completed) {
        run.child?.kill('SIGTERM')
      }

      for (const subscriber of run.subscribers) {
        subscriber.end()
      }

      aiInsRuns.delete(runId)
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

export function aiInsEditMiddleware(root: string, options: AiInsPluginOptions, pluginProxy: string): AiInsMiddleware {
  return async (req, res) => {
    if (req.method !== 'POST') {
      res.statusCode = 405
      res.end('method not allowed')
      return
    }

    try {
      const body = await readRequestBody(req)
      const payload = JSON.parse(body || '{}') as {
        file?: unknown
        layers?: unknown
        prompt?: unknown
        provider?: unknown
        proxy?: unknown
        proxyMode?: unknown
      }
      const rawTarget = typeof payload.file === 'string' ? payload.file : ''
      const rawPrompt = typeof payload.prompt === 'string' ? payload.prompt.trim() : ''
      const providers = resolveAgentProviders(root, options, pluginProxy)
      const requestedProviderId =
        typeof payload.provider === 'string' && payload.provider.trim() ? payload.provider.trim() : getDefaultAgentProviderId(providers)
      const provider = providers.find((candidate) => candidate.id === requestedProviderId)

      if (!rawTarget) {
        res.statusCode = 400
        res.end('missing file')
        return
      }

      if (!rawPrompt) {
        res.statusCode = 400
        res.end('missing prompt')
        return
      }

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

      const proxyMode = parseProxyMode(payload.proxyMode)
      const requestedProxy = normalizeProxy(payload.proxy)
      if (proxyMode === 'custom' && !requestedProxy) {
        res.statusCode = 400
        res.end('invalid custom proxy URL')
        return
      }

      let proxy = requestedProxy || provider.proxy
      if (proxyMode === 'off') {
        proxy = ''
      } else if (proxyMode === 'custom') {
        proxy = requestedProxy
      } else if (proxyMode === 'system') {
        proxy = provider.proxy
      }

      const { columnNumber, fileName, lineNumber } = parseOpenInEditorTarget(rawTarget, root)
      if (!isPathInsideRoot(fileName, root)) {
        res.statusCode = 403
        res.end(`source file outside project root: ${fileName}`)
        return
      }

      if (!existsSync(fileName)) {
        res.statusCode = 404
        res.end(`source file not found: ${fileName}`)
        return
      }

      const sourceRange = getSourceRangeForTarget(payload.layers, fileName, lineNumber, root)
      const context = getSourceContext(fileName, lineNumber, 12, sourceRange?.endLineNumber)
      const layerSummary = getLayerSummary(payload.layers, root)
      const sourceName = getLayerNameForTarget(payload.layers, fileName, lineNumber, root)
      const prompt = buildAgentPrompt({
        columnNumber,
        context,
        endColumnNumber: sourceRange?.endColumnNumber,
        endLineNumber: sourceRange?.endLineNumber,
        fileName,
        layerSummary,
        lineNumber,
        rawPrompt,
        root,
      })

      const logDirectory = join(root, '.ai-ins')
      mkdirSync(logDirectory, { recursive: true })
      const runId = `${new Date().toISOString().replace(/[:.]/gu, '-')}-${provider.id}`
      const logPath = join(logDirectory, `${runId}.log`)
      const logStream = createWriteStream(logPath, { flags: 'a' })
      const args = [...provider.args]
      if (provider.input === 'argument') {
        args.push(prompt)
      }

      logStream.write(`$ ${agentCommand} ${provider.input === 'argument' ? `${provider.args.join(' ')} <prompt>` : args.join(' ')}\n\n${prompt}\n\n`)
      if (proxy) {
        logStream.write(`[ai-ins] using proxy ${proxy}\n\n`)
      }
      createAiInsRun(runId, logPath, provider, {
        agentPrompt: prompt,
        fileName,
        lineNumber,
        prompt: rawPrompt,
        sourceName,
        sourcePath: fileName,
      })

      const child = spawn(agentCommand, args, {
        cwd: root,
        env: getAgentEnv(proxy, { clearProxy: Boolean(proxyMode) }),
        shell: shouldUseShellForCommand(agentCommand),
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      const run = aiInsRuns.get(runId)
      if (run) {
        run.child = child
      }
      const startedAt = Date.now()
      let completed = false
      let stdoutBuffer = ''
      const heartbeatTimer = setInterval(() => {
        if (completed) {
          return
        }

        appendAiInsEvent(runId, {
          logPath,
          message: `${provider.label} 运行中 · ${Math.max(1, Math.round((Date.now() - startedAt) / 1000))}s`,
          providerId: provider.id,
          providerLabel: provider.label,
          type: 'heartbeat',
        })
      }, 5000)
      ;(heartbeatTimer as unknown as { unref?: () => void }).unref?.()

      appendAiInsEvent(runId, {
        logPath,
        message: proxy ? `${provider.label} CLI started with proxy ${proxy}` : `${provider.label} CLI started`,
        pid: child.pid,
        providerId: provider.id,
        providerLabel: provider.label,
        type: 'status',
      })

      const appendOutput = (message: string, stream: 'stderr' | 'stdout') => {
        appendAiInsEvent(runId, {
          message,
          providerId: provider.id,
          providerLabel: provider.label,
          stream,
          type: 'output',
        })
      }
      const flushStdoutLine = (line: string) => {
        if (!line.trim()) {
          return
        }

        if (provider.output === 'plain') {
          appendOutput(`${line}\n`, 'stdout')
          return
        }

        try {
          appendOutput(formatAgentJsonLine(JSON.parse(line)), 'stdout')
        } catch {
          appendOutput(`${line}\n`, 'stdout')
        }
      }
      const flushStdoutBuffer = () => {
        if (!stdoutBuffer.trim()) {
          stdoutBuffer = ''
          return
        }

        if (provider.output === 'json') {
          try {
            appendOutput(formatAgentJsonLine(JSON.parse(stdoutBuffer)), 'stdout')
          } catch {
            appendOutput(`${stdoutBuffer}\n`, 'stdout')
          }
          stdoutBuffer = ''
          return
        }

        flushStdoutLine(stdoutBuffer)
        stdoutBuffer = ''
      }
      const handleStdout = (chunk: Buffer) => {
        const message = chunk.toString()
        logStream.write(message)
        if (provider.output === 'plain') {
          appendOutput(message, 'stdout')
          return
        }

        stdoutBuffer += message
        if (provider.output === 'json') {
          return
        }

        const lines = stdoutBuffer.split(/\r?\n/u)
        stdoutBuffer = lines.pop() ?? ''

        for (const line of lines) {
          flushStdoutLine(line)
        }
      }

      child.stdout.on('data', handleStdout)
      child.stderr.on('data', (chunk: Buffer) => {
        const message = chunk.toString()
        logStream.write(message)
        appendOutput(message, 'stderr')
      })
      child.on('error', (error) => {
        completed = true
        clearInterval(heartbeatTimer)
        const run = aiInsRuns.get(runId)
        if (run) {
          run.completed = true
        }

        logStream.write(`\n[ai-ins] ${provider.label} failed to start: ${error.message}\n`)
        appendAiInsEvent(runId, {
          message: error.message,
          providerId: provider.id,
          providerLabel: provider.label,
          type: 'error',
        })
        logStream.end()
      })
      child.on('exit', (code, signal) => {
        completed = true
        clearInterval(heartbeatTimer)
        flushStdoutBuffer()
        const run = aiInsRuns.get(runId)
        if (run) {
          run.completed = true
        }

        logStream.write(`\n[ai-ins] ${provider.label} exited with code=${code ?? 'null'} signal=${signal ?? 'null'}\n`)
        appendAiInsEvent(runId, {
          code,
          providerId: provider.id,
          providerLabel: provider.label,
          signal,
          type: 'done',
        })
        logStream.end()
      })
      if (provider.input === 'stdin') {
        child.stdin.end(prompt)
      } else {
        child.stdin.end()
      }

      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          agentPrompt: prompt,
          fileName,
          lineNumber,
          logPath,
          pid: child.pid,
          providerId: provider.id,
          providerLabel: provider.label,
          runId,
          success: true,
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
        stdio: 'ignore',
        windowsVerbatimArguments: editorCommand.windowsVerbatimArguments,
      })

      child.on('error', (error) => {
        console.error('[ai-ins] open in editor failed:', error.message)
      })

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
