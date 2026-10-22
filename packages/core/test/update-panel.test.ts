import { describe, expect, it } from 'vitest'
import { buildUpgradePrompt, getUpgradePermission } from '../src/client-panel/update'
import type { AgentProvider } from '../src/client-panel/types'

const claude: AgentProvider = { enabled: true, id: 'claude', label: 'Claude Cli', permissionModes: ['ask', 'edit', 'full'] }
const codex: AgentProvider = { enabled: true, id: 'codex', label: 'Codex Cli', permissionModes: ['edit', 'full'] }
const fixed: AgentProvider = { enabled: true, id: 'custom', label: 'Custom', permissionModes: [] }

describe('upgrade with agent', () => {
  it('keeps a permission that can run the install command', () => {
    expect(getUpgradePermission(claude, 'ask')).toEqual({ mode: 'ask' })
    expect(getUpgradePermission(claude, 'full')).toEqual({ mode: 'full' })
    expect(getUpgradePermission(codex, 'full')).toEqual({ mode: 'full' })
  })

  it('raises "edit" to "ask" where the agent can ask, and only to "full" where it cannot', () => {
    expect(getUpgradePermission(claude, 'edit')).toEqual({ mode: 'ask', raised: 'ask' })
    expect(getUpgradePermission(codex, 'edit')).toEqual({ mode: 'full', raised: 'full' })
    // Codex has no "ask": the saved "ask" falls back to "edit", which cannot install either.
    expect(getUpgradePermission(codex, 'ask')).toEqual({ mode: 'full', raised: 'full' })
  })

  it('leaves agents whose own flags fix the permission alone', () => {
    expect(getUpgradePermission(fixed, 'edit')).toEqual({})
  })

  it('puts the exact command, versions and changelog into the prompt', () => {
    const prompt = buildUpgradePrompt({
      changelogUrl: 'https://example.test/CHANGELOG.md',
      current: '1.0.6',
      latest: '1.1.0',
      status: 'available',
      upgrade: { command: 'pnpm add -D @ai-ins/vite@latest', directory: '', packageManager: 'pnpm', packages: ['@ai-ins/vite'] },
    })
    expect(prompt).toContain('`pnpm add -D @ai-ins/vite@latest`')
    expect(prompt).toContain('v1.0.6')
    expect(prompt).toContain('v1.1.0')
    expect(prompt).toContain('https://example.test/CHANGELOG.md')
    expect(prompt).not.toMatch(/\{\w+\}/u)
  })

  it('asks the agent to find the packages itself when none were detected', () => {
    const prompt = buildUpgradePrompt({ changelogUrl: 'https://example.test/CHANGELOG.md', current: '1.0.6', latest: '1.1.0', status: 'available' })
    expect(prompt).toContain('@ai-ins/')
    expect(prompt).not.toMatch(/\{\w+\}/u)
  })
})
