# @ai-ins/core

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
