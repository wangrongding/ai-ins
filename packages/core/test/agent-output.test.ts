import { describe, expect, it } from 'vitest'
import { createAgentJsonFormatter } from '../src/agent-output'

function run(events: unknown[], root = '/repo/app') {
  const thinking: string[] = []
  const format = createAgentJsonFormatter(root, (text) => thinking.push(text))
  const output = events.map(format).join('')
  return { output, thinking: thinking.join('') }
}

const streamEvent = (event: unknown) => ({ event, type: 'stream_event' })

describe('createAgentJsonFormatter', () => {
  it('routes streamed thinking to onThinking and keeps it out of the reply', () => {
    const { output, thinking } = run([
      streamEvent({ content_block: { type: 'thinking' }, type: 'content_block_start' }),
      streamEvent({ delta: { thinking: 'Let me ', type: 'thinking_delta' }, type: 'content_block_delta' }),
      streamEvent({ delta: { thinking: 'check.', type: 'thinking_delta' }, type: 'content_block_delta' }),
      streamEvent({ type: 'content_block_stop' }),
      { message: { content: [{ thinking: 'Let me check.', type: 'thinking' }] }, type: 'assistant' },
      streamEvent({ content_block: { type: 'text' }, type: 'content_block_start' }),
      streamEvent({ delta: { text: 'Done.', type: 'text_delta' }, type: 'content_block_delta' }),
      streamEvent({ type: 'content_block_stop' }),
      { message: { content: [{ text: 'Done.', type: 'text' }] }, type: 'assistant' },
      { is_error: false, result: 'Done.', subtype: 'success', type: 'result' },
    ])
    expect(thinking).toBe('Let me check.')
    expect(output).toBe('Done.\n\n')
  })

  it('takes thinking from the settled message when nothing streamed', () => {
    const { output, thinking } = run([{ message: { content: [{ thinking: 'Plan it.', type: 'thinking' }, { text: 'Answer', type: 'text' }] }, type: 'assistant' }])
    expect(thinking).toBe('Plan it.\n\n')
    expect(output).toBe('Answer\n\n')
  })

  it('compresses tool calls to one line with project-relative paths', () => {
    const { output } = run([
      {
        message: {
          content: [
            { input: { file_path: '/repo/app/src/a.ts' }, name: 'Read', type: 'tool_use' },
            { input: { command: 'rm /repo/app/src/a.ts /etc/hosts' }, name: 'Bash', type: 'tool_use' },
          ],
        },
        type: 'assistant',
      },
    ])
    expect(output).toBe('[tool] Read src/a.ts\n[tool] Bash rm src/a.ts /etc/hosts\n')
  })

  it('drops hook and status chatter, and the result that repeats the reply', () => {
    const { output } = run([
      { subtype: 'hook_started', type: 'system' },
      { exit_code: 0, subtype: 'hook_response', type: 'system' },
      { subtype: 'thinking_tokens', type: 'system' },
      { message: { content: [{ text: 'Hi', type: 'text' }] }, type: 'assistant' },
      { result: 'Hi', subtype: 'success', type: 'result' },
    ])
    expect(output).toBe('Hi\n\n')
  })

  it('shows tool errors and failed results', () => {
    const { output } = run([
      { message: { content: [{ content: 'Permission denied\nmore', is_error: true, type: 'tool_result' }] }, type: 'user' },
      { is_error: true, result: 'Out of credits', subtype: 'error_during_execution', type: 'result' },
    ])
    expect(output).toBe('[tool error] Permission denied\n[result] Out of credits\n')
  })

  it('routes Codex reasoning items to onThinking', () => {
    const { output, thinking } = run([
      { item: { id: 'r1', text: 'Considering options', type: 'reasoning' }, type: 'item.completed' },
      { item: { id: 'm1', text: 'OK', type: 'agent_message' }, type: 'item.completed' },
    ])
    expect(thinking).toBe('Considering options\n\n')
    expect(output).toContain('OK')
  })
})
