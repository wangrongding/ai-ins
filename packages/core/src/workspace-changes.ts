import { execFile } from 'child_process'
import { createHash } from 'crypto'
import { existsSync } from 'fs'
import { mkdtemp, readFile, realpath, rm, stat, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join, relative, sep } from 'path'
import type { AiInsChangedFile } from './types'

// Bigger files are compared by size + mtime instead of content.
const maxHashedFileBytes = 4 * 1024 * 1024
const gitTimeoutMs = 10000

/**
 * The dirty part of the work tree under `root`: absolute path -> git status
 * code plus a content fingerprint. Clean files are left out, so a snapshot
 * costs one `git status` plus hashing whatever is already modified.
 */
export type WorkspaceSnapshot = Map<string, string>

function runGit(args: string[], cwd: string) {
  return new Promise<string>((resolve, reject) => {
    execFile('git', args, { cwd, maxBuffer: 32 * 1024 * 1024, timeout: gitTimeoutMs }, (error, stdout) => {
      if (error) {
        reject(error)
        return
      }

      resolve(stdout)
    })
  })
}

function runGitBuffer(args: string[], cwd: string) {
  return new Promise<Buffer>((resolve, reject) => {
    execFile('git', args, { cwd, encoding: 'buffer', maxBuffer: 32 * 1024 * 1024, timeout: gitTimeoutMs }, (error, stdout) => {
      if (error) {
        reject(error)
        return
      }

      resolve(stdout)
    })
  })
}

async function fingerprintFile(fileName: string) {
  try {
    const info = await stat(fileName)
    if (!info.isFile()) {
      return 'dir'
    }

    if (info.size > maxHashedFileBytes) {
      return `size:${info.size}:${info.mtimeMs}`
    }

    return createHash('sha1').update(await readFile(fileName)).digest('hex')
  } catch {
    return 'missing'
  }
}

function isInside(fileName: string, directory: string) {
  const path = relative(directory, fileName)
  return path === '' || (!path.startsWith('..') && !path.startsWith(sep))
}

/**
 * The dirty files under `root` with their two-letter git status, as absolute
 * paths under `root`. Throws outside a git work tree.
 */
async function readGitStatus(root: string) {
  const gitRoot = (await runGit(['rev-parse', '--show-toplevel'], root)).trim()
  const output = await runGit(['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', '.'], root)
  // git reports symlink-resolved paths (macOS /tmp is /private/tmp); map them
  // back under `root` so they match the rest of AI Ins and display relative.
  const realRoot = await realpath(root).catch(() => root)
  // AI Ins writes its own logs and history under the root; never report them.
  const ownDirectory = join(root, '.ai-ins')
  const tokens = output.split('\0')
  const entries: Array<[string, string]> = []

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (token.length < 4) {
      continue
    }

    const code = token.slice(0, 2)
    // Renames and copies carry the original path as the next token.
    if (code.includes('R') || code.includes('C')) {
      index += 1
    }

    const resolvedFileName = join(gitRoot, token.slice(3))
    const fileName = isInside(resolvedFileName, realRoot) ? join(root, relative(realRoot, resolvedFileName)) : resolvedFileName
    if (!isInside(fileName, ownDirectory)) {
      entries.push([fileName, code])
    }
  }

  return entries
}

/** Resolves to undefined when `root` is not inside a git work tree (or git is unavailable). */
export async function takeWorkspaceSnapshot(root: string): Promise<WorkspaceSnapshot | undefined> {
  try {
    const entries = await readGitStatus(root)
    const snapshot: WorkspaceSnapshot = new Map()
    await Promise.all(
      entries.map(async ([fileName, code]) => {
        snapshot.set(fileName, `${code}:${await fingerprintFile(fileName)}`)
      }),
    )
    return snapshot
  } catch {
    return undefined
  }
}

function getChangeStatus(code: string): AiInsChangedFile['status'] {
  if (code === '??' || code.includes('A')) return 'added'
  if (code.includes('D')) return 'deleted'
  return 'modified'
}

/**
 * Files whose status or content differs between two snapshots. A file dirty
 * before and clean after was reverted or removed by the turn, which counts too.
 * Runs that overlap in the same root cannot be told apart and share credit.
 */
export function diffWorkspaceSnapshots(before: WorkspaceSnapshot, after: WorkspaceSnapshot): AiInsChangedFile[] {
  const changed: AiInsChangedFile[] = []

  for (const [path, value] of after) {
    if (before.get(path) !== value) {
      changed.push({ path, status: getChangeStatus(value.slice(0, 2)) })
    }
  }

  // Dirty before, clean after: either reverted (still on disk) or a new file
  // that was removed again (gone).
  for (const path of before.keys()) {
    if (!after.has(path)) {
      changed.push({ path, status: existsSync(path) ? 'modified' : 'deleted' })
    }
  }

  return changed.sort((first, second) => first.path.localeCompare(second.path))
}

// Patches are kept with the run history, so they are capped: per file, and per turn.
const maxDiffedFiles = 60
const maxPatchBytes = 64 * 1024
const maxTurnPatchBytes = 768 * 1024
// Untracked files dirty before the turn are not in any git object; keep their text.
const maxBaselineFileBytes = 1024 * 1024

/**
 * What the work tree looked like before a turn, so its diff shows only what
 * the turn did. `git stash create` writes a commit of the dirty tracked files
 * without touching the stash list, the index or the work tree; when nothing
 * is dirty it prints nothing and HEAD is the baseline.
 */
export type WorkspaceBaseline = {
  commit?: string
  untracked: Map<string, Buffer>
}

export async function takeWorkspaceBaseline(root: string, snapshot: WorkspaceSnapshot | undefined): Promise<WorkspaceBaseline | undefined> {
  if (!snapshot) {
    return undefined
  }

  const commit =
    (await runGit(['stash', 'create'], root).catch(() => '')).trim() ||
    (await runGit(['rev-parse', '--verify', '-q', 'HEAD'], root).catch(() => '')).trim() ||
    undefined
  const untracked = new Map<string, Buffer>()
  await Promise.all(
    [...snapshot].map(async ([fileName, value]) => {
      if (!value.startsWith('??')) return
      try {
        const info = await stat(fileName)
        if (info.isFile() && info.size <= maxBaselineFileBytes) {
          untracked.set(fileName, await readFile(fileName))
        }
      } catch {
        // Gone already; it will show as added from nothing.
      }
    }),
  )
  return { commit, untracked }
}

async function readBaselineFile(root: string, baseline: WorkspaceBaseline, fileName: string) {
  const untracked = baseline.untracked.get(fileName)
  if (untracked) {
    return untracked
  }

  if (!baseline.commit) {
    return undefined
  }

  // `<rev>:./path` resolves relative to the cwd, so `root` needs no mapping to the git top level.
  const path = relative(root, fileName).split(sep).join('/')
  return runGitBuffer(['show', `${baseline.commit}:./${path}`], root).catch(() => undefined)
}

type FilePatch = Pick<AiInsChangedFile, 'additions' | 'binary' | 'deletions' | 'patch' | 'truncated'>

/** Unified diff between two blobs, with git's file headers dropped (the file list names the file). */
async function diffBuffers(before: Buffer | undefined, afterFileName: string | undefined, scratch: string, index: number): Promise<FilePatch> {
  let beforeFileName = '/dev/null'
  if (before) {
    beforeFileName = join(scratch, `before-${index}`)
    await writeFile(beforeFileName, before)
  }

  // `--no-index` exits 1 when the files differ; that is the normal case here.
  const output = await new Promise<string>((resolve) => {
    execFile(
      'git',
      ['diff', '--no-index', '--no-color', '--no-ext-diff', '-U3', '--', beforeFileName, afterFileName || '/dev/null'],
      { maxBuffer: 32 * 1024 * 1024, timeout: gitTimeoutMs },
      (_error, stdout) => resolve(typeof stdout === 'string' ? stdout : ''),
    )
  })

  if (/^Binary files /mu.test(output)) {
    return { additions: 0, binary: true, deletions: 0 }
  }

  const start = output.indexOf('\n@@')
  const body = start === -1 ? '' : output.slice(start + 1)
  let additions = 0
  let deletions = 0
  for (const line of body.split('\n')) {
    if (line.startsWith('+')) additions += 1
    else if (line.startsWith('-')) deletions += 1
  }

  if (body.length <= maxPatchBytes) {
    return { additions, deletions, patch: body }
  }

  const cut = body.lastIndexOf('\n', maxPatchBytes)
  return { additions, deletions, patch: body.slice(0, cut === -1 ? maxPatchBytes : cut + 1), truncated: true }
}

/**
 * Adds line counts and a unified patch to each changed file, comparing the
 * baseline with what is on disk now. Files past the caps keep their counts
 * where possible and simply have no patch.
 */
export async function addWorkspacePatches(root: string, baseline: WorkspaceBaseline | undefined, files: AiInsChangedFile[]) {
  if (!baseline || !files.length) {
    return files
  }

  const scratch = await mkdtemp(join(tmpdir(), 'ai-ins-diff-'))
  let budget = maxTurnPatchBytes
  try {
    const result: AiInsChangedFile[] = []
    for (const [index, file] of files.entries()) {
      if (index >= maxDiffedFiles) {
        result.push(file)
        continue
      }

      try {
        const info = file.status === 'deleted' ? undefined : await stat(file.path).catch(() => undefined)
        if (info && !info.isFile()) {
          result.push(file)
          continue
        }

        const before = await readBaselineFile(root, baseline, file.path)
        const patch = await diffBuffers(before, info ? file.path : undefined, scratch, index)
        if (patch.patch && patch.patch.length > budget) {
          // Out of room for this turn: keep the counts, drop the text.
          result.push({ ...file, additions: patch.additions, deletions: patch.deletions, truncated: true })
          continue
        }

        budget -= patch.patch?.length ?? 0
        result.push({ ...file, ...patch })
      } catch {
        result.push(file)
      }
    }

    return result
  } finally {
    await rm(scratch, { force: true, recursive: true }).catch(() => {})
  }
}

/**
 * One uncommitted file, in the section git puts it: `staged` (index vs HEAD,
 * what a commit would contain) or not (work tree vs index). A file edited
 * again after `git add` shows up in both.
 */
export type WorkspaceChange = Pick<AiInsChangedFile, 'additions' | 'binary' | 'deletions' | 'path' | 'status'> & { staged: boolean }

async function countTextLines(fileName: string) {
  try {
    const info = await stat(fileName)
    if (!info.isFile() || info.size > maxBaselineFileBytes) return { additions: undefined, binary: false }
    const content = await readFile(fileName)
    if (content.includes(0)) return { additions: 0, binary: true }
    const text = content.toString('utf-8')
    return { additions: text ? text.split('\n').length - (text.endsWith('\n') ? 1 : 0) : 0, binary: false }
  } catch {
    return { additions: undefined, binary: false }
  }
}

/** `git diff --numstat -z --relative [...]` → absolute path → counts. */
async function readNumstat(root: string, args: string[]) {
  const counts = new Map<string, { additions: number; binary: boolean; deletions: number }>()
  // `--relative` keeps paths relative to `root`; -z keeps unusual names unquoted.
  const output = await runGit(['diff', '--numstat', '-z', '--relative', ...args, '--', '.'], root).catch(() => '')
  const tokens = output.split('\0')
  for (let index = 0; index < tokens.length; index += 1) {
    const match = /^(-|\d+)\t(-|\d+)\t(.*)$/su.exec(tokens[index])
    if (!match) continue
    let path = match[3]
    // A rename: empty path here, then the old and the new path.
    if (!path) {
      path = tokens[index + 2] || ''
      index += 2
    }
    const binary = match[1] === '-'
    counts.set(join(root, path), { additions: binary ? 0 : Number(match[1]), binary, deletions: binary ? 0 : Number(match[2]) })
  }
  return counts
}

function getSectionStatus(letter: string): WorkspaceChange['status'] {
  if (letter === 'A' || letter === '?') return 'added'
  if (letter === 'D') return 'deleted'
  return 'modified'
}

/**
 * Everything uncommitted under `root`, split into staged and unstaged the
 * way `git status` does, with line counts. Undefined outside a git work tree.
 */
export async function listWorkspaceChanges(root: string): Promise<WorkspaceChange[] | undefined> {
  let entries: Array<[string, string]>
  try {
    entries = await readGitStatus(root)
  } catch {
    return undefined
  }

  const [stagedCounts, unstagedCounts] = await Promise.all([readNumstat(root, ['--cached']), readNumstat(root, [])])
  const changes: WorkspaceChange[] = []
  await Promise.all(
    entries.map(async ([fileName, code]) => {
      const [index, tree] = [code[0], code[1]]
      if (code === '??') {
        // Untracked: not in any diff, every line is new.
        changes.push({ ...(await countTextLines(fileName)), deletions: 0, path: fileName, staged: false, status: 'added' })
        return
      }
      if (index !== ' ') {
        changes.push({ ...stagedCounts.get(fileName), path: fileName, staged: true, status: getSectionStatus(index) })
      }
      if (tree !== ' ') {
        changes.push({ ...unstagedCounts.get(fileName), path: fileName, staged: false, status: getSectionStatus(tree) })
      }
    }),
  )

  return changes.sort((first, second) => Number(second.staged) - Number(first.staged) || first.path.localeCompare(second.path))
}

/** Blob of `fileName` in the index (`:./path`), or undefined when it is not there. */
function readIndexFile(root: string, fileName: string) {
  const path = relative(root, fileName).split(sep).join('/')
  return runGitBuffer(['show', `:./${path}`], root).catch(() => undefined)
}

/** Patch of one file: staged is HEAD → index, unstaged is index → work tree. */
export async function getWorkspaceFilePatch(root: string, fileName: string, staged: boolean) {
  const head = (await runGit(['rev-parse', '--verify', '-q', 'HEAD'], root).catch(() => '')).trim()
  const scratch = await mkdtemp(join(tmpdir(), 'ai-ins-diff-'))
  try {
    if (staged) {
      const before = head ? await readBaselineFile(root, { commit: head, untracked: new Map() }, fileName) : undefined
      const index = await readIndexFile(root, fileName)
      let after: string | undefined
      if (index) {
        after = join(scratch, 'index')
        await writeFile(after, index)
      }
      return await diffBuffers(before, after, scratch, 0)
    }

    const before = await readIndexFile(root, fileName)
    const info = await stat(fileName).catch(() => undefined)
    return await diffBuffers(before, info?.isFile() ? fileName : undefined, scratch, 0)
  } finally {
    await rm(scratch, { force: true, recursive: true }).catch(() => {})
  }
}

/**
 * Stage or unstage files, as `git add` / `git restore --staged` would. Only
 * the index changes; the work tree is never touched.
 */
export async function setWorkspaceFilesStaged(root: string, fileNames: string[], staged: boolean) {
  const paths = fileNames.map((fileName) => relative(root, fileName).split(sep).join('/'))
  if (!paths.length) return
  if (staged) {
    // `-A` so a deleted file stages its removal.
    await runGit(['add', '-A', '--', ...paths], root)
    return
  }

  const head = (await runGit(['rev-parse', '--verify', '-q', 'HEAD'], root).catch(() => '')).trim()
  // No commit yet: nothing to restore from, so drop the entries from the index.
  await runGit(head ? ['restore', '--staged', '--', ...paths] : ['rm', '--cached', '-r', '-q', '--', ...paths], root)
}
