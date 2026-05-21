# @ai-ins/core

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
