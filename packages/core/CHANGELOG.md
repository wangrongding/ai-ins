# @ai-ins/core

## 1.0.0

### Major Changes

- 面板升级为对话式多轮会话，历史持久化，并补齐停止、重试、改动文件等日常操作。

  **破坏性变更**

  - 面板 class 前缀从 `wbx-ai-ins-` 缩短为 `ai-ins-`，CSS 变量同步改为 `--ai-ins-*`；如果你在项目里覆盖过面板样式，需要同步改选择器。
  - 为了能续跑，默认不再给 codex 传 `--ephemeral`、给 claude 传 `--no-session-persistence`，Agent CLI 会把会话写到磁盘；设置 `agents.sessions: false` 可恢复单轮、不落盘的行为。
  - 任务历史默认写入 `<root>/.ai-ins/runs/*.json`（建议把 `.ai-ins` 加入 `.gitignore`）；设置 `agents.history: false` 可只保存在内存里。
  - 交互规则调整：点左侧历史会话一定在该会话里继续；`Option` / `Alt` 点选页面元素一定开新会话。

  **多轮会话**

  - provider 新增声明式 `session` 配置（`assign` / `capture` / `none`）：claude 和 copilot 用 `--session-id` 预先指定 uuid，codex 从 `thread.started` 事件里捕获 `thread_id`，续跑分别走 `--resume` 和 `exec resume`；gemini 没有可验证的 resume 入口，保持单轮。
  - 一条会话由多轮组成；事件带 `turn` 和单调递增的 `seq`，SSE 重连用 `?since=` 游标，不重放已消费的历史。
  - 续跑轮不重发源码摘录；需要让上一条会话改新点选的元素时，可以用「改为在 X 里继续」把焦点切过去，prompt 里会注明焦点变更。
  - 会话在跑、provider 不支持、或没拿到会话 id 时，续跑入口会带原因禁用，不会静默退化成无上下文的新会话。

  **对话面板**

  - 右侧改为对话视图：需求是消息气泡，Agent 回复包在卡片里，较早轮次的长回复默认折叠；标题栏显示会话标题、焦点元素、Agent、轮数和日志路径。
  - 回复卡片显示这一轮的耗时；底部列出这一轮改动的文件（基于前后两次 git 状态对比，新增 / 修改 / 删除），点击即可在 IDE 打开。
  - 运行中可以「停止」这一轮，进程结束、会话保留，可以接着追问；失败、停止或被中断的最后一轮可以一键「重试」。
  - Agent 回复期间可以先写下一句，发送后排队，这一轮结束后自动接上；排队中的消息可以撤回。
  - 输入草稿按会话分别保存，切换会话或刷新页面都不会串。
  - Agent 选择改为输入框旁的自定义下拉；主题、界面语言、网络代理和发送快捷键收进面板右上角的设置弹窗。
  - 回复卡片底部有一行实时状态：等待模型响应、思考中（带最新一句思考内容，可展开）、工作中，耗时每秒更新，不会再出现空等；结束后思考过程折叠成「已思考 Ns」，可以回看，并随历史保存。思考内容不再混进回复正文（Claude 的 thinking、Codex 的 reasoning）。
  - 回复改用 `marked` 解析 GitHub 风格 Markdown，支持表格（含对齐，单元格内 `<br>` 换行）、嵌套列表、任务列表、斜体和删除线；代码块带一键复制，回复里的文件路径（如 `src/a.ts:12`）点击即可在 IDE 打开。仍由 React 渲染：回复里的其他 HTML 只显示为文本，图片显示为链接而不加载，链接只放行 http(s) 和 mailto。
  - 新增权限设置（询问我 / 自动编辑 / 完全访问，默认询问我）：Claude 需要授权的操作不再在非交互模式下被静默拒绝，而是通过自带的 MCP 桥（`--permission-prompt-tool`）在对话里弹出授权卡片，可以允许、本会话一直允许或拒绝；Codex 支持自动编辑 / 完全访问；不支持的档位只会退到更严格的一档。provider 新增 `permissions` 配置和 `{permissionArgs}` 占位符。
  - 面板支持多语言：English、简体中文、繁體中文、日本語、한국어、Español、Français、Deutsch、Português (Brasil)、Русский，默认跟随浏览器语言（不在支持范围内时用英文），也可以在设置里固定某种语言；时间格式与复数形式按所选语言显示。服务端返回给面板的提示改为消息 key，由面板按当前语言渲染。
  - Claude / Cursor 的 stream-json 输出按轮次有状态地格式化：流式文字直接拼成正文，工具调用压缩成一行（项目内路径显示为相对路径），hook、思考过程、工具结果和重复的 result 不再刷进对话；每轮输出在服务端直接累积，长回复不再丢掉开头。

  **历史会话**

  - 历史写入 `.ai-ins/runs/*.json`，刷新页面、重启 dev server 后列表和续跑能力都还在；运行中被重启打断的轮次标记为「已中断」，有会话的仍可继续追问。新增 `agents.history`（`false` 或 `{ limit }`，默认每个项目保留 100 条，运行中的不清理）。
  - 列表以第一句需求为标题，第二行是焦点元素和 Agent；按最近活动排序并按天分组，支持搜索和「清空已结束」；状态用颜色区分，只有无法继续的会话才额外标出原因。
  - 多个标签页 / 浏览器之间自动同步会话列表（按版本号轮询，列表没变时只是一次很小的请求）。
  - 右键会话可以置顶 / 取消置顶或删除；置顶的会话单独成组排在最上面，不会被自动清理或「清空已结束」删除。
  - 删除会话时连同它在 `.ai-ins/` 下的 `.log` 一起删除。

  **改动与 diff**

  - 每轮记录改动文件的增减行数和这一轮的 unified diff（对比的是这一轮开始时的工作区，借助 `git stash create` 取快照，不影响 stash 列表），在回复卡片里点文件即可展开 diff，右侧图标在 IDE 打开。
  - 侧边栏新增「会话 / 改动」切换：「改动」按 `git status` 分成已暂存 / 未暂存，显示增减行数和最后改动它的会话，点开看整页 diff，可以暂存 / 取消暂存单个文件或整组。

  **设置与体验**

  - 面板设置写入 `~/.ai-ins/settings.json`，跨项目、端口和浏览器共用（`AI_INS_HOME` 可改目录）；首次运行时迁移浏览器里已有的设置。
  - 可选的系统通知：任务完成、失败或等待授权且你没在看面板时提醒，点击打开对应会话。
  - Codex 的 `exec --json` 事件单独格式化：回复正文 + 每次工具调用一行，工具返回的大段内容（如 MCP 生成的代码）只留在日志里；旧会话加载时按日志重新整理。
  - 界面重新设计：左右分栏（品牌在侧边栏顶部，操作归到会话顶栏），配色与字体参考 ChatGPT 桌面端，动画品牌标识，新增使用说明；设置面板改为分组卡片。
  - 输入框的临时提示改为浮动提示条，不再推动布局；面板内滚动到尽头时不再带动背后的页面滚动。
  - 列表接口只返回摘要，已结束会话的对话记录点开时再加载。
  - SSE 断线（例如 dev server 重启）后退避重新拉取摘要对账，不再停在「连接断开」或反复重连。

## 0.4.10

### Patch Changes

- 5df7279: 新增 Astro 一等支持

  - 新增 `@ai-ins/astro` integration：仅在 `astro dev` 下挂载 AI Ins middleware 并通过页面脚本注入客户端，`astro build` 产物不受影响；`.astro` 模板在 Astro 编译前注入精确的 source 标记，React / Vue / Svelte 岛屿沿用 `@ai-ins/vite` 的注入；支持 Astro 4 ~ 7，不依赖 dev toolbar。
  - `ai-ins` CLI 识别 Astro 项目（优先于 vite），安装 `@ai-ins/astro` 并改写 `astro.config.*` 的 `integrations`；新增 `--bundler astro`。多行数组追加插件时保留 `]` 的原有换行，import 插入后不再多出空行。
  - core 客户端兼容 Astro 原生的 `data-astro-source-file` / `data-astro-source-loc` 作为定位回退，并加入幂等保护，避免同一页面被多个入口重复初始化。

## 0.4.9

### Patch Changes

- 修复 macOS 上「跳转到 IDE」拉不起 Zed。

  - `getEditorArgs` 不再把 Zed 并进 VS Code 家族：Zed CLI 既没有 `-r` 也没有 `-g`，只接受裸位置参数 `path:line:column`，原先发出的 `-r -g <path>:<line>:<col>` 会被 Zed 以 `unexpected argument '-r' found` 直接拒掉。新增的 Zed 判定同时认命令名 `zed` 与 `Zed.app` 下的任意可执行文件，PATH 上的 `zed`、应用二进制、CLI shim 三种写法都能带上行列号。
  - macOS 上拉起 Zed 时改用 `Zed.app/Contents/MacOS/cli` 而非 GUI 主二进制，复用已经开着的窗口而不是另起一个实例；探活仍然匹配 `MacOS/zed`，因为进程列表里出现的是它。
  - `getHostEditorPreference` 识别 `TERM_PROGRAM=zed`，且排在 `VSCODE_GIT_ASKPASS_NODE` 判断之前 —— 从 VS Code 终端启动的 Zed 会继承 `VSCODE_*` 残留，不抢先就会被误判成 VS Code。
  - `/__open-in-editor` 的子进程改为捕获 stderr，非零退出时打印完整命令与错误输出。此前编辑器命令被拒只会静默失败，接口照样返回 200。

## 0.4.8

### Patch Changes

- 组件级源定位：Option 点选不再只覆盖原生 DOM 标签。

  - JSX transform 现在也给组件元素（大写标识符与 `Foo.Bar` 成员表达式）注入 `data-ai-ins-source`：spread 透传型组件（Radix / shadcn 等 `{...props}` 直达 DOM 的包装，含 portal 到 `document.body` 的浮层）会把定位属性带到最终 DOM 上；注入改为 unshift，外层调用点透传的属性覆盖包装内部，点选定位到应用侧 JSX 而非组件库内部。跳过 Fragment 等 React 内建。
  - 客户端拾取新增 React fiber 兜底（`_debugSource`，React <= 18 dev）：属性链完全没命中（不透传 props 的组件、portal 场景）时从 fiber 树反查工作区源位置。
  - 拾取目标从 `HTMLElement` 放宽到 `Element`：svg / path 等图形元素也能被 Option 悬停与点选。
  - dock 与面板加 `pointer-events: auto`：宿主页面被 Radix 等 modal 浮层锁住 `body` 指针事件时不再失灵。

## 0.4.7

### Patch Changes

- Use macOS editor URL schemes for VS Code-compatible editors when opening source locations, avoiding the transient VS Code CLI helper window in the Dock.

## 0.4.6

### Patch Changes

- Prefer editor CLI launchers on macOS when opening source locations so VS Code and Cursor reuse the existing IDE window instead of spawning the app bundle executable directly.

## 0.4.5

### Patch Changes

- Polish the AI Ins panel branding, clarify built-in CLI provider names, and make backdrop clicks close the panel only after clicking from the backdrop itself.

## 0.4.4

### Patch Changes

- Allow the AI Ins panel to resize while preserving usable minimum dimensions.

## 0.4.3

### Patch Changes

- Improve Windows editor launch argument handling.

## 0.4.2

### Patch Changes

- Improve the AI Ins panel target selection flow and remove automatic history continuation from agent prompts.

## 0.4.1

### Patch Changes

- Add author and GitHub package metadata across published packages, and refresh the `ai-ins` CLI package README.

## 0.4.0

### Minor Changes

- Add the new React-based panel runtime in core, expose runtime config for the client,
  and improve Vite/Webpack dev-server integration for custom roots and client reloads.

## Unreleased

### Minor Changes

- Add built-in Gemini CLI and Cursor Agent CLI providers with model/proxy options and readable structured-output rendering.

## 0.3.4

### Patch Changes

- Prefer runnable Windows command shims like `.cmd` when resolving agent CLI commands so Codex, Claude, Copilot, and custom providers launch correctly.

## 0.3.3

### Patch Changes

- Release core and Vite packages alongside the CLI default init update.

## 0.3.2

### Patch Changes

- Improve editor command resolution on Windows and macOS, support shell-based editor commands on Windows, and allow Vite source attributes to be disabled for SSR hydration compatibility.

## 0.3.1

### Patch Changes

- 47ef2a8: Fix the published client runtime layout so `dist/client/style.css` is emitted at the path read by the runtime.

  Improve editor command resolution on Windows and macOS, and allow source attributes to be disabled when they conflict with framework SSR hydration.

## 0.3.0

### Minor Changes

- Add a built-in Copilot CLI provider and first-class Claude CLI options.

## 0.2.0

### Minor Changes

- 完成点选 dom 的跳转源码以及与 agent 交互的相关逻辑
