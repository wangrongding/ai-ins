const root = __WBX_ROOT__
const base = __WBX_BASE__
const defaultProxy = __WBX_AGENT_PROXY__
const agentProviders = __WBX_AGENT_PROVIDERS__
const defaultAgentProviderId = __WBX_DEFAULT_AGENT_PROVIDER__
const targetAttribute = 'data-ai-ins-target'
const sourceAttribute = 'data-ai-ins-source'
const sourceRangeAttribute = 'data-ai-ins-source-range'
const dockPositionStorageKey = 'ai-ins-dock-position'
const proxyStorageKey = 'ai-ins-proxy'
const proxyModeStorageKey = 'ai-ins-proxy-mode'
const providerStorageKey = 'ai-ins-provider'

let currentTarget
let dockButton
let dockPointerState
let draftTarget
let aiInsPanel
let panelRefs
let selectedRunId
let suppressDockClick = false
let submitting = false

const runs = []
const runSubscriptions = new Map()
const providers = Array.isArray(agentProviders) && agentProviders.length ? agentProviders : [{ enabled: true, id: 'codex', label: 'Codex' }]
