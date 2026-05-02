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

  const directText = getStringRecordValue(value, ['message', 'text', 'delta', 'content', 'summary', 'title', 'command', 'cmd', 'error', 'status'])
  if (directText) {
    return [directText]
  }

  return ['message', 'delta', 'content', 'item', 'event', 'tool_call', 'toolCall', 'result', 'data']
    .flatMap((key) => collectJsonText(value[key], depth + 1))
    .filter(Boolean)
}

function truncateAgentOutput(message: string, maxLength = 2400) {
  return message.length > maxLength ? `${message.slice(0, maxLength)}\n[inspect] output truncated\n` : message
}

export function formatAgentJsonLine(rawEvent: unknown) {
  if (!isRecord(rawEvent)) {
    return `${truncateAgentOutput(JSON.stringify(rawEvent))}\n`
  }

  const eventType = getStringRecordValue(rawEvent, ['type', 'event', 'kind', 'sessionUpdate'])
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
