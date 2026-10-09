/**
 * Simplified Chinese panel copy. This file is the source of truth for message
 * keys: every other locale must provide exactly these keys (checked by tsc).
 *
 * - `{name}` placeholders are filled from the params passed to `t()`.
 * - A value may be `{ one, few, many, other, … }` in locales with plural
 *   forms; `{count}` picks the form. Chinese has none, so every value here is
 *   a plain string.
 */
export const zhCN = {
  // Header / chrome
  'panel.collapse': '收起',
  'panel.close': '关闭',

  // Sidebar
  'sidebar.newConversation': '新会话',
  'sidebar.newConversationTitle': '开一个新会话；也可以直接 Option / Alt 点选页面元素',
  'sidebar.history': '历史会话',
  'sidebar.clearFinished': '清空已结束',
  'sidebar.clearFinishedTitle': '删除所有已结束的会话记录（日志文件保留）',
  'sidebar.clearFinishedConfirm': '清空 {count} 条已结束的会话？运行中的会话会保留，日志文件不会删除。',
  'sidebar.clearedCount': '已清空 {count} 条已结束的会话。',
  'sidebar.clearedNone': '没有已结束的会话。',
  'sidebar.search': '搜索会话',
  'sidebar.searchPlaceholder': '搜索需求、组件或文件',
  'sidebar.loading': '正在加载历史会话…',
  'sidebar.noMatch': '没有匹配的会话',
  'sidebar.empty': '还没有会话',
  'sidebar.turnCount': '{count} 轮',
  'sidebar.viewRuns': '会话',
  'sidebar.viewChanges': '改动',
  'sidebar.view': '侧边栏视图',
  'changes.title': '未提交的改动',
  'changes.refresh': '刷新',
  'changes.empty': '工作区很干净，没有未提交的改动。',
  'changes.unavailable': '这个项目不在 git 仓库里，没法列出改动。',
  'changes.loading': '正在读取改动…',
  'changes.fromRun': '来自会话',
  'changes.back': '回到会话',
  'changes.stage': '暂存',
  'changes.unstage': '取消暂存',
  'changes.stageAll': '全部暂存',
  'changes.unstageAll': '全部取消暂存',
  'changes.staged': '已暂存',
  'changes.unstaged': '未暂存',
  'changes.stagedVs': '已暂存 · 相对上次提交（HEAD）',
  'changes.unstagedVs': '未暂存 · 相对暂存区',
  'sidebar.pin': '置顶',
  'sidebar.unpin': '取消置顶',
  'sidebar.delete': '删除',
  'sidebar.pinned': '已置顶',
  'sidebar.runMenu': '会话操作',
  'sidebar.cannotContinue': '无法继续',

  // Day groups and times
  'time.today': '今天',
  'time.yesterday': '昨天',
  'time.last7Days': '最近 7 天',
  'time.earlier': '更早',
  'time.yesterdayAt': '昨天 {time}',

  // Run / turn status
  'status.starting': '启动中',
  'status.running': '运行中',
  'status.done': '已完成',
  'status.failed': '失败',
  'status.disconnected': '连接断开',
  'status.waiting': '等待',
  'status.stopped': '已停止',
  'status.interrupted': '已中断',
  'status.turnInterrupted': '被中断',
  'status.stopping': '正在停止…',

  // Why a conversation cannot take another turn (server sends the code)
  'resume.running': '这条会话还在运行，等它结束再继续。',
  'resume.unsupported': '{provider} 不支持在同一会话里继续，只能开新会话。',
  'resume.noSession': '没有拿到 {provider} 的会话 id，无法继续；开一个新会话吧。',
  'resume.notStarted': '{provider} 第一轮没有真正跑起来，没有可以接着聊的会话；开一个新会话吧。',
  'resume.gone': 'dev 服务里已经没有这条会话（重启过且没有保存历史），只能开新会话。',
  'resume.blocked': '这条会话没法继续；Option / Alt 点选页面元素开一个新会话。',
  'resume.singleTurn': '{provider} 只支持单轮，这条会话结束后不能继续。',

  // Chat header
  'chat.newConversation': '新会话',
  'chat.newConversationHint': '{provider} · 发送后出现在左侧历史里',
  'chat.logTitle': '日志 {log}',
  'chat.expand': '放大对话',
  'chat.stop': '停止',
  'chat.stopTitle': '结束这一轮，会话保留，可以接着追问',
  'chat.delete': '删除',
  'chat.deleteRunningConfirm': '这条会话还在运行，停止并删除它？',
  'chat.followLatest': '查看最新',

  // Empty states
  'empty.newTitle': '新会话',
  'empty.focus': '焦点：',
  'empty.newWithTarget': '描述你想怎么改它。发送后这条会话会出现在左侧，之后点它就能接着追问。',
  'empty.startTitle': '开始一个新会话',
  'empty.pickHint': '直接描述你想做什么，Agent 会在整个项目里找相关代码；按住 Option / Alt 点击页面元素，可以让它从这个元素的源码开始改。',
  'empty.historyHint': '或者点左侧的历史会话，接着之前的上下文继续追问。',
  'empty.loadingTranscript': '正在加载对话记录…',
  'empty.transcriptNotLoaded': '对话记录还没加载，稍等或重新点一下左侧会话。',

  // Messages / turn cards
  'turn.focusChanged': '焦点切到 {focus}',
  'turn.fullPrompt': '完整 prompt',
  'turn.resumed': '续跑',
  'turn.duration': '耗时',
  'turn.index': '第 {index} 轮',
  'turn.waitingOutput': '等待输出…',
  'turn.noOutput': '这一轮没有输出。',
  'turn.noDisplayableReply': '没有可展示的回复。',
  'turn.expandAll': '展开全部 · {count} 行',
  'turn.collapse': '收起',
  'turn.stoppedNote': '这一轮被你停止了。',
  'turn.interruptedNote': '这一轮被中断了（dev 服务重启）。',
  'turn.failedNote': '这一轮没有成功。',
  'turn.retry': '重试',
  'turn.queued': '排队中 · 这一轮结束后自动发送',
  'turn.withdraw': '撤回',
  'turn.diagnostics': '已折叠 {count} 条诊断日志',
  'turn.tool': '工具',
  'turn.log': '日志：',

  // Changed files
  'files.none': '没有改动文件',
  'files.changed': '改动了 {count} 个文件',
  'files.more': '还有 {count} 个文件',
  'files.collapse': '收起',
  'files.open': '在 IDE 打开 {path}',
  'files.deletedTitle': '{path}（已删除）',
  'files.added': '新增',
  'files.modified': '修改',
  'files.deleted': '删除',
  'files.showDiff': '查看 {path} 的改动',
  'files.diffLoading': '加载改动…',
  'files.diffUnavailable': '这一轮没有记录这个文件的 diff（较早的会话，或改动太大）',
  'files.diffBinary': '二进制文件，无法显示 diff',
  'files.diffTruncated': 'diff 太长，只显示了前面一部分',
  'files.diffEmpty': '内容和开始时一样（可能改了又改回去）',

  // Composer
  'composer.repointQuestion': '想让上一条会话接着改这个元素？',
  'composer.repointAction': '改为在「{title}」里继续',
  'composer.queueingNote': '{provider} 正在回复。现在发送的消息会在这一轮结束后自动接上。',
  'composer.repointedNote': '这一轮会把焦点切到下面这个元素，上下文仍在同一条会话里。',
  'composer.badgeContinue': '继续 · 第 {index} 轮',
  'composer.badgeNew': '新会话',
  'composer.keepFocus': '{focus} · 沿用会话焦点',
  'composer.pickTarget': '整个项目 · 按住 Option / Alt 点选元素可指定焦点',
  'composer.wholeProject': '整个项目',
  'composer.copyLocation': '复制源码位置',
  'composer.copied': '已复制',
  'composer.openInIde': 'IDE 打开',
  'composer.placeholderContinue': '接着上一轮说，Agent 记得之前的上下文和它改过的代码',
  'composer.placeholderNew': '描述你想怎么改这个元素',
  'composer.placeholderPick': '描述你想做什么，Agent 会在整个项目里找相关代码',
  'composer.send': '发送',
  'composer.continue': '继续追问',
  'composer.proxySystem': '系统代理',
  'composer.proxyCustom': '自定义代理',
  'composer.proxyMissing': '代理未填写',
  'composer.proxySystemMissing': '未检测到系统代理',
  'composer.proxyTitle': 'Agent 会通过 {proxy} 联网，点击修改代理设置',
  'composer.queue': '结束后发送',
  'composer.sending': '发送中',

  // Composer status line
  'status.copied': '已复制源码位置。',
  'status.openedInIde': '已在 IDE 打开。',
  'status.copyFailed': '复制失败。',
  'status.alreadyQueued': '已经有一条在排队了，撤回后可以改了再发。',
  'status.queueReturned': '这条会话没法继续，排队的消息已放回输入框。',
  'status.agentNotConfigured': '这个 Agent 还没有配置。',
  'status.customProxyMissing': '先在设置里填写自定义代理地址。',
  'status.startingProvider': '正在启动 {provider}...',
  'status.continuingProvider': '正在继续 {provider}...',

  // Errors the server reports by key
  'error.notRunning': '这条会话当前没有在运行。',

  // Agent picker
  'agent.notConfigured': '未配置',
  'agent.singleTurn': '单轮',
  'agent.lockedTitle': '这条会话由 {provider} 发起，继续时只能用它；换 Agent 请开新会话。',
  'agent.availableTitle': '已接入 {providers}。切换只影响新会话。',
  'agent.noneAvailable': '还没有可用 Agent。',

  // Settings
  'settings.title': '设置',
  'settings.general': '通用',
  'settings.agent': 'Agent',
  'settings.close': '关闭设置',
  'settings.triggerTitle': '设置 · 代理：{proxy} · 发送：{shortcut}',
  'help.title': '使用说明',
  'help.triggerTitle': '使用说明',
  'help.close': '关闭说明',
  'help.pickTitle': '选中元素',
  'help.pick': '按住 Option / Alt 点击页面上的任意元素，它会成为新会话的焦点，Agent 会拿到它的源码位置。',
  'help.askTitle': '描述需求',
  'help.ask': '在输入框里写下想怎么改，按 {send} 发送。Agent 会直接修改项目代码，页面热更新后就能看到效果。',
  'help.reviewTitle': '检查改动',
  'help.review': '回复卡片底部列出这一轮改动的文件：点文件名在面板里看 diff，点右侧图标在 IDE 打开。',
  'help.continueTitle': '接着追问',
  'help.continue': '点左侧的会话会带着之前的上下文继续；右键会话可以置顶或删除。选中会话后再 Option / Alt 点击别的元素，可以选择在这条会话里接着改它。',
  'help.settingsTitle': '权限与设置',
  'help.settings': '右上角的设置里可以选 Agent 的权限（{ask} / {edit} / {full}），以及网络代理、发送快捷键、主题和语言。',
  'help.shortcuts': '快捷键',
  'help.keyPick': '选中元素',
  'help.keyPickKeys': 'Option / Alt + 点击',
  'help.keySend': '发送',
  'help.keyClose': '关闭面板',
  'help.dock': '面板关闭后，点页面角落的悬浮按钮就能重新打开，按钮可以拖动。',
  'settings.proxy': '网络代理',
  'settings.proxyOff': '关闭',
  'settings.proxySystem': '系统',
  'settings.proxyCustom': '自定义',
  'settings.proxyNeedsUrl': '需填写',
  'settings.proxyDetected': '已检测',
  'settings.proxyNotDetected': '未检测',
  'settings.proxyAddress': '代理地址',
  'settings.proxySystemMissing': '未检测到系统/默认代理',
  'settings.proxyNone': '不为 Agent 设置代理',
  'settings.proxyNote': '只影响之后启动的 Agent 进程。',
  'settings.notify': '完成通知',
  'settings.notifyNote': '任务完成、失败或等你授权时，如果你没在看这个面板，会发一条系统通知。',
  'settings.notifyDenied': '浏览器已禁止这个网站发通知，请在地址栏左侧的网站设置里允许后再打开。',
  'settings.notifyUnsupported': '当前浏览器不支持通知（需要 HTTPS 或 localhost）。',
  'notify.done': '{provider} 已完成',
  'notify.failed': '{provider} 失败了',
  'notify.waiting': '{provider} 在等你授权',
  'settings.shortcut': '发送快捷键',
  'settings.theme': '主题',
  'settings.themeDark': '深色',
  'settings.themeLight': '浅色',
  'settings.language': '语言',
  'settings.languageAuto': '跟随浏览器',

  // Tool permissions
  'permission.title': '{provider} 请求授权',
  'permission.tool': '想要使用 {tool}',
  'permission.allow': '允许',
  'permission.always': '本会话一直允许',
  'permission.deny': '拒绝',
  'permission.waiting': '待授权',
  'permission.waitingNote': '{provider} 在等你决定，选择后会接着往下做。',
  'permission.recordAllow': '已允许',
  'permission.recordAlways': '已允许（本会话不再询问）',
  'permission.recordDeny': '已拒绝',
  'permission.recordCancelled': '授权请求已取消',
  'settings.permission': '权限',
  'settings.permissionAsk': '询问我',
  'settings.permissionEdit': '自动编辑',
  'settings.permissionFull': '完全访问',
  'settings.permissionAskNote': '自动允许编辑文件；其他需要授权的操作会在对话里问你。',
  'settings.permissionEditNote': '自动允许编辑文件；其他需要授权的操作直接拒绝。',
  'settings.permissionFullNote': '不再询问，Agent 可以执行任何命令和工具。只在你信任的项目里使用。',
  'settings.permissionFallback': '{provider} 不支持「{requested}」，会按「{actual}」运行。',
  'settings.permissionFixed': '{provider} 的权限由它自己的启动参数决定，这里的设置对它不生效。',
  'turn.fullAccess': '完全访问',
  'dock.waitingPermission': '{count} 个会话等待授权',
  'dock.open': '打开 AI Ins',
  'error.permissionGone': '这个授权请求已经失效了（Agent 可能已经结束）。',
  'error.diffGone': '这个文件的 diff 已经不存在了',

  // Prompt / transcript modals
  'modal.promptAria': '查看发送给 {provider} 的完整 prompt',
  'modal.promptTitle': '第 {index} 轮发送给 {provider} 的完整 prompt',
  'modal.promptResumed': '续跑轮不会重发源码上下文——Agent 已经在同一个会话里，下面就是这一轮真正发过去的内容。',
  'modal.promptFirst': '这里是启动这条会话时真正发送给 {provider} 的完整 prompt，包含源码位置和 DOM source stack。',
  'modal.promptMissing': '这一轮还没有记录完整 prompt；请打开日志文件 {log} 检查启动命令和 prompt 正文。',
  'modal.logFile': '日志文件：{log}',
  'modal.transcriptSubtitle': '{provider} · {turns}',

  // Dock button
  'dock.running': '{count} 个会话运行中',
  'dock.total': '{count} 个 AI Ins 会话',

  // Live activity and reasoning
  'thinking.live': '思考中',
  'thinking.waiting': '等待 {provider} 响应',
  'thinking.working': '{provider} 工作中',
  'thinking.done': '已思考 {duration}',
  'thinking.title': '思考过程',

  // Markdown replies
  'markdown.copyCode': '复制代码',
  'markdown.copied': '已复制',
  'markdown.openFile': '在 IDE 打开 {path}',

  // Notices embedded in output by the server or the panel
  'notice.panelTruncated': '面板输出过长，已保留开头和最新部分；完整输出请打开日志文件。',
  'notice.historyTruncated': '历史记录只保留这一轮输出的开头和结尾；完整输出请打开日志文件。',

  // Built-in diagnostics folding (codex noise)
  'diagnostic.codexStateDb': 'Codex 状态索引不一致，已回退到文件查找。',
  'diagnostic.codexPluginSync': 'Codex 插件列表预热失败：chatgpt.com 返回 403 / Cloudflare challenge。',
  'diagnostic.pluginManifest': '插件 manifest 警告：{detail}',
  'diagnostic.skillLoader': 'Skill 加载警告：{detail}',
  'diagnostic.analytics': '分析事件上报警告：{detail}',
} as const

export type MessageKey = keyof typeof zhCN

/**
 * A plain string, or plural forms selected by `Intl.PluralRules` on the
 * `count` param (e.g. Russian needs one / few / many). `other` is required
 * and used for any form a locale leaves out.
 */
export type Message = string | ({ other: string } & Partial<Record<'few' | 'many' | 'one' | 'two' | 'zero', string>>)

export type MessageCatalog = Record<MessageKey, Message>
