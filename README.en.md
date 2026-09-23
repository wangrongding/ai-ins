# ai-ins

[Simplified Chinese](./README.md) | [English](./README.en.md)

AI Ins is a local development assistant that lets you stay inside your project window, select UI elements directly on the page, send change requests to a local CLI agent, and watch the task output without leaving the app.

It helps you:

- stop jumping around the file tree,
- stop copying component paths by hand,
- stop describing “please edit this button in that module...” from scratch,
- jump into unfamiliar projects faster,
- drive local agents such as Codex CLI, Claude Code CLI, Copilot CLI, Gemini CLI, and Cursor Agent CLI from the page itself.

Demo video:

https://github.com/user-attachments/assets/f909f905-3297-49da-8881-8b48689c015c

## Documentation

- [Repository overview (English)](./README.en.md)
- [仓库总览（中文）](./README.md)
- [CLI docs](./packages/cli/README.en.md)
- [CLI 文档](./packages/cli/README.md)
- [Vite plugin docs](./packages/vite/README.en.md)
- [Vite 插件文档](./packages/vite/README.md)
- [Webpack plugin docs](./packages/webpack/README.en.md)
- [Webpack 插件文档](./packages/webpack/README.md)
- [Next.js plugin docs](./packages/nextjs/README.en.md)
- [Next.js 插件文档](./packages/nextjs/README.md)
- [Core API docs](./packages/core/README.en.md)
- [Core API 文档](./packages/core/README.md)

## Quick start

For a project with a single bundler config, just run:

```bash
npx ai-ins
```

The CLI detects Vite, Webpack, or Next.js, installs the matching `@ai-ins/*` package, and tries to update your config automatically.

If the project has multiple candidate config files, specify the target up front:

```bash
npx ai-ins --bundler vite --config apps/web/vite.config.ts
npx ai-ins --bundler webpack --config build/webpack.dev.js
```

After integration:

- `Option` / `Alt` + click an element to open the AI Ins panel.
- macOS `Option + Cmd`, Windows / Linux `Ctrl + Alt` + click to jump to the source in your editor.
- submit edit requests from the panel and watch output in real time.

## What it supports

- auto-detects Next.js / Vite / Webpack and installs the matching package,
- supports `--config <path>` for multi-config repositories,
- refuses to guess when there are multiple bundlers or config candidates,
- injects the client into the dev server,
- tracks multiple agent runs in parallel,
- includes built-in Codex, Claude, Copilot, Gemini, and Cursor providers.

## Package status

| Package | Status | Notes |
| --- | --- | --- |
| `ai-ins` | ready | CLI entry for project setup |
| `@ai-ins/vite` | ready | Vite plugin with client injection and source attribution |
| `@ai-ins/webpack` | ready | Webpack devServer plugin with source injection |
| `@ai-ins/nextjs` | ready | Next.js adapter for Webpack and Turbopack |
| `@ai-ins/core` | internal | shared middleware, providers, and client generation |

## Agent integration rules

If a user says “integrate ai-ins”, an agent should:

1. detect whether the project uses Next.js, Vite, or Webpack,
2. check whether there are multiple config files,
3. use `npx ai-ins --bundler <bundler>` for single-config projects,
4. use `npx ai-ins --bundler <bundler> --config <path>` for multi-config projects,
5. fall back to manual integration if the CLI cannot safely rewrite the config,
6. keep `aiIns()` before framework plugins in Vite,
7. ensure Next.js projects import `@ai-ins/nextjs/client` from `instrumentation-client.ts` or `.js`.

## Agent configuration

Built-in providers: `codex`, `claude`, `copilot`, `gemini`, `cursor`.

Example:

```ts
aiIns({
  agents: {
    defaultProvider: 'codex',
  },
})
```

## Development

```bash
pnpm install
pnpm dev:watch
pnpm dev:nextjs
pnpm dev:webpack
pnpm typecheck
pnpm build
```

## Workspace layout

```txt
packages/cli
packages/core
packages/vite
packages/webpack
packages/nextjs
examples/ai-ins-panel-react
examples/vite-react
examples/vite-vue3
examples/vite-solidjs
examples/vite-svelte
examples/nextjs-react
examples/webpack-react
```
