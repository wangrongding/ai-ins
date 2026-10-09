import { execSync } from 'child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { addWorkspacePatches, diffWorkspaceSnapshots, getWorkspaceFilePatch, listWorkspaceChanges, setWorkspaceFilesStaged, takeWorkspaceBaseline, takeWorkspaceSnapshot } from '../src/workspace-changes'

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

describe('turn diffs', () => {
  const turn = async (run: () => void) => {
    const before = await takeWorkspaceSnapshot(root)
    const baseline = await takeWorkspaceBaseline(root, before)
    run()
    const after = await takeWorkspaceSnapshot(root)
    const files = await addWorkspacePatches(root, baseline, diffWorkspaceSnapshots(before!, after!))
    return Object.fromEntries(files.map((file) => [file.path.slice(root.length + 1), file]))
  }

  it('diffs against the work tree as the turn found it, not against HEAD', async () => {
    write('app/src/a.ts', 'one\ntwo\nthree\n')
    write('app/src/draft.ts', 'draft v1\n')
    const stashesBefore = git('stash list').toString()

    const files = await turn(() => {
      write('app/src/a.ts', 'one\nTWO\nthree\nfour\n')
      write('app/src/draft.ts', 'draft v2\n')
      write('app/src/fresh.ts', 'hello\n')
    })

    expect(files['src/a.ts']).toMatchObject({ additions: 2, deletions: 1, status: 'modified' })
    expect(files['src/a.ts'].patch).toBe('@@ -1,3 +1,4 @@\n one\n-two\n+TWO\n three\n+four\n')
    // Untracked before the turn: compared with its earlier content, not shown as all new.
    expect(files['src/draft.ts']).toMatchObject({ additions: 1, deletions: 1, patch: '@@ -1 +1 @@\n-draft v1\n+draft v2\n' })
    expect(files['src/fresh.ts']).toMatchObject({ additions: 1, deletions: 0, status: 'added' })
    // `git stash create` must not touch the user's stash list.
    expect(git('stash list').toString()).toBe(stashesBefore)
  })

  it('shows a deleted file as all removed lines', async () => {
    const files = await turn(() => unlinkSync(join(root, 'src/fresh.ts')))
    expect(files['src/fresh.ts']).toMatchObject({ additions: 0, deletions: 1, patch: '@@ -1 +0,0 @@\n-hello\n', status: 'deleted' })
  })
})

describe('working tree changes against HEAD', () => {
  it('splits staged and unstaged changes like git status, with line counts and patches', async () => {
    git('add -A')
    git('commit -qm checkpoint')
    write('app/src/a.ts', 'one\nTWO\nthree\nfour\n')
    write('app/src/a.ts', 'one\nchanged\nthree\nfour\n')
    git('add app/src/a.ts')
    write('app/src/a.ts', 'one\nchanged\nthree\nfour\nfive\n')
    write('app/src/brand-new.ts', 'x\ny\n')
    write('outside.ts', '// outside again\n')

    const files = (await listWorkspaceChanges(root))!.map((file) => ({ ...file, path: file.path.slice(root.length + 1) }))
    expect(files).toEqual([
      { additions: 1, binary: false, deletions: 1, path: 'src/a.ts', staged: true, status: 'modified' },
      { additions: 1, binary: false, deletions: 0, path: 'src/a.ts', staged: false, status: 'modified' },
      { additions: 2, binary: false, deletions: 0, path: 'src/brand-new.ts', staged: false, status: 'added' },
    ])

    expect((await getWorkspaceFilePatch(root, join(root, 'src/a.ts'), true)).patch).toContain('-TWO\n+changed')
    expect((await getWorkspaceFilePatch(root, join(root, 'src/a.ts'), false)).patch).toContain('+five')
    git('reset -q')
  })

  it('stages and unstages files without touching the work tree', async () => {
    write('app/src/a.ts', 'staged edit\n')
    unlinkSync(join(root, 'src/b.ts'))
    const sections = async () =>
      (await listWorkspaceChanges(root))!.map((file) => `${file.staged ? 'staged' : 'unstaged'} ${file.status} ${file.path.slice(root.length + 1)}`)

    await setWorkspaceFilesStaged(root, [join(root, 'src/a.ts'), join(root, 'src/b.ts')], true)
    expect(await sections()).toContain('staged modified src/a.ts')
    expect(await sections()).toContain('staged deleted src/b.ts')

    await setWorkspaceFilesStaged(root, [join(root, 'src/a.ts')], false)
    expect(await sections()).toContain('unstaged modified src/a.ts')
    expect(readFileSync(join(root, 'src/a.ts'), 'utf-8')).toBe('staged edit\n')
    git('reset -q')
  })
})

