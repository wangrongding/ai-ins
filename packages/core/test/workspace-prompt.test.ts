import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { PassThrough } from 'stream'
import { afterAll, describe, expect, it } from 'vitest'
import { aiInsEditMiddleware } from '../src/middleware'
import { aiInsRuns } from '../src/run-store'
import { buildFollowUpAgentPrompt, buildWorkspaceAgentPrompt } from '../src/source'

const root = mkdtempSync(join(tmpdir(), 'ai-ins-workspace-'))
afterAll(() => rmSync(root, { force: true, recursive: true }))

describe('conversations without a picked element', () => {
  it('builds a project-wide prompt with the page the user was on', () => {
    const prompt = buildWorkspaceAgentPrompt({ pageUrl: 'http://localhost:5173/blog', rawPrompt: 'Add a dark mode toggle', root: '/repo' })
    expect(prompt).toContain('did not pick a specific element')
    expect(prompt).toContain('Add a dark mode toggle')
    expect(prompt).toContain('http://localhost:5173/blog')
    expect(prompt).toContain('Project root: /repo')
    expect(prompt).not.toContain('Clicked source location')
  })

  it('keeps follow-ups project-wide instead of naming a bogus file', () => {
    const prompt = buildFollowUpAgentPrompt({ previousDisplayPath: '', rawPrompt: 'Also persist it', turnNumber: 2 })
    expect(prompt).toContain('project as a whole')
    expect(prompt).not.toMatch(/:0\b/u)
  })

  it('starts a run when the request has no file', async () => {
    // A stand-in agent that just echoes its prompt.
    const middleware = aiInsEditMiddleware(
      root,
      {
        agents: {
          defaultProvider: 'echo',
          history: false,
          providers: [{ args: ['-e', 'process.stdin.pipe(process.stdout)'], command: process.execPath, id: 'echo', input: 'stdin', output: 'plain' }],
        },
      },
      '',
    )
    const req = Object.assign(new PassThrough(), { method: 'POST', socket: { localAddress: '127.0.0.1', localPort: 1 }, url: '/__ai-ins-agent' })
    req.end(JSON.stringify({ page: 'http://localhost:5173/', prompt: 'Add a footer', provider: 'echo' }))
    const body = await new Promise<string>((resolve) => {
      const res = { end: resolve, setHeader: () => {}, statusCode: 200 }
      void middleware(req as never, res as never, () => {})
    })

    const result = JSON.parse(body)
    expect(result.success).toBe(true)
    expect(result.fileName).toBe('')
    const run = aiInsRuns.get(result.runId)!
    expect(run.sourcePath).toBe('')
    expect(run.turns[0].agentPrompt).toContain('Add a footer')
    // Let the echo agent finish and its log close before the temp root goes away.
    for (let i = 0; i < 100 && !run.completed; i += 1) await new Promise((resolve) => setTimeout(resolve, 50))
    expect(run.turns[0].output).toContain('did not pick a specific element')
  })
})
