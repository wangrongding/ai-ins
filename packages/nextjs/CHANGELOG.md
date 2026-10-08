# @ai-ins/nextjs

## 0.1.11

### Patch Changes

- Updated dependencies [5df7279]
  - @ai-ins/core@0.4.10

## 0.1.10

### Patch Changes

- Updated dependencies
  - @ai-ins/core@0.4.9

## 0.1.9

### Patch Changes

- 组件级源定位：Option 点选不再只覆盖原生 DOM 标签。

  - JSX transform 现在也给组件元素（大写标识符与 `Foo.Bar` 成员表达式）注入 `data-ai-ins-source`：spread 透传型组件（Radix / shadcn 等 `{...props}` 直达 DOM 的包装，含 portal 到 `document.body` 的浮层）会把定位属性带到最终 DOM 上；注入改为 unshift，外层调用点透传的属性覆盖包装内部，点选定位到应用侧 JSX 而非组件库内部。跳过 Fragment 等 React 内建。
  - 客户端拾取新增 React fiber 兜底（`_debugSource`，React <= 18 dev）：属性链完全没命中（不透传 props 的组件、portal 场景）时从 fiber 树反查工作区源位置。
  - 拾取目标从 `HTMLElement` 放宽到 `Element`：svg / path 等图形元素也能被 Option 悬停与点选。
  - dock 与面板加 `pointer-events: auto`：宿主页面被 Radix 等 modal 浮层锁住 `body` 指针事件时不再失灵。

- Updated dependencies
  - @ai-ins/core@0.4.8

## 0.1.8

### Patch Changes

- Updated dependencies
  - @ai-ins/core@0.4.7

## 0.1.7

### Patch Changes

- Updated dependencies
  - @ai-ins/core@0.4.6

## 0.1.6

### Patch Changes

- Updated dependencies
  - @ai-ins/core@0.4.5

## 0.1.5

### Patch Changes

- Updated dependencies
  - @ai-ins/core@0.4.4

## 0.1.4

### Patch Changes

- Updated dependencies
  - @ai-ins/core@0.4.3

## 0.1.3

### Patch Changes

- Updated dependencies
  - @ai-ins/core@0.4.2

## 0.1.2

### Patch Changes

- Add author and GitHub package metadata across published packages, and refresh the `ai-ins` CLI package README.
- Updated dependencies
  - @ai-ins/core@0.4.1

## 0.1.1

### Patch Changes

- Updated dependencies
  - @ai-ins/core@0.4.0

## 0.1.0

### Minor Changes

- Add Next.js support with Webpack and Turbopack source markers, dev middleware rewrites, client runtime injection, CLI init detection, and a Next.js playground.
