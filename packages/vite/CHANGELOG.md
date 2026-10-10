# @ai-ins/vite

## 1.0.4

### Patch Changes

- Updated dependencies
  - @ai-ins/core@1.0.4

## 1.0.3

### Patch Changes

- Updated dependencies
  - @ai-ins/core@1.0.3

## 1.0.2

### Patch Changes

- Updated dependencies
  - @ai-ins/core@1.0.2

## 1.0.1

### Patch Changes

- Updated dependencies
  - @ai-ins/core@1.0.1

## 1.0.0

### Major Changes

- 与 `@ai-ins/core` 1.0.0 同步发布：面板升级为对话式多轮会话，历史持久化，支持停止、重试、排队发送和改动文件列表。破坏性变更（class 前缀改为 `ai-ins-`、会话默认落盘、历史写入 `.ai-ins/runs/`）见 `@ai-ins/core` 的 CHANGELOG。

### Patch Changes

- Updated dependencies
  - @ai-ins/core@1.0.0

## 0.4.11

### Patch Changes

- Updated dependencies [5df7279]
  - @ai-ins/core@0.4.10

## 0.4.10

### Patch Changes

- Updated dependencies
  - @ai-ins/core@0.4.9

## 0.4.9

### Patch Changes

- 组件级源定位：Option 点选不再只覆盖原生 DOM 标签。

  - JSX transform 现在也给组件元素（大写标识符与 `Foo.Bar` 成员表达式）注入 `data-ai-ins-source`：spread 透传型组件（Radix / shadcn 等 `{...props}` 直达 DOM 的包装，含 portal 到 `document.body` 的浮层）会把定位属性带到最终 DOM 上；注入改为 unshift，外层调用点透传的属性覆盖包装内部，点选定位到应用侧 JSX 而非组件库内部。跳过 Fragment 等 React 内建。
  - 客户端拾取新增 React fiber 兜底（`_debugSource`，React <= 18 dev）：属性链完全没命中（不透传 props 的组件、portal 场景）时从 fiber 树反查工作区源位置。
  - 拾取目标从 `HTMLElement` 放宽到 `Element`：svg / path 等图形元素也能被 Option 悬停与点选。
  - dock 与面板加 `pointer-events: auto`：宿主页面被 Radix 等 modal 浮层锁住 `body` 指针事件时不再失灵。

- Updated dependencies
  - @ai-ins/core@0.4.8

## 0.4.8

### Patch Changes

- Updated dependencies
  - @ai-ins/core@0.4.7

## 0.4.7

### Patch Changes

- Updated dependencies
  - @ai-ins/core@0.4.6

## 0.4.6

### Patch Changes

- Make Vite client injection compatible with WXT and other extension dev pages by using a module script `src`, resolving client middleware calls against `server.origin`, and registering middleware under the configured base path.

## 0.4.5

### Patch Changes

- Updated dependencies
  - @ai-ins/core@0.4.5

## 0.4.4

### Patch Changes

- Updated dependencies
  - @ai-ins/core@0.4.4

## 0.4.3

### Patch Changes

- Updated dependencies
  - @ai-ins/core@0.4.3

## 0.4.2

### Patch Changes

- Updated dependencies
  - @ai-ins/core@0.4.2

## 0.4.1

### Patch Changes

- Add author and GitHub package metadata across published packages, and refresh the `ai-ins` CLI package README.
- Updated dependencies
  - @ai-ins/core@0.4.1

## 0.4.0

### Minor Changes

- Add the new React-based panel runtime in core, expose runtime config for the client,
  and improve Vite/Webpack dev-server integration for custom roots and client reloads.

### Patch Changes

- Updated dependencies
  - @ai-ins/core@0.4.0

## 0.3.6

### Patch Changes

- Updated dependencies
  - @ai-ins/core@0.3.4

## 0.3.5

### Patch Changes

- Register AI Ins dev middleware under the configured Vite base path so client requests work when apps are served from a subpath.

## 0.3.4

### Patch Changes

- Release core and Vite packages alongside the CLI default init update.
- Updated dependencies
  - @ai-ins/core@0.3.3

## 0.3.3

### Patch Changes

- Improve editor command resolution on Windows and macOS, support shell-based editor commands on Windows, and allow Vite source attributes to be disabled for SSR hydration compatibility.
- Updated dependencies
  - @ai-ins/core@0.3.2

## 0.3.2

### Patch Changes

- 47ef2a8: Fix the published client runtime layout so `dist/client/style.css` is emitted at the path read by the runtime.

  Improve editor command resolution on Windows and macOS, and allow source attributes to be disabled when they conflict with framework SSR hydration.

- Updated dependencies [47ef2a8]
  - @ai-ins/core@0.3.1

## 0.3.1

### Patch Changes

- Updated dependencies
  - @ai-ins/core@0.3.0

## 0.3.0

### Minor Changes

- Add Svelte source attribute injection and expand Vite 8 support.

## 0.2.0

### Minor Changes

- 完成点选 dom 的跳转源码以及与 agent 交互的相关逻辑

### Patch Changes

- Updated dependencies
  - @ai-ins/core@0.2.0
