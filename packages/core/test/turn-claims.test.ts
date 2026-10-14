import { execSync } from 'child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { PassThrough } from 'stream'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { aiInsEditMiddleware } from '../src/middleware'
import { aiInsRuns } from '../src/run-store'
import { addTurnClaims, beginTurnClaims, endTurnClaims, getEditedPaths, resetTurnClaims } from '../src/turn-claims'

describe('reading edits from agent events', () => {
  it('takes file paths from Claude edit tools and Codex file changes, relative or absolute', () => {
    const claude = { message: { content: [
      { input: { file_path: '/repo/src/a.ts', old_string: 'x' }, name: 'Edit', type: 'tool_use' },
      { input: { file_path: 'src/b.ts' }, name: 'Write', type: 'tool_use' },
      { input: { command: 'ls' }, name: 'Bash', type: 'tool_use' },
      { input: { file_path: '/repo/src/c.ts' }, name: 'Read', type: 'tool_use' },
    ] }, type: 'assistant' }
    expect(getEditedPaths(claude, '/repo')).toEqual(['/repo/src/a.ts', '/repo/src/b.ts'])

    const codex = { item: { changes: [{ kind: 'update', path: '/repo/src/d.ts' }, { kind: 'add', path: 'src/e.ts' }], id: 'i', type: 'file_change' }, type: 'item.completed' }
    expect(getEditedPaths(codex, '/repo')).toEqual(['/repo/src/d.ts', '/repo/src/e.ts'])
    expect(getEditedPaths({ type: 'result' }, '/repo')).toEqual([])
  })
})

describe('sorting a turn diff when conversations overlap', () => {
  beforeEach(() => resetTurnClaims())
  const files = (...paths: string[]) => paths.map((path) => ({ path }))

  it('leaves a lone turn untouched', () => {
    beginTurnClaims('a', '/repo', 0)
    expect(endTurnClaims('a', files('/repo/x', '/repo/y'), 10)).toEqual(files('/repo/x', '/repo/y'))
  })

  it('drops what the other turn edited, flags shared and unclaimed files', () => {
    beginTurnClaims('a', '/repo', 0)
    beginTurnClaims('b', '/repo', 5)
    addTurnClaims('a', ['/repo/a.ts', '/repo/both.ts'])
    addTurnClaims('b', ['/repo/b.ts', '/repo/both.ts'])
    const diff = files('/repo/a.ts', '/repo/b.ts', '/repo/both.ts', '/repo/lockfile')

    expect(endTurnClaims('a', diff, 20)).toEqual([
      { path: '/repo/a.ts' },
      { attribution: 'shared', path: '/repo/both.ts' },
      { attribution: 'uncertain', path: '/repo/lockfile' },
    ])
    // B finishes later and still sees A, which overlapped it.
    expect(endTurnClaims('b', diff, 30)).toEqual([
      { path: '/repo/b.ts' },
      { attribution: 'shared', path: '/repo/both.ts' },
      { attribution: 'uncertain', path: '/repo/lockfile' },
    ])
  })

  it('ignores turns that did not overlap, and other projects', () => {
    beginTurnClaims('early', '/repo', 0)
    addTurnClaims('early', ['/repo/x'])
    endTurnClaims('early', [], 5)
    beginTurnClaims('other-project', '/elsewhere', 6)
    addTurnClaims('other-project', ['/repo/x'])
    beginTurnClaims('late', '/repo', 10)
    expect(endTurnClaims('late', files('/repo/x'), 20)).toEqual(files('/repo/x'))
  })
})

describe('two conversations running at once (end to end)', () => {
  const repo = mkdtempSync(join(tmpdir(), 'ai-ins-overlap-'))
  afterAll(() => rmSync(repo, { force: true, recursive: true }))

  // A fake Claude: announces an Edit, writes the file, then lingers so the two runs overlap.
  const agent = (file: string, delay: number, alsoShell?: string) => `
const fs = require('fs')
const path = require('path')
setTimeout(() => {
  console.log(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: path.join(process.cwd(), ${JSON.stringify(file)}) } }] } }))
  fs.writeFileSync(${JSON.stringify(file)}, 'edited by ' + ${JSON.stringify(file)} + '\\n')
  ${alsoShell ? `fs.writeFileSync(${JSON.stringify(alsoShell)}, 'changed by a command\\n')` : ''}
}, ${delay})
setTimeout(() => {}, 900)
`

  it('keeps each conversation to its own files', async () => {
    execSync('git init -q && git config user.email t@t && git config user.name t', { cwd: repo })
    mkdirSync(join(repo, 'src'))
    for (const file of ['src/a.ts', 'src/b.ts', 'lock.json']) writeFileSync(join(repo, file), 'original\n')
    execSync('git add -A && git commit -qm init', { cwd: repo })

    const provider = (id: string, script: string) => ({ args: ['-e', script], command: process.execPath, id, input: 'stdin' as const, output: 'jsonl' as const })
    const middleware = aiInsEditMiddleware(
      repo,
      { agents: { defaultProvider: 'a', history: false, providers: [provider('a', agent('src/a.ts', 100)), provider('b', agent('src/b.ts', 300, 'lock.json'))] } },
      '',
    )
    const start = async (id: string) => {
      const req = Object.assign(new PassThrough(), { method: 'POST', socket: { localAddress: '127.0.0.1', localPort: 1 }, url: '/__ai-ins-agent' })
      req.end(JSON.stringify({ prompt: 'go', provider: id }))
      const body = await new Promise<string>((resolve) => void middleware(req as never, { end: resolve, setHeader: () => {}, statusCode: 200 } as never, () => {}))
      return aiInsRuns.get(JSON.parse(body).runId)!
    }

    const [a, b] = await Promise.all([start('a'), start('b')])
    for (let i = 0; i < 300 && !(a.completed && b.completed); i += 1) await new Promise((resolve) => setTimeout(resolve, 50))

    const listed = (run: typeof a) => (run.turns[0].changedFiles ?? []).map((file) => `${file.path.slice(repo.length + 1)}${file.attribution ? ` (${file.attribution})` : ''}`)
    expect(listed(a)).toEqual(['lock.json (uncertain)', 'src/a.ts'])
    expect(listed(b)).toEqual(['lock.json (uncertain)', 'src/b.ts'])
    // Each diff holds only that conversation's edit.
    expect(a.turns[0].changedFiles?.find((file) => file.path.endsWith('a.ts'))?.patch).toContain('+edited by src/a.ts')
    // Real child processes and git: give a loaded machine room.
  }, 20000)
})
