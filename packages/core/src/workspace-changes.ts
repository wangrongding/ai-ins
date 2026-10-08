import { execFile } from 'child_process'
import { createHash } from 'crypto'
import { existsSync } from 'fs'
import { readFile, realpath, stat } from 'fs/promises'
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

/** Resolves to undefined when `root` is not inside a git work tree (or git is unavailable). */
export async function takeWorkspaceSnapshot(root: string): Promise<WorkspaceSnapshot | undefined> {
  try {
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
