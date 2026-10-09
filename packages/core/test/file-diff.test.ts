import { describe, expect, it } from 'vitest'
import { parseUnifiedDiff } from '../src/client-panel/FileDiff'

describe('parseUnifiedDiff', () => {
  it('numbers old and new lines from each hunk header', () => {
    const lines = parseUnifiedDiff('@@ -10,3 +10,3 @@ fn()\n a\n-b\n+B\n c\n\\ No newline at end of file\n')
    expect(lines).toEqual([
      { kind: 'hunk', text: '@@ -10,3 +10,3 @@ fn()' },
      { kind: 'context', newLine: 10, oldLine: 10, text: 'a' },
      { kind: 'del', oldLine: 11, text: 'b' },
      { kind: 'add', newLine: 11, text: 'B' },
      { kind: 'context', newLine: 12, oldLine: 12, text: 'c' },
      { kind: 'note', text: 'No newline at end of file' },
    ])
  })
})
