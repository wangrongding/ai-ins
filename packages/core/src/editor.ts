import { execSync } from 'child_process'
import { existsSync } from 'fs'
import { basename, isAbsolute } from 'path'

const macLaunchEditorCandidates = [
  '/Applications/Cursor.app/Contents/MacOS/Cursor',
  '/Applications/Visual Studio Code.app/Contents/MacOS/Code',
  '/Applications/Visual Studio Code - Insiders.app/Contents/MacOS/Code - Insiders',
  '/Applications/VSCodium.app/Contents/MacOS/Electron',
  '/Applications/Zed.app/Contents/MacOS/zed',
  '/Applications/WebStorm.app/Contents/MacOS/webstorm',
]

const commandLaunchEditorCandidates = ['cursor', 'code-insiders', 'code', 'codium', 'vscodium', 'zed', 'webstorm']

function getRunningProcesses() {
  return execSync('ps x -o comm=', {
    stdio: ['ignore', 'pipe', 'ignore'],
  }).toString()
}

function commandExists(command: string) {
  try {
    execSync(`command -v ${command}`, {
      shell: '/bin/zsh',
      stdio: ['ignore', 'ignore', 'ignore'],
    })
    return true
  } catch {
    return false
  }
}

export function resolveCommand(command: string) {
  if (isAbsolute(command) || command.includes('/')) {
    return existsSync(command) ? command : null
  }

  return commandExists(command) ? command : null
}

export function ensureLaunchEditor(command: string) {
  if (command !== 'serve' || process.platform !== 'darwin' || process.env.LAUNCH_EDITOR) {
    return
  }

  try {
    const runningProcesses = getRunningProcesses()
    const preferredEditor = macLaunchEditorCandidates.find((candidate) => existsSync(candidate) && runningProcesses.includes(candidate))

    if (preferredEditor) {
      process.env.LAUNCH_EDITOR = preferredEditor
    }
  } catch {
    // Keep explicit LAUNCH_EDITOR / command lookup as fallback.
  }
}

export function resolveLaunchEditor() {
  if (process.env.LAUNCH_EDITOR) {
    return process.env.LAUNCH_EDITOR
  }

  if (process.platform === 'darwin') {
    try {
      const runningProcesses = getRunningProcesses()
      const preferredEditor = macLaunchEditorCandidates.find((candidate) => existsSync(candidate) && runningProcesses.includes(candidate))

      if (preferredEditor) {
        return preferredEditor
      }
    } catch {
      // Fall through to PATH lookup.
    }
  }

  return commandLaunchEditorCandidates.find((candidate) => commandExists(candidate)) ?? null
}

export function getEditorArgs(editor: string, fileName: string, lineNumber: number, columnNumber: number) {
  switch (basename(editor).replace(/\.(exe|cmd|bat)$/i, '')) {
    case 'Code':
    case 'Code - Insiders':
    case 'code':
    case 'code-insiders':
    case 'codium':
    case 'cursor':
    case 'Electron':
    case 'VSCodium':
    case 'zed':
      return ['-r', '-g', `${fileName}:${lineNumber}:${columnNumber}`]
    case 'webstorm':
      return ['--line', String(lineNumber), '--column', String(columnNumber), fileName]
    default:
      return [fileName]
  }
}
