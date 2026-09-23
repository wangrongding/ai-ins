# @ai-ins/vite

[Simplified Chinese](./README.md) | [English](./README.en.md)

`@ai-ins/vite` is the Vite plugin for AI Ins. It injects the client during development and adds source location metadata to JSX, Vue, and Svelte elements.

## Install

```bash
pnpm add -D @ai-ins/vite
npm install -D @ai-ins/vite
yarn add -D @ai-ins/vite
```

## Minimal example

```ts
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import aiIns from '@ai-ins/vite'

export default defineConfig({
  plugins: [
    aiIns(),
    react(),
  ],
})
```

Keep `aiIns()` before React / Vue / Svelte framework plugins.

## What it does

- registers `__ai-ins`, `__ai-ins-agent`, and editor-related middleware routes,
- injects the AI Ins client into the page,
- adds source attributes to workspace `.jsx`, `.tsx`, `.vue`, and `.svelte` files,
- exposes available local agent providers to the panel.

## Common options

| Option | Description |
| --- | --- |
| `root` | Project root AI Ins may inspect. Defaults to Vite `config.root`. |
| `proxy` | Shared proxy for all providers. |
| `disableSourceAttributes` | Disable source attribute injection. |
| `agents.defaultProvider` | Default provider selected in the panel. |
| `agents.providers` | Add or override built-in providers. |
| `codex` / `claude` / `copilot` / `gemini` / `cursor` | Override CLI command, model, or proxy settings. |
