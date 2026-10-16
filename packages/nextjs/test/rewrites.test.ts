import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { getAiInsRewrites, withAiIns } from '../src/index'

type Rewrite = { destination: string; source: string }

const root = mkdtempSync(join(tmpdir(), 'ai-ins-next-'))
afterAll(() => rmSync(root, { force: true, recursive: true }))

describe('rewrites to the AI Ins server', () => {
  it('forwards each path and everything under it, longest path first', () => {
    expect(getAiInsRewrites(['/__ai-ins-agent', '/__ai-ins-agent/runs', '/__ai-ins-agent'], 4000)).toEqual([
      { destination: 'http://127.0.0.1:4000/__ai-ins-agent/runs', source: '/__ai-ins-agent/runs' },
      { destination: 'http://127.0.0.1:4000/__ai-ins-agent/runs/:path*', source: '/__ai-ins-agent/runs/:path*' },
      { destination: 'http://127.0.0.1:4000/__ai-ins-agent', source: '/__ai-ins-agent' },
      { destination: 'http://127.0.0.1:4000/__ai-ins-agent/:path*', source: '/__ai-ins-agent/:path*' },
    ])
  })

  it('covers every route the server serves, ahead of the project rewrites', async () => {
    const own = { destination: '/b', source: '/a' }
    const config = await withAiIns({ rewrites: async () => [own] })('phase-development-server', { dir: root })
    const rewrites = (await config.rewrites()) as Rewrite[]

    const sources = rewrites.map((rewrite) => rewrite.source)
    for (const path of ['/__ai-ins/client.js', '/__ai-ins-config', '/__ai-ins-settings', '/__open-in-editor', '/__ai-ins-agent']) {
      expect(sources).toContain(path)
    }
    expect(rewrites.at(-1)).toEqual(own)

    // Every forwarded path reaches a real route, not the server's 404.
    const exact = rewrites.filter((rewrite) => rewrite.destination.startsWith('http://127.0.0.1:') && !rewrite.source.includes(':path'))
    for (const rewrite of exact) {
      const controller = new AbortController()
      const response = await fetch(rewrite.destination, { signal: controller.signal })
      // A route may answer 404 itself (an unknown run); only the server's own
      // "no such route" counts. Other bodies may be streams that never end.
      const body = response.status === 404 ? await response.text() : ''
      expect(body, rewrite.source).not.toBe('AI Ins route not found')
      controller.abort()
    }
  })

  it('keeps object-form rewrites and adds its own to beforeFiles', async () => {
    const config = await withAiIns({ rewrites: async () => ({ afterFiles: [{ destination: '/y', source: '/x' }] }) })('phase-development-server', { dir: root })
    const rewrites = (await config.rewrites()) as { afterFiles: Rewrite[]; beforeFiles: Rewrite[] }
    expect(rewrites.afterFiles).toEqual([{ destination: '/y', source: '/x' }])
    expect(rewrites.beforeFiles.some((rewrite) => rewrite.source === '/__ai-ins-settings')).toBe(true)
  })

  it('adds no rewrites outside development', async () => {
    const config = await withAiIns({})('phase-production-build', { dir: root })
    expect(config.rewrites).toBeUndefined()
  })
})
