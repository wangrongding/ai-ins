# @ai-ins/vite

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
