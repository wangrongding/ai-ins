import { execFileSync } from 'child_process'
import { existsSync } from 'fs'
import { basename, delimiter, extname, isAbsolute, join } from 'path'

const macLaunchEditorCandidates = [
  '/Applications/Cursor.app/Contents/MacOS/Cursor',
  '/Applications/Visual Studio Code.app/Contents/MacOS/Code',
  '/Applications/Visual Studio Code - Insiders.app/Contents/MacOS/Code - Insiders',
  '/Applications/VSCodium.app/Contents/MacOS/Electron',
  '/Applications/Zed.app/Contents/MacOS/zed',
  '/Applications/WebStorm.app/Contents/MacOS/webstorm',
]

const commandLaunchEditorCandidates = ['cursor', 'code-insiders', 'code', 'codium', 'vscodium', 'zed', 'webstorm']
const macLaunchEditorCandidatesByCommand: Record<string, string[]> = {
  code: ['/Applications/Visual Studio Code.app/Contents/MacOS/Code'],
  'code-insiders': ['/Applications/Visual Studio Code - Insiders.app/Contents/MacOS/Code - Insiders'],
  codium: ['/Applications/VSCodium.app/Contents/MacOS/Electron'],
  cursor: ['/Applications/Cursor.app/Contents/MacOS/Cursor'],
  vscodium: ['/Applications/VSCodium.app/Contents/MacOS/Electron'],
  webstorm: ['/Applications/WebStorm.app/Contents/MacOS/webstorm'],
  zed: ['/Applications/Zed.app/Contents/MacOS/zed'],
}

function getRunningProcesses() {
  return execFileSync('ps', ['x', '-o', 'comm='], {
    stdio: ['ignore', 'pipe', 'ignore'],
  }).toString()
}

function normalizeEditorHint(value: string | undefined) {
  return value?.replace(/\\/g, '/').toLowerCase() ?? ''
}

function getHostEditorPreference() {
  const askpassNode = normalizeEditorHint(process.env.VSCODE_GIT_ASKPASS_NODE)

  if (askpassNode.includes('/cursor/') || askpassNode.endsWith('/cursor') || askpassNode.endsWith('/cursor.exe') || askpassNode.endsWith('/cursor.cmd')) {
    return 'cursor'
  }

  if (askpassNode.includes('code-insiders') || askpassNode.includes('visual studio code - insiders')) {
    return 'code-insiders'
  }

  if (
    askpassNode.includes('/microsoft vs code/') ||
    askpassNode.endsWith('/code') ||
    askpassNode.endsWith('/code.exe') ||
    askpassNode.endsWith('/code.cmd') ||
    process.env.TERM_PROGRAM?.toLowerCase() === 'vscode'
  ) {
    return 'code'
  }

  return null
}

function getLaunchEditorCommandOrder() {
  const preferredEditor = getHostEditorPreference()

  if (!preferredEditor) {
    return commandLaunchEditorCandidates
  }

  return [preferredEditor, ...commandLaunchEditorCandidates.filter((command) => command !== preferredEditor)]
}

function getMacLaunchEditorCandidateOrder() {
  const candidates = getLaunchEditorCommandOrder().flatMap((command) => macLaunchEditorCandidatesByCommand[command] ?? [])
  return [...candidates, ...macLaunchEditorCandidates.filter((candidate) => !candidates.includes(candidate))]
}

function getWindowsPathExtensions() {
  const extensions = (process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)

  return extensions.some((extension) => extension.toLowerCase() === '.ps1') ? extensions : [...extensions, '.PS1']
}

function resolvePathWithWindowsExtension(command: string) {
  if (process.platform !== 'win32' || extname(command)) {
    return existsSync(command) ? command : null
  }

  for (const extension of getWindowsPathExtensions()) {
    const commandWithExtension = `${command}${extension.toLowerCase()}`

    if (existsSync(commandWithExtension)) {
      return commandWithExtension
    }
  }

  return existsSync(command) ? command : null
}

function getWindowsCommandExtensionRank(command: string) {
  const extension = extname(command).toLowerCase()

  if (!extension) return 100
  if (extension === '.cmd') return 0
  if (extension === '.bat') return 1
  if (extension === '.exe') return 2
  if (extension === '.com') return 3
  if (extension === '.ps1') return 4

  const pathExtensionIndex = getWindowsPathExtensions().findIndex((candidate) => candidate.toLowerCase() === extension)
  return pathExtensionIndex >= 0 ? 10 + pathExtensionIndex : 50
}

function pickWindowsCommand(candidates: string[]) {
  return candidates
    .filter(Boolean)
    .sort((left, right) => getWindowsCommandExtensionRank(left) - getWindowsCommandExtensionRank(right))
    .at(0)
}

function resolveWindowsCommand(command: string) {
  try {
    const output = execFileSync('where.exe', [command], {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim()

    return pickWindowsCommand(output.split(/\r?\n/u)) ?? null
  } catch {
    const pathValue = process.env.PATH || process.env.Path || process.env.path || ''
    const extensions = extname(command) ? [''] : getWindowsPathExtensions()
    const candidates: string[] = []

    for (const pathEntry of pathValue.split(delimiter).filter(Boolean)) {
      const directory = pathEntry.trim().replace(/^['"](.+)['"]$/u, '$1')

      for (const extension of extensions) {
        const candidate = join(directory, `${command}${extension.toLowerCase()}`)

        if (existsSync(candidate)) {
          candidates.push(candidate)
        }
      }
    }

    return pickWindowsCommand(candidates) ?? null
  }
}

function resolvePosixCommand(command: string) {
  try {
    const output = execFileSync('/bin/sh', ['-c', 'command -v "$1"', 'ai-ins-command-lookup', command], {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim()

    return output.split(/\r?\n/).find(Boolean) ?? null
  } catch {
    return null
  }
}

export function resolveCommand(command: string) {
  const normalizedCommand = command.trim().replace(/^['"](.+)['"]$/, '$1')

  if (!normalizedCommand) {
    return null
  }

  if (isAbsolute(normalizedCommand) || normalizedCommand.includes('/') || normalizedCommand.includes('\\')) {
    return resolvePathWithWindowsExtension(normalizedCommand)
  }

  return process.platform === 'win32' ? resolveWindowsCommand(normalizedCommand) : resolvePosixCommand(normalizedCommand)
}

function getWindowsLaunchEditorCandidates(command: string) {
  const localAppData = process.env.LOCALAPPDATA
  const programFiles = process.env.ProgramFiles
  const programFilesX86 = process.env['ProgramFiles(x86)']
  const machineProgramRoots = [programFiles, programFilesX86].filter((root): root is string => Boolean(root))

  const getProgramCandidates = (appDirectory: string, commandFile: string, executableFile: string) => [
    ...(localAppData
      ? [
          join(localAppData, 'Programs', appDirectory, 'bin', commandFile),
          join(localAppData, 'Programs', appDirectory, executableFile),
        ]
      : []),
    ...machineProgramRoots.flatMap((root) => [
      join(root, appDirectory, 'bin', commandFile),
      join(root, appDirectory, executableFile),
    ]),
  ]

  const getCursorCandidates = () => [
    ...(localAppData
      ? [
          join(localAppData, 'Programs', 'Cursor', 'resources', 'app', 'bin', 'cursor.cmd'),
          join(localAppData, 'Programs', 'Cursor', 'Cursor.exe'),
          join(localAppData, 'Programs', 'cursor', 'resources', 'app', 'bin', 'cursor.cmd'),
          join(localAppData, 'Programs', 'cursor', 'Cursor.exe'),
        ]
      : []),
    ...machineProgramRoots.flatMap((root) => [
      join(root, 'Cursor', 'resources', 'app', 'bin', 'cursor.cmd'),
      join(root, 'Cursor', 'Cursor.exe'),
      join(root, 'cursor', 'resources', 'app', 'bin', 'cursor.cmd'),
      join(root, 'cursor', 'Cursor.exe'),
    ]),
  ]

  switch (command) {
    case 'cursor':
      return getCursorCandidates()
    case 'code-insiders':
      return getProgramCandidates('Microsoft VS Code Insiders', 'code-insiders.cmd', 'Code - Insiders.exe')
    case 'code':
      return getProgramCandidates('Microsoft VS Code', 'code.cmd', 'Code.exe')
    case 'codium':
    case 'vscodium':
      return getProgramCandidates('VSCodium', 'codium.cmd', 'VSCodium.exe')
    case 'zed':
      return getProgramCandidates('Zed', 'zed.exe', 'Zed.exe')
    default:
      return []
  }
}

function resolveWindowsLaunchEditor() {
  for (const command of getLaunchEditorCommandOrder()) {
    const resolvedCommand = resolveCommand(command)

    if (resolvedCommand) {
      return resolvedCommand
    }

    const resolvedCandidate = getWindowsLaunchEditorCandidates(command).find((candidate) => existsSync(candidate))

    if (resolvedCandidate) {
      return resolvedCandidate
    }
  }

  return null
}

export function ensureLaunchEditor(command: string) {
  if (command !== 'serve' || process.env.LAUNCH_EDITOR) {
    return
  }

  if (process.platform === 'darwin') {
    try {
      const runningProcesses = getRunningProcesses()
      const preferredEditor = getMacLaunchEditorCandidateOrder().find((candidate) => existsSync(candidate) && runningProcesses.includes(candidate))

      if (preferredEditor) {
        process.env.LAUNCH_EDITOR = preferredEditor
      }
    } catch {
      // Keep explicit LAUNCH_EDITOR / command lookup as fallback.
    }
  }

  if (process.platform === 'win32') {
    const preferredEditor = resolveWindowsLaunchEditor()

    if (preferredEditor) {
      process.env.LAUNCH_EDITOR = preferredEditor
    }
  }
}

export function resolveLaunchEditor() {
  if (process.env.LAUNCH_EDITOR) {
    return resolveCommand(process.env.LAUNCH_EDITOR) ?? process.env.LAUNCH_EDITOR
  }

  if (process.platform === 'darwin') {
    try {
      const runningProcesses = getRunningProcesses()
      const preferredEditor = getMacLaunchEditorCandidateOrder().find((candidate) => existsSync(candidate) && runningProcesses.includes(candidate))

      if (preferredEditor) {
        return preferredEditor
      }
    } catch {
      // Fall through to PATH lookup.
    }
  }

  if (process.platform === 'win32') {
    return resolveWindowsLaunchEditor()
  }

  for (const command of getLaunchEditorCommandOrder()) {
    const resolvedCommand = resolveCommand(command)

    if (resolvedCommand) {
      return resolvedCommand
    }
  }

  return null
}

export function shouldUseShellForCommand(command: string) {
  return process.platform === 'win32' && /\.(cmd|bat|ps1)$/i.test(command)
}

function quoteWindowsCmdArgument(value: string) {
  return `"${value.replace(/"/g, '""')}"`
}

export function getSpawnCommand(command: string, args: string[]) {
  if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(command)) {
    return {
      args: ['/d', '/c', `call ${[command, ...args].map(quoteWindowsCmdArgument).join(' ')}`],
      command: process.env.ComSpec || 'cmd.exe',
      shell: false,
      windowsVerbatimArguments: true,
    }
  }

  return {
    args,
    command,
    shell: shouldUseShellForCommand(command),
    windowsVerbatimArguments: false,
  }
}

export function getEditorArgs(editor: string, fileName: string, lineNumber: number, columnNumber: number) {
  switch (basename(editor).replace(/\.(exe|cmd|bat)$/i, '')) {
    case 'Code':
    case 'Code - Insiders':
    case 'Cursor':
    case 'code':
    case 'code-insiders':
    case 'codium':
    case 'cursor':
    case 'Electron':
    case 'VSCodium':
    case 'zed':
    case 'Zed':
      return ['-r', '-g', `${fileName}:${lineNumber}:${columnNumber}`]
    case 'webstorm':
    case 'webstorm64':
      return ['--line', String(lineNumber), '--column', String(columnNumber), fileName]
    default:
      return [fileName]
  }
}
