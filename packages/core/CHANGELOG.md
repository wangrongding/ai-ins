# @ai-ins/core

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
