import { describe, expect, it } from 'vitest'
import { applyPermissionArgs, getSupportedPermissionModes, parsePermissionMode, resolvePermissionMode } from '../src/permissions'
import type { AiInsAgentPermissionsInput, ResolvedAiInsAgentProvider } from '../src/types'

function provider(permissions?: AiInsAgentPermissionsInput) {
  return { permissions } as ResolvedAiInsAgentProvider
}

describe('resolvePermissionMode', () => {
  it('uses the requested level when the provider supports it', () => {
    const claude = provider({ ask: ['--ask'], edit: ['--edit'], full: ['--full'] })
    expect(resolvePermissionMode(claude, 'ask')).toBe('ask')
    expect(resolvePermissionMode(claude, 'full')).toBe('full')
  })

  it('only ever falls back to a stricter level', () => {
    const codex = provider({ edit: ['--edit'], full: ['--full'] })
    expect(resolvePermissionMode(codex, 'ask')).toBe('edit')
    expect(resolvePermissionMode(provider({ ask: ['--ask'] }), 'full')).toBe('ask')
    expect(resolvePermissionMode(provider({ full: ['--full'] }), 'edit')).toBeUndefined()
  })

  it('is undefined when the provider args fix permissions', () => {
    expect(resolvePermissionMode(provider(), 'full')).toBeUndefined()
    expect(getSupportedPermissionModes(provider())).toEqual([])
  })
})

describe('applyPermissionArgs', () => {
  const claude = provider({ ask: ['--prompt-tool', 'x', '--mcp-config', '{permissionMcpConfig}'], edit: ['--accept-edits'] })

  it('splices the level flags in at the placeholder and fills the MCP config', () => {
    expect(applyPermissionArgs(['-p', '{permissionArgs}', '--json'], claude, 'ask', '{"cfg":1}')).toEqual([
      '-p',
      '--prompt-tool',
      'x',
      '--mcp-config',
      '{"cfg":1}',
      '--json',
    ])
  })

  it('appends when there is no placeholder, and drops the placeholder when there is nothing to add', () => {
    expect(applyPermissionArgs(['run'], claude, 'edit', '')).toEqual(['run', '--accept-edits'])
    expect(applyPermissionArgs(['run', '{permissionArgs}'], provider(), undefined, '')).toEqual(['run'])
  })
})

describe('parsePermissionMode', () => {
  it('accepts known levels only', () => {
    expect(parsePermissionMode('full')).toBe('full')
    expect(parsePermissionMode('yolo')).toBeUndefined()
    expect(parsePermissionMode(undefined)).toBeUndefined()
  })
})
