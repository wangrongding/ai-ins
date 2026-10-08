import { isAbsolute, relative, sep } from 'path'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function getStringRecordValue(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  return ''
}

function getNumberRecordValue(record: Record<string, unknown>, key: string) {
  const value = record[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function formatDelay(milliseconds: number | undefined) {
  if (milliseconds === undefined) {
    return ''
  }

  if (milliseconds < 1000) {
    return `${Math.round(milliseconds)}ms`
  }

  return `${Math.round(milliseconds / 100) / 10}s`
}

function collectMessageContentText(message: unknown) {
  if (!isRecord(message)) {
    return collectJsonText(message)
  }

  const content = message.content
  if (typeof content === 'string') {
    return content.trim() ? [content.trim()] : []
  }

  if (!Array.isArray(content)) {
    return collectJsonText(content)
  }

  return content
    .flatMap((item) => {
      if (typeof item === 'string') {
        return item.trim() ? [item.trim()] : []
      }

      if (!isRecord(item)) {
        return collectJsonText(item)
      }

      const itemType = getStringRecordValue(item, ['type'])
      if (itemType === 'text') {
        const text = getStringRecordValue(item, ['text'])
        return text ? [text] : []
      }

      if (itemType === 'tool_use') {
        const name = getStringRecordValue(item, ['name'])
        return name ? [`[tool] ${name}`] : []
      }

      if (itemType === 'tool_result') {
        return collectJsonText(item.content)
      }

      return collectJsonText(item)
    })
    .filter(Boolean)
}

function collectJsonText(value: unknown, depth = 0): string[] {
  if (depth > 5 || value === null || value === undefined) {
    return []
  }

  if (typeof value === 'string') {
    return value.trim() ? [value] : []
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return []
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectJsonText(item, depth + 1))
  }

  if (!isRecord(value)) {
    return []
  }

  const messageText = collectMessageContentText(value.message)
  if (messageText.length) {
    return messageText
  }

  const resultText = collectJsonText(value.result, depth + 1)
  if (resultText.length) {
    return resultText
  }

  const directText = getStringRecordValue(value, ['message', 'response', 'text', 'delta', 'content', 'summary', 'title', 'command', 'cmd', 'error', 'status'])
  if (directText) {
    return [directText]
  }

  return ['message', 'response', 'delta', 'content', 'item', 'event', 'tool_call', 'toolCall', 'result', 'data']
    .flatMap((key) => collectJsonText(value[key], depth + 1))
    .filter(Boolean)
}

function truncateAgentOutput(message: string, maxLength = 2400) {
  return message.length > maxLength ? `${message.slice(0, maxLength)}\n[ai-ins] output truncated\n` : message
}

function formatCursorSystemEvent(event: Record<string, unknown>) {
  const subtype = getStringRecordValue(event, ['subtype'])

  if (subtype === 'init') {
    const model = getStringRecordValue(event, ['model'])
    const cwd = getStringRecordValue(event, ['cwd'])
    return `[system] Cursor Agent started${model ? ` (${model})` : ''}${cwd ? ` in ${cwd}` : ''}\n`
  }

  return ''
}

function formatClaudeSystemEvent(event: Record<string, unknown>) {
  const subtype = getStringRecordValue(event, ['subtype'])

  if (subtype === 'init') {
    const version = getStringRecordValue(event, ['claude_code_version'])
    const model = getStringRecordValue(event, ['model'])
    return `[system] Claude Code started${version ? ` v${version}` : ''}${model ? ` (${model})` : ''}\n`
  }

  if (subtype === 'api_retry') {
    const attempt = getNumberRecordValue(event, 'attempt')
    const maxRetries = getNumberRecordValue(event, 'max_retries')
    const delay = formatDelay(getNumberRecordValue(event, 'retry_delay_ms'))
    const error = getStringRecordValue(event, ['error', 'error_status'])
    const errorLabel = error && error !== 'unknown' ? `: ${error}` : ''
    const retryLabel = attempt && maxRetries ? `${attempt}/${maxRetries}` : 'retry'
    const delayLabel = delay ? `, next in ${delay}` : ''
    return `[system] API retry ${retryLabel}${delayLabel}${errorLabel}\n`
  }

  return ''
}

export function formatAgentJsonLine(rawEvent: unknown) {
  if (!isRecord(rawEvent)) {
    return `${truncateAgentOutput(JSON.stringify(rawEvent))}\n`
  }

  const eventType = getStringRecordValue(rawEvent, ['type', 'event', 'kind', 'sessionUpdate'])
  if (eventType === 'system') {
    const systemMessage = formatClaudeSystemEvent(rawEvent) || formatCursorSystemEvent(rawEvent)
    if (systemMessage) {
      return systemMessage
    }
  }

  const text = collectJsonText(rawEvent)
    .filter((part) => part !== eventType)
    .join('')
    .trim()

  if (text) {
    if (/chunk|delta|partial/iu.test(eventType)) {
      return truncateAgentOutput(text)
    }

    return eventType ? `[${eventType}] ${truncateAgentOutput(text)}\n` : `${truncateAgentOutput(text)}\n`
  }

  const compactJson = truncateAgentOutput(JSON.stringify(rawEvent))
  return eventType ? `[${eventType}] ${compactJson}\n` : `${compactJson}\n`
}

// Claude-style stream-json (also cursor-agent) chatter that says nothing about
// the task: hook bookkeeping, command lists, token estimates, request status.
const quietSystemSubtypes = new Set(['commands_changed', 'hook_started', 'status', 'thinking_tokens'])

function getRecord(value: unknown) {
  return isRecord(value) ? value : undefined
}

function summarizeToolInput(input: unknown, root: string) {
  const record = getRecord(input)
  if (!record) {
    return ''
  }

  const summary = getStringRecordValue(record, ['file_path', 'path', 'command', 'pattern', 'url', 'query', 'description', 'prompt'])
  let firstLine = summary.split('\n', 1)[0]
  // Paths inside the project read better relative, the way the panel shows
  // files — both a bare path argument and paths inside a shell command.
  if (root) {
    const relativePath = isAbsolute(firstLine) ? relative(root, firstLine) : ''
    firstLine =
      relativePath && !relativePath.startsWith('..') && !isAbsolute(relativePath)
        ? relativePath
        : firstLine.split(`${root}${sep}`).join('')
  }

  return firstLine.length > 160 ? `${firstLine.slice(0, 160)}…` : firstLine
}

function getToolResultText(content: unknown) {
  if (typeof content === 'string') {
    return content
  }

  return collectJsonText(content).join('\n')
}

/**
 * One formatter per agent process. Claude streams a reply twice — as
 * `stream_event` text deltas and again as the settled `assistant` message —
 * then repeats the final text in `result`. Keeping a little state lets the
 * panel show the reply once, as it streams, instead of one line per delta.
 * Events of any other shape fall through to `formatAgentJsonLine`.
 *
 * Thinking is not part of the reply text: it goes to `onThinking`, so the
 * panel can show it live and fold it away once the answer starts.
 */
export function createAgentJsonFormatter(root = '', onThinking: (text: string) => void = () => {}) {
  let streamedTextSinceMessage = false
  let streamedThinkingSinceMessage = false
  let textBlockOpen = false
  let printedReplyText = false

  return (rawEvent: unknown): string => {
    const event = getRecord(rawEvent)
    const eventType = event ? getStringRecordValue(event, ['type']) : ''

    // Codex reports reasoning (when it shares any) as `reasoning` items.
    const codexItem = event && eventType.startsWith('item.') ? getRecord(event.item) : undefined
    if (codexItem?.type === 'reasoning') {
      const text = getStringRecordValue(codexItem, ['text', 'summary'])
      if (eventType === 'item.completed' && text) {
        onThinking(`${text}\n\n`)
      }
      return ''
    }

    if (!event || !['assistant', 'result', 'stream_event', 'system', 'user'].includes(eventType)) {
      return formatAgentJsonLine(rawEvent)
    }

    if (eventType === 'stream_event') {
      const streamEvent = getRecord(event.event)
      const streamType = streamEvent ? getStringRecordValue(streamEvent, ['type']) : ''

      if (streamType === 'content_block_start') {
        textBlockOpen = getRecord(streamEvent?.content_block)?.type === 'text'
        return ''
      }

      if (streamType === 'content_block_delta') {
        const delta = getRecord(streamEvent?.delta)
        if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
          streamedTextSinceMessage = true
          printedReplyText = true
          return delta.text
        }
        if (delta?.type === 'thinking_delta' && typeof delta.thinking === 'string') {
          streamedThinkingSinceMessage = true
          onThinking(delta.thinking)
        }
        return ''
      }

      if (streamType === 'content_block_stop' && textBlockOpen) {
        textBlockOpen = false
        return '\n\n'
      }

      return ''
    }

    if (eventType === 'system') {
      const subtype = getStringRecordValue(event, ['subtype'])
      if (quietSystemSubtypes.has(subtype)) {
        return ''
      }

      if (subtype === 'hook_response') {
        const exitCode = getNumberRecordValue(event, 'exit_code')
        if (!exitCode) {
          return ''
        }

        const hookName = getStringRecordValue(event, ['hook_name']) || 'hook'
        const stderr = getStringRecordValue(event, ['stderr', 'output'])
        return `[system] ${hookName} exited with code=${exitCode}${stderr ? `: ${truncateAgentOutput(stderr, 400).trim()}` : ''}\n`
      }

      return formatAgentJsonLine(rawEvent)
    }

    if (eventType === 'assistant') {
      const content = getRecord(event.message)?.content
      const items = Array.isArray(content) ? content : []
      const parts: string[] = []

      for (const item of items) {
        const record = getRecord(item)
        if (!record) continue

        if (record.type === 'text' && typeof record.text === 'string' && record.text.trim()) {
          // Already shown as it streamed.
          if (!streamedTextSinceMessage) {
            parts.push(`${record.text.trim()}\n\n`)
            printedReplyText = true
          }
        } else if (record.type === 'thinking' && typeof record.thinking === 'string' && record.thinking.trim()) {
          // Without partial messages the settled block is the only copy.
          if (!streamedThinkingSinceMessage) {
            onThinking(`${record.thinking.trim()}\n\n`)
          }
        } else if (record.type === 'tool_use') {
          const name = getStringRecordValue(record, ['name']) || 'tool'
          const summary = summarizeToolInput(record.input, root)
          parts.push(`[tool] ${name}${summary ? ` ${summary}` : ''}\n`)
        }
      }

      streamedTextSinceMessage = false
      streamedThinkingSinceMessage = false
      return parts.join('')
    }

    if (eventType === 'user') {
      // Tool results are file bodies and command output — the log keeps them;
      // the conversation only needs to know when one failed.
      const content = getRecord(event.message)?.content
      const items = Array.isArray(content) ? content : []
      return items
        .map((item) => {
          const record = getRecord(item)
          if (record?.type !== 'tool_result' || record.is_error !== true) return ''
          const text = getToolResultText(record.content).trim().split('\n', 1)[0]
          return `[tool error] ${truncateAgentOutput(text, 400).trim()}\n`
        })
        .join('')
    }

    // result
    const isError = event.is_error === true || (getStringRecordValue(event, ['subtype']) || 'success') !== 'success'
    const resultText = typeof event.result === 'string' ? event.result.trim() : ''
    if (isError) {
      return `[result] ${truncateAgentOutput(resultText || getStringRecordValue(event, ['subtype']) || 'error')}\n`
    }

    return !printedReplyText && resultText ? `${resultText}\n` : ''
  }
}
