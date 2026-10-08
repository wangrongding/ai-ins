/**
 * Stand-alone MCP stdio server that Claude Code calls through
 * `--permission-prompt-tool` whenever a tool needs approval in `-p` mode.
 *
 * It forwards each request to the AI Ins dev server, which shows it in the
 * panel and holds the HTTP request open until the user answers. Runs as its
 * own process (spawned by the agent CLI), so it has no dependencies and only
 * talks newline-delimited JSON-RPC on stdio.
 */
import { request as httpRequest } from 'http'
import { request as httpsRequest } from 'https'

type JsonRpcMessage = {
  id?: number | string | null
  method?: string
  params?: Record<string, unknown>
}

type PermissionAnswer = { behavior: 'allow' | 'deny'; message?: string }

const permissionUrl = process.env.AI_INS_PERMISSION_URL || ''
const toolName = 'approve'

function send(message: Record<string, unknown>) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`)
}

/**
 * Plain http(s) instead of fetch: the user may take minutes to answer and
 * fetch's default headers timeout would abort the wait.
 */
function askDevServer(body: unknown) {
  return new Promise<PermissionAnswer>((resolve) => {
    const deny = (message: string) => resolve({ behavior: 'deny', message })
    if (!permissionUrl) {
      deny('AI Ins permission bridge is not configured.')
      return
    }

    const url = new URL(permissionUrl)
    const payload = JSON.stringify(body)
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(
      url,
      {
        headers: { 'Content-Length': Buffer.byteLength(payload), 'Content-Type': 'application/json' },
        method: 'POST',
        // Dev servers commonly use self-signed certificates.
        rejectUnauthorized: false,
      },
      (response) => {
        let text = ''
        response.setEncoding('utf8')
        response.on('data', (chunk: string) => {
          text += chunk
        })
        response.on('end', () => {
          try {
            const answer = JSON.parse(text) as PermissionAnswer
            resolve(answer.behavior === 'allow' ? { behavior: 'allow' } : { behavior: 'deny', message: answer.message || 'Denied by the user.' })
          } catch {
            deny(`AI Ins permission bridge failed: ${text.slice(0, 200)}`)
          }
        })
      },
    )

    request.on('error', (error) => deny(`AI Ins permission bridge failed: ${error.message}`))
    request.end(payload)
  })
}

async function handle(message: JsonRpcMessage) {
  const { id, method, params } = message

  if (method === 'initialize') {
    send({
      id,
      result: {
        capabilities: { tools: {} },
        protocolVersion: typeof params?.protocolVersion === 'string' ? params.protocolVersion : '2025-06-18',
        serverInfo: { name: 'ai-ins', version: '1.0.0' },
      },
    })
    return
  }

  if (method === 'tools/list') {
    send({
      id,
      result: {
        tools: [
          {
            description: 'Ask the AI Ins panel user whether a tool call may run.',
            inputSchema: {
              properties: {
                input: { type: 'object' },
                tool_name: { type: 'string' },
                tool_use_id: { type: 'string' },
              },
              required: ['tool_name', 'input'],
              type: 'object',
            },
            name: toolName,
          },
        ],
      },
    })
    return
  }

  if (method === 'tools/call') {
    const args = (params?.arguments ?? {}) as { input?: unknown; tool_name?: unknown; tool_use_id?: unknown }
    const answer = await askDevServer({ input: args.input ?? {}, toolName: args.tool_name, toolUseId: args.tool_use_id })
    // Claude Code reads the decision from the tool's text result.
    const decision = answer.behavior === 'allow' ? { behavior: 'allow', updatedInput: args.input ?? {} } : answer
    send({ id, result: { content: [{ text: JSON.stringify(decision), type: 'text' }] } })
    return
  }

  if (method === 'ping') {
    send({ id, result: {} })
    return
  }

  // Notifications (no id) need no reply; unknown requests get a JSON-RPC error.
  if (id !== undefined && id !== null) {
    send({ error: { code: -32601, message: `Method not found: ${method}` }, id })
  }
}

let buffered = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk: string) => {
  buffered += chunk
  const lines = buffered.split('\n')
  buffered = lines.pop() ?? ''
  for (const line of lines) {
    if (!line.trim()) continue
    try {
      void handle(JSON.parse(line) as JsonRpcMessage)
    } catch {
      // Not JSON-RPC; ignore.
    }
  }
})
process.stdin.on('end', () => process.exit(0))
