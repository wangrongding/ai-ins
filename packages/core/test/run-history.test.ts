import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createAiInsMiddlewares } from '../src/index'
import type { AiInsMiddleware, AiInsRoute } from '../src/types'

type Response = { body: any; status: number }

function call(middleware: AiInsMiddleware, method: string, url: string) {
  return new Promise<Response>((resolve) => {
    const res = {
      setHeader() {},
      statusCode: 200,
      end(body?: string) {
        let parsed: unknown = body
        try {
          parsed = body ? JSON.parse(body) : null
        } catch {
          // plain-text error body
        }
        resolve({ body: parsed, status: this.statusCode })
      },
    }
    middleware({ method, on() {}, url } as never, res as never)
  })
}

const runs = (routes: AiInsRoute[]) => routes.find((route) => route.path === '/__ai-ins-agent/runs')!.middleware

function storedRun(id: string, root: string, at: number, completed = true) {
  return {
    alwaysAllowedTools: ['Bash'],
    createdAt: at,
    eventSeq: 5,
    id,
    logPath: join(root, '.ai-ins', `${id}.log`),
    providerId: 'claude',
    providerLabel: 'Claude',
    root,
    sessionId: `session-${id}`,
    sessionMode: 'assign',
    sessionStarted: true,
    turns: [
      {
        agentPrompt: 'prompt',
        completed,
        createdAt: at,
        index: 0,
        lineNumber: 1,
        output: `out-${id}`,
        prompt: `prompt ${id}`,
        resumed: false,
        sourceName: 'Comp',
        sourcePath: join(root, 'a.tsx'),
        status: completed ? 'done' : 'running',
        statusMessage: '',
      },
    ],
    updatedAt: at,
    version: 1,
  }
}

let base = ''
const rootA = () => join(base, 'a')
const rootB = () => join(base, 'b')
const rootC = () => join(base, 'c')
const historyOf = (root: string) => join(root, '.ai-ins', 'runs')

beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), 'ai-ins-history-'))
  for (const root of [rootA(), rootB(), rootC()]) mkdirSync(historyOf(root), { recursive: true })
  const save = (root: string, run: ReturnType<typeof storedRun>) => writeFileSync(join(historyOf(root), `${run.id}.json`), JSON.stringify(run))
  save(rootA(), storedRun('r1', rootA(), 1000))
  save(rootA(), storedRun('r2', rootA(), 2000))
  save(rootA(), storedRun('r3', rootA(), 3000))
  save(rootA(), storedRun('r4', rootA(), 4000, false))
  writeFileSync(join(historyOf(rootA()), 'broken.json'), '{"version":1, "turns": [')
  save(rootB(), storedRun('b1', rootB(), 5000))
  save(rootC(), storedRun('c1', rootC(), 6000))
})

afterAll(() => {
  rmSync(base, { force: true, recursive: true })
})

describe('run history', () => {
  it('restores runs from disk, keeps the newest within the limit and skips broken files', async () => {
    const list = await call(runs(createAiInsMiddlewares(rootA(), { agents: { history: { limit: 2 } } })), 'GET', '/')
    expect(list.body.runs.map((run: { id: string }) => run.id)).toEqual(['r4', 'r3'])
    expect(readdirSync(historyOf(rootA())).sort()).toEqual(['broken.json', 'r3.json', 'r4.json'])
  })

  it('marks a turn cut off by a restart as interrupted, keeps its output, and stays resumable', async () => {
    const middleware = runs(createAiInsMiddlewares(rootA(), { agents: { history: { limit: 2 } } }))
    const { body } = await call(middleware, 'GET', '/?id=r4')
    expect(body.run).toMatchObject({ canResume: true, interrupted: true, resumeBlockedCode: '', status: 'failed' })
    expect(body.run.turns[0].output).toBe('out-r4')
    // Persisted once, so the next restart does not re-derive it.
    expect(JSON.parse(readFileSync(join(historyOf(rootA()), 'r4.json'), 'utf-8')).turns[0].interrupted).toBe(true)
  })

  it('leaves transcripts out of the list but returns them per run', async () => {
    const middleware = runs(createAiInsMiddlewares(rootA()))
    const list = await call(middleware, 'GET', '/')
    expect(list.body.runs[1].turns[0].output).toBeUndefined()
    expect((await call(middleware, 'GET', '/?id=r3')).body.run.turns[0].output).toBe('out-r3')
  })

  it('answers "unchanged" for the current list version', async () => {
    const middleware = runs(createAiInsMiddlewares(rootA()))
    const { version } = (await call(middleware, 'GET', '/')).body
    expect((await call(middleware, 'GET', `/?version=${version}`)).body).toEqual({ unchanged: true, version })
  })

  it('keeps projects apart and honors history: false', async () => {
    expect((await call(runs(createAiInsMiddlewares(rootB())), 'GET', '/')).body.runs.map((run: { id: string }) => run.id)).toEqual(['b1'])
    expect((await call(runs(createAiInsMiddlewares(rootA())), 'GET', '/?id=b1')).status).toBe(404)
    expect((await call(runs(createAiInsMiddlewares(rootC(), { agents: { history: false } })), 'GET', '/')).body.runs).toEqual([])
  })

  it('clears finished runs of one project, files included', async () => {
    const cleared = await call(runs(createAiInsMiddlewares(rootA())), 'DELETE', '/?scope=finished')
    expect(cleared.body.removedIds.sort()).toEqual(['r3', 'r4'])
    expect(readdirSync(historyOf(rootA()))).toEqual(['broken.json'])
    expect((await call(runs(createAiInsMiddlewares(rootB())), 'GET', '/')).body.runs).toHaveLength(1)
  })
})
