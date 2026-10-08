import { execSync } from 'child_process'
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { diffWorkspaceSnapshots, takeWorkspaceSnapshot } from '../src/workspace-changes'

// The temp dir path goes through a symlink on macOS (/var → /private/var),
// which is exactly the case where git's resolved paths must be mapped back.
let repo = ''
let root = ''

const git = (command: string) => execSync(`git ${command}`, { cwd: repo, stdio: 'pipe' })
const write = (file: string, content: string) => writeFileSync(join(repo, file), content)
const changes = async (run: () => void) => {
  const before = await takeWorkspaceSnapshot(root)
  run()
  const after = await takeWorkspaceSnapshot(root)
  return diffWorkspaceSnapshots(before!, after!).map((file) => `${file.status} ${file.path.slice(root.length + 1)}`)
}

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), 'ai-ins-changes-'))
  root = join(repo, 'app')
  mkdirSync(join(root, 'src'), { recursive: true })
  git('init -q')
  git('config user.email test@example.com')
  git('config user.name test')
  for (const file of ['app/src/a.ts', 'app/src/b.ts', 'app/src/c.ts', 'outside.ts']) write(file, `// ${file}\n`)
  git('add -A')
  git('commit -qm init')
})

afterAll(() => {
  rmSync(repo, { force: true, recursive: true })
})

describe('workspace change tracking', () => {
  it('reports edits, deletions and new files under the root only', async () => {
    write('app/src/b.ts', '// dirty before the turn\n')
    expect(
      await changes(() => {
        write('app/src/a.ts', '// edited\n')
        write('app/src/b.ts', '// edited again\n')
        unlinkSync(join(root, 'src/c.ts'))
        write('app/src/new.ts', 'new\n')
        write('outside.ts', '// outside the root\n')
        mkdirSync(join(root, '.ai-ins/runs'), { recursive: true })
        write('app/.ai-ins/runs/x.json', '{}')
      }),
    ).toEqual(['modified src/a.ts', 'modified src/b.ts', 'deleted src/c.ts', 'added src/new.ts'])
  })

  it('ignores files that were already dirty and did not change', async () => {
    write('app/src/untouched.ts', 'already here\n')
    expect(await changes(() => {})).toEqual([])
  })

  it('reports a reverted file as modified and a removed new file as deleted', async () => {
    expect(await changes(() => git('checkout -- app/src/b.ts'))).toEqual(['modified src/b.ts'])
    expect(await changes(() => unlinkSync(join(root, 'src/untouched.ts')))).toEqual(['deleted src/untouched.ts'])
  })

  it('returns undefined outside a git work tree', async () => {
    const plain = mkdtempSync(join(tmpdir(), 'ai-ins-plain-'))
    expect(await takeWorkspaceSnapshot(plain)).toBeUndefined()
    rmSync(plain, { force: true, recursive: true })
  })
})
