import { createAgentJsonFormatter } from './agent-output'
import { readSessionIdFromEvent } from './agent-session'
import { getAgentEnv } from './proxy'
import { cancelPendingPermissions } from './permissions'
import { appendAiInsEvent, setAiInsRunSessionId } from './run-store'
import { shouldUseShellForCommand } from './editor'
import { diffWorkspaceSnapshots, takeWorkspaceSnapshot } from './workspace-changes'
import { spawn } from 'child_process'
import { createWriteStream } from 'fs'
import type { AiInsRun, ResolvedAiInsAgentProvider } from './types'

const heartbeatIntervalMs = 5000

export type AgentTurnOptions = {
  agentCommand: string
  args: string[]
  input: 'argument' | 'stdin'
  logPath: string
  prompt: string
  provider: ResolvedAiInsAgentProvider
  proxy: string
  /** True when the request pinned a proxy mode, so inherited env proxies get cleared. */
  proxyModeSet: boolean
  root: string
  run: AiInsRun
  runId: string
}

/**
 * Spawn one agent turn and wire its output into the run's event stream. Both a
 * fresh run and a follow-up turn go through here; the only difference is the
 * argument list the caller hands in.
 */
export async function startAgentTurn(options: AgentTurnOptions) {
  const { agentCommand, args, input, logPath, prompt, provider, proxy, proxyModeSet, root, run, runId } = options
  // Taken before the process exists, so every edit the agent makes shows up in
  // the diff at exit. Undefined outside a git work tree: no file list then.
  const workspaceBefore = await takeWorkspaceSnapshot(root)
  const logStream = createWriteStream(logPath, { flags: 'a' })
  const turnIndex = run.turns.length - 1

  logStream.write(
    `\n$ ${agentCommand} ${input === 'argument' ? `${args.join(' ')} <prompt>` : args.join(' ')}\n\n${prompt}\n\n`,
  )
  if (proxy) {
    logStream.write(`[ai-ins] using proxy ${proxy}\n\n`)
  }

  const child = spawn(agentCommand, input === 'argument' ? [...args, prompt] : args, {
    cwd: root,
    env: getAgentEnv(proxy, { clearProxy: proxyModeSet }),
    shell: shouldUseShellForCommand(agentCommand),
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  run.child = child

  const startedAt = Date.now()
  let completed = false
  let stdoutBuffer = ''
  const formatJsonLine = createAgentJsonFormatter(root, (text) => {
    appendAiInsEvent(runId, { message: text, providerId: provider.id, providerLabel: provider.label, turn: turnIndex, type: 'thinking' })
  })

  const heartbeatTimer = setInterval(() => {
    if (completed) {
      return
    }

    appendAiInsEvent(runId, {
      logPath,
      message: `${provider.label} running · ${Math.max(1, Math.round((Date.now() - startedAt) / 1000))}s`,
      providerId: provider.id,
      providerLabel: provider.label,
      type: 'heartbeat',
    })
  }, heartbeatIntervalMs)
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
    // Structured events can format to nothing (stream bookkeeping); the
    // process still counts as having spoken, which is what marks a session live.
    if (!message) {
      if (stream === 'stdout') {
        run.sessionStarted = true
      }
      return
    }

    appendAiInsEvent(runId, {
      message,
      providerId: provider.id,
      providerLabel: provider.label,
      stream,
      turn: turnIndex,
      type: 'output',
    })
  }

  const captureSessionId = (parsed: unknown) => {
    if (provider.session.mode !== 'capture' || run.sessionId) {
      return
    }

    const sessionId = readSessionIdFromEvent(parsed, provider.session.sessionIdKeys)
    if (sessionId) {
      setAiInsRunSessionId(runId, sessionId)
      logStream.write(`\n[ai-ins] captured session id ${sessionId}\n`)
    }
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
      const parsed = JSON.parse(line)
      captureSessionId(parsed)
      appendOutput(formatJsonLine(parsed), 'stdout')
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
        const parsed = JSON.parse(stdoutBuffer)
        captureSessionId(parsed)
        appendOutput(formatJsonLine(parsed), 'stdout')
      } catch {
        appendOutput(`${stdoutBuffer}\n`, 'stdout')
      }
      stdoutBuffer = ''
      return
    }

    flushStdoutLine(stdoutBuffer)
    stdoutBuffer = ''
  }

  child.stdout.on('data', (chunk: Buffer) => {
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
  })

  child.stderr.on('data', (chunk: Buffer) => {
    const message = chunk.toString()
    logStream.write(message)
    appendOutput(message, 'stderr')
  })

  child.on('error', (error) => {
    completed = true
    clearInterval(heartbeatTimer)

    logStream.write(`\n[ai-ins] ${provider.label} failed to start: ${error.message}\n`)
    appendAiInsEvent(runId, {
      message: error.message,
      providerId: provider.id,
      providerLabel: provider.label,
      turn: turnIndex,
      type: 'error',
    })
    logStream.end()
  })

  child.on('exit', (code, signal) => {
    completed = true
    clearInterval(heartbeatTimer)
    flushStdoutBuffer()
    // Approval cards for a process that is gone can never be answered.
    cancelPendingPermissions(run)
    run.signal = signal

    logStream.write(`\n[ai-ins] ${provider.label} exited with code=${code ?? 'null'} signal=${signal ?? 'null'}\n`)
    void takeWorkspaceSnapshot(root)
      .then((workspaceAfter) => (workspaceBefore && workspaceAfter ? diffWorkspaceSnapshots(workspaceBefore, workspaceAfter) : undefined))
      .catch(() => undefined)
      .then((changedFiles) => {
        if (changedFiles?.length) {
          logStream.write(`[ai-ins] changed files:\n${changedFiles.map((file) => `  ${file.status} ${file.path}`).join('\n')}\n`)
        }

        appendAiInsEvent(runId, {
          changedFiles,
          code,
          providerId: provider.id,
          providerLabel: provider.label,
          signal,
          turn: turnIndex,
          type: 'done',
        })
        logStream.end()
      })
  })

  if (input === 'stdin') {
    child.stdin.end(prompt)
  } else {
    child.stdin.end()
  }

  return child
}
