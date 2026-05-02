const root = __WBX_ROOT__
const base = __WBX_BASE__
const defaultProxy = __WBX_AGENT_PROXY__
const agentProviders = __WBX_AGENT_PROVIDERS__
const defaultAgentProviderId = __WBX_DEFAULT_AGENT_PROVIDER__
const targetAttribute = 'data-dev-inspect-target'
const sourceAttribute = 'data-agent-source'
const sourceRangeAttribute = 'data-agent-source-range'
const dockPositionStorageKey = 'agent-dev-dev-inspect-dock-position'
const proxyStorageKey = 'agent-dev-dev-inspect-proxy'
const providerStorageKey = 'agent-dev-dev-inspect-provider'

let currentTarget
let dockButton
let dockPointerState
let draftTarget
let inspectPanel
let panelRefs
let selectedRunId
let suppressDockClick = false
let submitting = false

const runs = []
const runSubscriptions = new Map()
const providers = Array.isArray(agentProviders) && agentProviders.length ? agentProviders : [{ enabled: true, id: 'codex', label: 'Codex' }]
