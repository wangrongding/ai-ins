import { readFileSync } from 'fs'
import type { IncomingMessage } from 'http'
import { isAbsolute, relative, resolve } from 'path'
import { fileURLToPath } from 'url'

export function parseOpenInEditorTarget(rawTarget: string, root: string) {
  const normalizedTarget = rawTarget.startsWith('file://') ? fileURLToPath(rawTarget) : rawTarget
  const match = normalizedTarget.match(/:(\d+)(?::(\d+))?$/)
  const fileName = (match ? normalizedTarget.slice(0, normalizedTarget.length - match[0].length) : normalizedTarget).replace(/^\/private/, '')

  return {
    columnNumber: match?.[2] ? Number(match[2]) : 1,
    fileName: isAbsolute(fileName) ? fileName : resolve(root, fileName),
    lineNumber: match?.[1] ? Number(match[1]) : 1,
  }
}

function parseSourceRangeTarget(rawTarget: string, root: string) {
  const normalizedTarget = rawTarget.startsWith('file://') ? fileURLToPath(rawTarget) : rawTarget
  const match = normalizedTarget.match(/:(\d+):(\d+)-(\d+):(\d+)$/)
  if (!match) {
    return null
  }

  const fileName = normalizedTarget.slice(0, normalizedTarget.length - match[0].length).replace(/^\/private/, '')
  return {
    endColumnNumber: Number(match[4]),
    endLineNumber: Number(match[3]),
    fileName: isAbsolute(fileName) ? fileName : resolve(root, fileName),
    startColumnNumber: Number(match[2]),
    startLineNumber: Number(match[1]),
  }
}

export function isPathInsideRoot(fileName: string, root: string) {
  const relativePath = relative(root, fileName)
  return relativePath && !relativePath.startsWith('..') && !isAbsolute(relativePath)
}

export function getSourceContext(fileName: string, lineNumber: number, radius = 12, endLineNumber = lineNumber) {
  const lines = readFileSync(fileName, 'utf-8').split(/\r?\n/u)
  const startLine = Math.max(1, lineNumber - radius)
  const endLine = Math.min(lines.length, Math.max(lineNumber, endLineNumber) + radius)
  const lineNumberWidth = String(endLine).length
  const text = lines
    .slice(startLine - 1, endLine)
    .map((line, index) => {
      const sourceLine = startLine + index
      const marker = sourceLine >= lineNumber && sourceLine <= endLineNumber ? '>' : ' '
      return `${marker} ${String(sourceLine).padStart(lineNumberWidth, ' ')} | ${line}`
    })
    .join('\n')

  return { endLine, startLine, text }
}

export function getDisplayPath(fileName: string, root: string) {
  const relativePath = relative(root, fileName)
  return relativePath && !relativePath.startsWith('..') && !isAbsolute(relativePath) ? relativePath : fileName
}

export function readRequestBody(req: IncomingMessage, limit = 1024 * 1024) {
  return new Promise<string>((resolveBody, reject) => {
    let body = ''

    req.setEncoding('utf-8')
    req.on('data', (chunk: string) => {
      body += chunk

      if (body.length > limit) {
        reject(new Error('request body too large'))
        req.destroy()
      }
    })
    req.on('end', () => resolveBody(body))
    req.on('error', reject)
  })
}

export function getLayerSummary(rawLayers: unknown, root: string) {
  if (!Array.isArray(rawLayers)) {
    return 'No DOM source stack was provided.'
  }

  const layers = rawLayers
    .filter((layer): layer is { name?: unknown; path?: unknown; range?: unknown } => Boolean(layer) && typeof layer === 'object')
    .map((layer) => {
      const name = typeof layer.name === 'string' ? layer.name : 'unknown'
      const path = typeof layer.path === 'string' ? layer.path : ''
      const range = typeof layer.range === 'string' ? parseSourceRangeTarget(layer.range, root) : null

      if (!path) {
        return `- ${name}`
      }

      const { columnNumber, fileName, lineNumber } = parseOpenInEditorTarget(path, root)
      const displayPath = getDisplayPath(fileName, root)
      return range && range.fileName === fileName
        ? `- ${name}: ${displayPath}:${range.startLineNumber}:${range.startColumnNumber}-${range.endLineNumber}:${range.endColumnNumber}`
        : `- ${name}: ${displayPath}:${lineNumber}:${columnNumber}`
    })

  return layers.length ? layers.join('\n') : 'No DOM source stack was provided.'
}

export function getSourceRangeForTarget(rawLayers: unknown, fileName: string, lineNumber: number, root: string) {
  if (!Array.isArray(rawLayers)) {
    return null
  }

  for (const layer of rawLayers) {
    if (!layer || typeof layer !== 'object' || !('range' in layer) || typeof layer.range !== 'string') {
      continue
    }

    const range = parseSourceRangeTarget(layer.range, root)
    if (range && range.fileName === fileName && range.startLineNumber === lineNumber) {
      return range
    }
  }

  return null
}

export function getLayerNameForTarget(rawLayers: unknown, fileName: string, lineNumber: number, root: string) {
  if (!Array.isArray(rawLayers)) {
    return getDisplayPath(fileName, root)
  }

  let fallbackName = ''
  for (const layer of rawLayers) {
    if (!layer || typeof layer !== 'object') {
      continue
    }

    const name = 'name' in layer && typeof layer.name === 'string' ? layer.name : ''
    const path = 'path' in layer && typeof layer.path === 'string' ? layer.path : ''
    if (!name || !path) {
      continue
    }

    if (!fallbackName) {
      fallbackName = name
    }

    const parsedTarget = parseOpenInEditorTarget(path, root)
    if (parsedTarget.fileName === fileName && parsedTarget.lineNumber === lineNumber) {
      return name
    }
  }

  return fallbackName || getDisplayPath(fileName, root)
}

type AgentPromptTarget = {
  columnNumber: number
  context: ReturnType<typeof getSourceContext>
  endColumnNumber?: number
  endLineNumber?: number
  fileName: string
  layerSummary: string
  lineNumber: number
  root: string
}

function buildTargetBlock(options: AgentPromptTarget) {
  const { columnNumber, context, endColumnNumber, endLineNumber, fileName, layerSummary, lineNumber, root } = options
  const displayPath = getDisplayPath(fileName, root)
  const sourceRange =
    endLineNumber && endColumnNumber
      ? `${displayPath}:${lineNumber}:${columnNumber}-${endLineNumber}:${endColumnNumber}`
      : `${displayPath}:${lineNumber}:${columnNumber}`

  return `Clicked source location:
- ${displayPath}:${lineNumber}:${columnNumber}
- Source range: ${sourceRange}
- Context window: L${context.startLine}-L${context.endLine}

DOM source stack from clicked element:
${layerSummary}

Source excerpt:
\`\`\`
${context.text}
\`\`\``
}

export function buildAgentPrompt(options: AgentPromptTarget & { rawPrompt: string }) {
  return `You are an AI coding agent invoked from AI Ins after the user Option-clicked a DOM node in the running app.

User request:
${options.rawPrompt}

${buildTargetBlock(options)}

Please edit the repository directly. Keep the change narrowly scoped to the clicked component/source region unless the request clearly requires nearby supporting changes. Preserve existing project style and run focused checks if they are cheap.`
}

/**
 * A new conversation started without picking an element: the request is about
 * the project as a whole. The page the user is looking at is the best hint of
 * where to start, so it goes in when the panel sends it.
 */
export function buildWorkspaceAgentPrompt(options: { pageUrl?: string; rawPrompt: string; root: string }) {
  const page = options.pageUrl ? `\nThe user had this page of the running app open: ${options.pageUrl}\n` : ''
  return `You are an AI coding agent invoked from the AI Ins panel in the running app. The user did not pick a specific element, so the request may concern any part of the project.

User request:
${options.rawPrompt}
${page}
Project root: ${options.root}

Please work in this repository directly. Find the relevant code yourself, keep the change focused on what was asked, preserve existing project style, and run focused checks if they are cheap.`
}

/**
 * Prompt for turn 2+ of an existing agent session. The agent still holds the
 * first turn's source excerpt and its own edits, so re-sending that block would
 * just burn context and invite it to redo work — `target` is only passed when
 * the user re-pointed AI Ins at a different element.
 */
export function buildFollowUpAgentPrompt(options: {
  previousDisplayPath: string
  rawPrompt: string
  target?: AgentPromptTarget
  turnNumber: number
}) {
  const { previousDisplayPath, rawPrompt, target, turnNumber } = options
  // No previous focus: the conversation was started for the project as a whole.
  const previous = previousDisplayPath || 'none, the whole project'
  const focusBlock = target
    ? `\nThe user re-pointed AI Ins at a different element (previous focus: ${previous}). Treat the block below as the new focus:\n\n${buildTargetBlock(target)}\n`
    : previousDisplayPath
      ? `\nSame focus as the previous turn: ${previousDisplayPath}\n`
      : '\nNo specific element is in focus; the request concerns the project as a whole.\n'

  return `Follow-up request from AI Ins — turn ${turnNumber} of the same session. You already have the earlier turns in context, including any edits you made.

User request:
${rawPrompt}
${focusBlock}
Apply the same constraints as before: edit the repository directly, keep the change narrowly scoped, and preserve existing project style.`
}

