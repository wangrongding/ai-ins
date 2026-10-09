import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { PassThrough } from 'stream'
import { afterAll, describe, expect, it } from 'vitest'
import { aiInsEditMiddleware } from '../src/middleware'
import { aiInsRuns } from '../src/run-store'

const root = mkdtempSync(join(tmpdir(), 'ai-ins-encoding-'))
afterAll(() => rmSync(root, { force: true, recursive: true }))

// An agent that writes "告诉我。" with the 3 bytes of "我" split across two
// writes, on stdout and on stderr — what a pipe does whenever it likes.
const splitWriter = `
const bytes = Buffer.from('告诉我。\\n')
const cut = Buffer.from('告诉').length + 1
for (const stream of [process.stdout, process.stderr]) stream.write(bytes.subarray(0, cut))
setTimeout(() => { for (const stream of [process.stdout, process.stderr]) stream.write(bytes.subarray(cut)) }, 150)
`

describe('agent output decoding', () => {
  it('keeps a multi-byte character that arrives split across two chunks', async () => {
    const middleware = aiInsEditMiddleware(
      root,
      {
        agents: {
          defaultProvider: 'split',
          history: false,
          providers: [{ args: ['-e', splitWriter], command: process.execPath, id: 'split', input: 'stdin', output: 'plain' }],
        },
      },
      '',
    )
    const req = Object.assign(new PassThrough(), { method: 'POST', socket: { localAddress: '127.0.0.1', localPort: 1 }, url: '/__ai-ins-agent' })
    req.end(JSON.stringify({ prompt: 'hi', provider: 'split' }))
    const body = await new Promise<string>((resolve) => {
      void middleware(req as never, { end: resolve, setHeader: () => {}, statusCode: 200 } as never, () => {})
    })

    const result = JSON.parse(body)
    const run = aiInsRuns.get(result.runId)!
    for (let i = 0; i < 100 && !run.completed; i += 1) await new Promise((resolve) => setTimeout(resolve, 50))

    // stdout and stderr interleave, so only look at the character that was split.
    const output = run.turns[0].output ?? ''
    expect(output).not.toContain('\ufffd')
    expect(output.match(/我/gu)?.length).toBe(2)
    expect(readFileSync(result.logPath, 'utf-8')).not.toContain('\ufffd')
  })
})
