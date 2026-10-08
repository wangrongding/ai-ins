const root = __AI_INS_ROOT__
const base = __AI_INS_BASE__
const defaultProxy = __AI_INS_AGENT_PROXY__
const agentProviders = __AI_INS_AGENT_PROVIDERS__
const defaultAgentProviderId = __AI_INS_DEFAULT_AGENT_PROVIDER__
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
// 右侧打开的会话就是 selectedRunId：有它时下一次提交一定接在这条会话里，没有时就是新会话。
// 续跑时把焦点切到新点选的 DOM：undefined 表示沿用该会话原来的焦点。
let continueTarget
// Option 点选会开新会话；之前打开的那条会话记在这里，面板据此提供「改在这条会话里继续」的入口。
let repointRunId

// 首次从服务端拉历史之前为 false，面板据此显示「加载中」而不是「还没有任务」。
let runsHydrated = false

const runs = []
const runSubscriptions = new Map()
// SSE 断开后（多半是 dev 服务重启）按退避重新拉摘要对账的定时器。
const runResyncTimers = new Map()
// 服务端任务列表的版本号；其他标签页新建 / 删除 / 续跑会话后它会变，轮询据此判断要不要重新拉列表。
let runsVersion = 0
let runListSyncTimer
const providers = Array.isArray(agentProviders) && agentProviders.length ? agentProviders : [{ enabled: true, id: 'codex', label: 'Codex' }]
