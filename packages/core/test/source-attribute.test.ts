import { describe, expect, it } from 'vitest'
import { join } from 'path'
import { toSourceAttributeFile } from '../src/source'

describe('injected source file', () => {
  const root = join('/', 'repo', 'apps', 'web')

  it('is relative to the root, with / separators', () => {
    expect(toSourceAttributeFile(join(root, 'src', 'App.tsx'), root)).toBe('src/App.tsx')
  })

  it('climbs out of the root for files elsewhere in the workspace', () => {
    expect(toSourceAttributeFile(join('/', 'repo', 'packages', 'ui', 'Button.tsx'), root)).toBe('../../packages/ui/Button.tsx')
  })

  it('stays absolute without a root', () => {
    const file = join(root, 'src', 'App.tsx')
    expect(toSourceAttributeFile(file, undefined)).toBe(file)
  })
})
