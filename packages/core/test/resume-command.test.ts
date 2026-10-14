import { describe, expect, it } from 'vitest'
import { getTerminalResumeCommand } from '../src/run-store'
import type { AiInsRun } from '../src/types'

const run = (patch: Partial<AiInsRun>) => ({ providerId: 'claude', root: '/repo/app', sessionId: 'abc-123', sessionMode: 'assign', sessionStarted: true, ...patch }) as AiInsRun

describe('terminal resume command', () => {
  it('changes into the project and resumes the session (macOS / Linux)', () => {
    expect(getTerminalResumeCommand(run({}), 'darwin')).toBe("cd '/repo/app' && claude --resume abc-123")
    expect(getTerminalResumeCommand(run({ providerId: 'codex', sessionMode: 'capture' }), 'linux')).toBe("cd '/repo/app' && codex resume abc-123")
    expect(getTerminalResumeCommand(run({ root: "/it's/here" }), 'darwin')).toBe(`cd '/it'\\''s/here' && claude --resume abc-123`)
  })

  it('uses PowerShell on Windows, without && so 5.1 runs it too', () => {
    expect(getTerminalResumeCommand(run({ root: "C:\\Users\\me\\it's app" }), 'win32')).toBe(
      "Set-Location -LiteralPath 'C:\\Users\\me\\it''s app'; claude --resume abc-123",
    )
  })

  it('has nothing to offer before a session exists, or for agents without one', () => {
    expect(getTerminalResumeCommand(run({ sessionStarted: false }))).toBeUndefined()
    expect(getTerminalResumeCommand(run({ sessionId: undefined }))).toBeUndefined()
    expect(getTerminalResumeCommand(run({ providerId: 'gemini' }))).toBeUndefined()
  })
})
