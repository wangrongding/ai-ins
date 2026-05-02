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

export function buildAgentPrompt(options: {
  columnNumber: number
  context: ReturnType<typeof getSourceContext>
  endColumnNumber?: number
  endLineNumber?: number
  fileName: string
  lineNumber: number
  rawPrompt: string
  root: string
  layerSummary: string
}) {
  const { columnNumber, context, endColumnNumber, endLineNumber, fileName, layerSummary, lineNumber, rawPrompt, root } = options
  const displayPath = getDisplayPath(fileName, root)
  const sourceRange =
    endLineNumber && endColumnNumber
      ? `${displayPath}:${lineNumber}:${columnNumber}-${endLineNumber}:${endColumnNumber}`
      : `${displayPath}:${lineNumber}:${columnNumber}`

  return `You are an AI coding agent invoked from Agent Dev's dev inspect tool after the user Option-clicked a DOM node in the running Vite app.

User request:
${rawPrompt}

Clicked source location:
- ${displayPath}:${lineNumber}:${columnNumber}
- Source range: ${sourceRange}
- Context window: L${context.startLine}-L${context.endLine}

DOM source stack from clicked element:
${layerSummary}

Source excerpt:
\`\`\`
${context.text}
\`\`\`

Please edit the repository directly. Keep the change narrowly scoped to the clicked component/source region unless the request clearly requires nearby supporting changes. Preserve existing project style and run focused checks if they are cheap.`
}
