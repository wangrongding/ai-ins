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

  const directText = getStringRecordValue(value, ['message', 'text', 'delta', 'content', 'summary', 'title', 'command', 'cmd', 'error', 'status'])
  if (directText) {
    return [directText]
  }

  return ['message', 'delta', 'content', 'item', 'event', 'tool_call', 'toolCall', 'result', 'data']
    .flatMap((key) => collectJsonText(value[key], depth + 1))
    .filter(Boolean)
}

function truncateAgentOutput(message: string, maxLength = 2400) {
  return message.length > maxLength ? `${message.slice(0, maxLength)}\n[ai-ins] output truncated\n` : message
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
    const systemMessage = formatClaudeSystemEvent(rawEvent)
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
